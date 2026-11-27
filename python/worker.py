"""Rembg Studio worker.

Processo Python local que usa o rembg ja instalado (ambiente uv com Python 3.12).
Fala com o app Electron por JSON, uma mensagem por linha, em stdin/stdout.
Nao abre porta de rede e nao envia imagens para lugar nenhum.

Dois trilhos de trabalho:
  * "infer": fila sequencial para tudo que usa o modelo (remover fundo,
    teste de GPU). So um modelo carregado por vez, para poupar a VRAM.
  * "light": leitura de imagens, miniaturas e diagnostico, para a interface
    continuar respondendo enquanto uma imagem grande e processada.
"""

from __future__ import annotations

import gc
import json
import os
import queue
import sys
import threading
import time
import traceback

# ---------------------------------------------------------------------------
# Protocolo: guardamos o stdout real so para mensagens JSON e mandamos qualquer
# outro print (bibliotecas, barras de progresso, logs do C++) para o stderr.
# ---------------------------------------------------------------------------
_proto = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr
_send_lock = threading.Lock()


def send(msg: dict) -> None:
    line = json.dumps(msg, ensure_ascii=False)
    with _send_lock:
        _proto.write(line + "\n")
        _proto.flush()


from PIL import Image, ImageOps, UnidentifiedImageError  # noqa: E402

# Imagens muito grandes sao aceitas, mas nao arquivos absurdos que travariam o PC.
Image.MAX_IMAGE_PIXELS = 250_000_000

BROWSER_FORMATS = {"PNG", "JPEG", "WEBP", "BMP", "GIF"}
ACCEPTED_FORMATS = {"PNG", "JPEG", "WEBP", "BMP", "TIFF", "MPO"}

# Modelos que dependem de arquivo proprio, de pontos marcados ou de nuvem.
EXCLUDED_MODELS = {"u2net_custom", "dis_custom", "ben_custom", "sam"}


# ---------------------------------------------------------------------------
# Utilidades de imagem
# ---------------------------------------------------------------------------
def to_8bit(img: Image.Image) -> Image.Image:
    """Converte modos exoticos (16 bits, float, paleta, CMYK) para RGB/RGBA."""
    if img.mode in ("RGB", "RGBA"):
        return img
    if img.mode in ("I;16", "I;16B", "I;16L", "I", "F"):
        import numpy as np

        arr = np.asarray(img, dtype="float64")
        hi = float(arr.max()) or 1.0
        arr = (arr / hi * 255.0).clip(0, 255).astype("uint8")
        return Image.fromarray(arr, "L").convert("RGB")
    has_alpha = img.mode in ("LA", "PA", "RGBa", "La") or (
        img.mode == "P" and "transparency" in img.info
    )
    return img.convert("RGBA" if has_alpha else "RGB")


def open_image(path: str) -> Image.Image:
    if not os.path.isfile(path):
        raise FileNotFoundError("Arquivo não encontrado.")
    try:
        with Image.open(path) as probe:
            # o Pillow apenas avisa entre 1x e 2x do limite; recusamos antes de decodificar
            too_big = probe.width * probe.height > Image.MAX_IMAGE_PIXELS
            if not too_big:
                probe.verify()
        if too_big:
            raise ValueError("Imagem grande demais (mais de 250 megapixels).")
        img = Image.open(path)
        fmt = img.format
        if fmt not in ACCEPTED_FORMATS:
            raise ValueError(f"Formato não suportado ({fmt}).")
        img.seek(0)
        img.load()
    except Image.DecompressionBombError:
        raise ValueError("Imagem grande demais (mais de 250 megapixels).")
    except (UnidentifiedImageError, OSError, SyntaxError) as e:
        raise ValueError("Arquivo corrompido ou não é uma imagem válida.") from e
    img = ImageOps.exif_transpose(img)
    img.info["_format"] = fmt
    return img


def atomic_save_png(img: Image.Image, path: str, icc_profile: bytes | None = None) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    extra = {"icc_profile": icc_profile} if icc_profile else {}
    img.save(tmp, "PNG", compress_level=6, **extra)
    os.replace(tmp, path)


def make_thumb(img: Image.Image, path: str, size: int = 256) -> None:
    t = img.copy()
    t.thumbnail((size, size), Image.Resampling.LANCZOS)
    atomic_save_png(t, path)


# ---------------------------------------------------------------------------
# Ambiente / modelos
# ---------------------------------------------------------------------------
_rembg_mod = None
_cuda_dll_dirs: list | None = None


def add_cuda_dll_dirs() -> list:
    """No Windows, os pacotes `nvidia-*` do pip guardam as DLLs do CUDA em
    site-packages\\nvidia\\**\\bin, que o onnxruntime nao procura sozinho.
    Acrescentamos essas pastas ao PATH somente deste processo; nada no ambiente
    Python e alterado."""
    global _cuda_dll_dirs
    if _cuda_dll_dirs is None:
        root = os.path.join(sys.prefix, "Lib", "site-packages", "nvidia")
        found = []
        if os.name == "nt" and os.path.isdir(root):
            for folder, _, files in os.walk(root):
                parts = os.path.relpath(folder, root).lower().split(os.sep)
                if "bin" in parts and any(f.lower().endswith(".dll") for f in files):
                    found.append(folder)
        if found:
            os.environ["PATH"] = os.pathsep.join(found + [os.environ.get("PATH", "")])
        _cuda_dll_dirs = found
    return _cuda_dll_dirs


def rembg_modules():
    global _rembg_mod
    if _rembg_mod is None:
        add_cuda_dll_dirs()
        # telemetria do ONNX Runtime desligada somente neste processo
        os.environ["ORT_DISABLE_TELEMETRY"] = "1"
        import onnxruntime as ort

        try:
            ort.disable_telemetry_events()
        except Exception:  # noqa: BLE001
            pass
        import rembg
        from rembg import bg, matting
        from rembg.sessions import sessions

        _rembg_mod = (ort, rembg, bg, matting, sessions)
    return _rembg_mod


def fp16_supported() -> bool:
    try:
        import onnx  # noqa: F401
        import onnxconverter_common  # noqa: F401

        return True
    except Exception:
        return False


def list_models() -> list:
    _, _, _, _, sessions = rembg_modules()
    out = []
    fp16 = fp16_supported()
    for name, cls in sessions.items():
        if name in EXCLUDED_MODELS:
            continue
        if not cls.is_local() or cls.requires_credentials():
            continue
        if name.endswith("-fp16") and not fp16:
            continue
        path = cls.resolve_existing(f"{name}.onnx")
        out.append(
            {
                "name": name,
                "downloaded": path is not None,
                "path": path,
                "sizeBytes": os.path.getsize(path) if path else None,
            }
        )
    return out


def env_info() -> dict:
    from importlib import metadata

    ort, rembg, _, matting, sessions = rembg_modules()
    any_cls = next(iter(sessions.values()))
    vit = []
    for variant, spec in matting.VARIANTS.items():
        p = matting._ViTMatteFiles.resolve_existing(spec["fname"])
        vit.append({"variant": variant, "downloaded": p is not None})

    def ver(pkg):
        try:
            return metadata.version(pkg)
        except Exception:
            return None

    return {
        "python": sys.version.split()[0],
        "pythonExecutable": sys.executable,
        "prefix": sys.prefix,
        "rembgVersion": ver("rembg"),
        "onnxruntimeVersion": ort.__version__,
        "onnxruntimeGpu": ver("onnxruntime-gpu") is not None,
        "availableProviders": ort.get_available_providers(),
        "ortDevice": ort.get_device(),
        "cudaDllDirs": len(add_cuda_dll_dirs()),
        "modelsDir": os.path.join(any_cls.rembg_home(), "models"),
        "models": list_models(),
        "vitmatte": vit,
    }


# ---------------------------------------------------------------------------
# Sessoes (um modelo carregado por vez)
# ---------------------------------------------------------------------------
class SessionCache:
    def __init__(self) -> None:
        self.key = None
        self.session = None
        self.providers: list = []

    def unload(self) -> None:
        self.session = None
        self.key = None
        self.providers = []
        try:
            _, _, _, matting, _ = rembg_modules()
            matting._sessions.clear()
        except Exception:
            pass
        gc.collect()

    def get(self, model: str, device: str, job_id=None):
        key = (model, device)
        if self.key == key and self.session is not None:
            return self.session, False
        ort, _, _, _, sessions = rembg_modules()
        if model not in sessions or model in EXCLUDED_MODELS:
            raise ValueError(f"Modelo desconhecido: {model}")
        self.unload()
        cls = sessions[model]
        if cls.resolve_existing(f"{model}.onnx") is None:
            send({"type": "progress", "jobId": job_id, "stage": "downloading", "model": model})
        else:
            send({"type": "progress", "jobId": job_id, "stage": "loading", "model": model})

        if device == "cpu" or "CUDAExecutionProvider" not in ort.get_available_providers():
            providers = ["CPUExecutionProvider"]
        else:
            # kSameAsRequested + HEURISTIC: evita que a arena da GPU cresca alem
            # do necessario; com a VRAM disputada isso deixou os modelos grandes
            # varias vezes mais rapidos nos testes desta maquina.
            providers = [
                (
                    "CUDAExecutionProvider",
                    {
                        "arena_extend_strategy": "kSameAsRequested",
                        "cudnn_conv_algo_search": "HEURISTIC",
                    },
                ),
                "CPUExecutionProvider",
            ]
        sess_opts = ort.SessionOptions()
        sess_opts.log_severity_level = 3
        self.session = cls(model, sess_opts, providers=providers)
        self.key = key
        self.providers = self.session.inner_session.get_providers()
        return self.session, True


SESSIONS = SessionCache()


def device_label(providers: list) -> str:
    if any(p.startswith("CUDA") or p.startswith("Tensorrt") for p in providers):
        return "gpu"
    return "cpu"


def build_remove_kwargs(opts: dict) -> dict:
    def clamp_int(v, lo, hi, default):
        try:
            return max(lo, min(hi, int(v)))
        except Exception:
            return default

    kw = {
        "alpha_matting": bool(opts.get("alphaMatting", False)),
        "alpha_matting_foreground_threshold": clamp_int(opts.get("fgThreshold"), 0, 255, 240),
        "alpha_matting_background_threshold": clamp_int(opts.get("bgThreshold"), 0, 255, 10),
        "alpha_matting_erode_size": clamp_int(opts.get("erodeSize"), 0, 60, 10),
        "post_process_mask": bool(opts.get("postProcessMask", False)),
        "decontaminate": bool(opts.get("decontaminate", False)),
        "only_mask": bool(opts.get("onlyMask", False)),
        "vitmatte": bool(opts.get("vitmatte", False)),
    }
    variant = opts.get("vitmatteModel")
    if kw["vitmatte"]:
        _, _, _, matting, _ = rembg_modules()
        kw["vitmatte_model"] = variant if variant in matting.VARIANTS else None
    return kw


# Medido nesta maquina: o alpha matting (pymatting, na CPU e em resolucao cheia)
# usou cerca de 0,35 GB de memoria por megapixel (4,2 GB a mais em 12 MP).
MATTING_MAX_MP = 25.0
MATTING_GB_PER_MP = 0.4


def available_ram_gb():
    try:
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
                (n, ctypes.c_ulonglong)
                for n in ("total", "avail", "totalPage", "availPage", "totalVirt", "availVirt", "ext")
            ]

        m = MemoryStatus()
        m.length = ctypes.sizeof(m)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
            return None
        return m.avail / 2**30
    except Exception:  # noqa: BLE001
        return None


def check_matting_size(width: int, height: int) -> None:
    mp = width * height / 1e6
    limit = MATTING_MAX_MP
    avail = available_ram_gb()
    if avail is not None:
        limit = min(limit, max(1.0, (avail - 2.0) / MATTING_GB_PER_MP))
    if mp > limit:
        raise ValueError(
            f"Imagem grande demais para o alpha matting ({mp:.0f} MP; limite agora: {limit:.0f} MP, "
            "conforme a memória livre). Desligue o refinamento de bordas nesta imagem ou use o ViTMatte."
        )


# ---------------------------------------------------------------------------
# Comandos
# ---------------------------------------------------------------------------
def cmd_process(req: dict) -> None:
    job_id = req["jobId"]
    t0 = time.perf_counter()
    try:
        img = open_image(req["input"])
        fmt = img.info.get("_format")
        # o perfil de cor so continua valido se os pixels ja eram RGB (nao CMYK/cinza)
        icc = img.info.get("icc_profile") if img.mode in ("RGB", "RGBA", "P") else None
        img = to_8bit(img)
        opts = req.get("options") or {}
        if opts.get("alphaMatting") and not opts.get("vitmatte") and not opts.get("onlyMask"):
            check_matting_size(*img.size)
        model = str(req.get("model", "isnet-general-use"))
        device = "cpu" if req.get("device") == "cpu" else "auto"
        session, loaded = SESSIONS.get(model, device, job_id)
        load_ms = int((time.perf_counter() - t0) * 1000) if loaded else 0
        _, _, bg, _, _ = rembg_modules()
        kwargs = build_remove_kwargs(req.get("options") or {})
        refine = kwargs.get("vitmatte") or kwargs.get("alpha_matting")
        send({"type": "progress", "jobId": job_id, "stage": "refining" if refine else "inferring"})
        t1 = time.perf_counter()
        out = bg.remove(img, session=session, **kwargs)
        infer_ms = int((time.perf_counter() - t1) * 1000)
        send({"type": "progress", "jobId": job_id, "stage": "saving"})
        if out.mode not in ("RGBA", "L"):
            out = out.convert("RGBA")
        atomic_save_png(out, req["output"], icc if out.mode == "RGBA" else None)
        if req.get("thumb"):
            make_thumb(out, req["thumb"])
        send(
            {
                "type": "done",
                "jobId": job_id,
                "width": out.width,
                "height": out.height,
                "sourceFormat": fmt,
                "inferMs": infer_ms,
                "loadMs": load_ms,
                "totalMs": int((time.perf_counter() - t0) * 1000),
                "providers": SESSIONS.providers,
                "device": device_label(SESSIONS.providers),
                "hasAlpha": out.mode == "RGBA",
            }
        )
    except Exception as e:  # noqa: BLE001
        send({"type": "error", "jobId": job_id, "error": friendly_error(e), "detail": traceback.format_exc()[-2000:]})


def friendly_error(e: Exception) -> str:
    msg = str(e) or e.__class__.__name__
    low = msg.lower()
    if "out of memory" in low or "failed to allocate" in low or "cudaerrormemoryallocation" in low:
        return "A memória da placa de vídeo acabou. Tente um modelo mais leve, feche programas que usam a GPU ou use a CPU."
    if "urlopen" in low or "connection" in low or "httperror" in low or "timed out" in low:
        return "Não foi possível baixar o modelo. Verifique a internet (só o arquivo do modelo é baixado, nenhuma imagem sai do PC)."
    return msg


def cmd_gpu_test(req: dict) -> None:
    rid = req["id"]
    try:
        ort, _, bg, _, sessions = rembg_modules()
        model = req.get("model") or "isnet-general-use"
        if sessions[model].resolve_existing(f"{model}.onnx") is None:
            raise ValueError(f"O modelo {model} ainda não foi baixado.")
        session, _ = SESSIONS.get(model, "auto", None)
        img = Image.new("RGB", (640, 480), (200, 80, 60))
        bg.remove(img, session=session)  # aquecimento
        t = time.perf_counter()
        bg.remove(img, session=session)
        ms = int((time.perf_counter() - t) * 1000)
        send({"type": "result", "id": rid, "ok": True, "data": {
            "model": model,
            "providers": SESSIONS.providers,
            "device": device_label(SESSIONS.providers),
            "inferMs": ms,
            "availableProviders": ort.get_available_providers(),
        }})
    except Exception as e:  # noqa: BLE001
        send({"type": "result", "id": rid, "ok": False, "error": friendly_error(e)})


def cmd_download(req: dict) -> None:
    rid = req["id"]
    try:
        _, _, _, _, sessions = rembg_modules()
        model = req["model"]
        if model not in sessions or model in EXCLUDED_MODELS:
            raise ValueError("Modelo desconhecido.")
        sessions[model].download_models()
        send({"type": "result", "id": rid, "ok": True, "data": {"models": list_models()}})
    except Exception as e:  # noqa: BLE001
        send({"type": "result", "id": rid, "ok": False, "error": friendly_error(e)})


def cmd_probe(req: dict) -> dict:
    path = req["path"]
    img = open_image(path)
    fmt = img.info.get("_format")
    w, h = img.size
    view = to_8bit(img)
    make_thumb(view, req["thumb"])
    preview = None
    if fmt not in BROWSER_FORMATS or img.mode not in ("RGB", "RGBA", "L", "P", "LA"):
        atomic_save_png(view, req["preview"])
        preview = req["preview"]
    return {
        "width": w,
        "height": h,
        "format": fmt,
        "mode": img.mode,
        "sizeBytes": os.path.getsize(path),
        "preview": preview,
    }


def light_dispatch(req: dict) -> None:
    rid = req.get("id")
    cmd = req.get("cmd")
    try:
        if cmd == "probe":
            data = cmd_probe(req)
        elif cmd == "env":
            data = env_info()
        elif cmd == "models":
            data = list_models()
        elif cmd == "thumb":
            make_thumb(to_8bit(open_image(req["path"])), req["thumb"])
            data = {}
        else:
            raise ValueError(f"comando desconhecido: {cmd}")
        send({"type": "result", "id": rid, "ok": True, "data": data})
    except Exception as e:  # noqa: BLE001
        send({"type": "result", "id": rid, "ok": False, "error": friendly_error(e)})


def infer_dispatch(req: dict) -> None:
    cmd = req.get("cmd")
    if cmd == "process":
        cmd_process(req)
    elif cmd == "gpu_test":
        cmd_gpu_test(req)
    elif cmd == "download":
        cmd_download(req)
    elif cmd == "unload":
        SESSIONS.unload()
        send({"type": "result", "id": req.get("id"), "ok": True, "data": {}})


def worker_loop(q: "queue.Queue", fn) -> None:
    while True:
        req = q.get()
        if req is None:
            return
        try:
            fn(req)
        except Exception:  # noqa: BLE001
            traceback.print_exc()


def main() -> None:
    # No Windows, importar numpy/onnxruntime numa thread enquanto a principal
    # esta bloqueada lendo o pipe do stdin trava o import. Carregamos tudo aqui,
    # antes de comecar a ler comandos.
    t = time.perf_counter()
    try:
        rembg_modules()
        import numpy  # noqa: F401
        import scipy.ndimage  # noqa: F401
        import pymatting  # noqa: F401
    except Exception as e:  # noqa: BLE001
        send({"type": "fatal", "error": f"Não foi possível carregar o rembg: {e}"})
        os._exit(2)
    import_ms = int((time.perf_counter() - t) * 1000)

    infer_q: "queue.Queue" = queue.Queue()
    light_q: "queue.Queue" = queue.Queue()
    threading.Thread(target=worker_loop, args=(infer_q, infer_dispatch), daemon=True).start()
    for _ in range(2):
        threading.Thread(target=worker_loop, args=(light_q, light_dispatch), daemon=True).start()

    send({"type": "ready", "pid": os.getpid(), "python": sys.version.split()[0], "importMs": import_ms})

    for raw in sys.stdin.buffer:
        line = raw.decode("utf-8", "replace").strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        cmd = req.get("cmd")
        if cmd == "shutdown":
            break
        if cmd in ("process", "gpu_test", "download", "unload"):
            infer_q.put(req)
        else:
            light_q.put(req)
    os._exit(0)


if __name__ == "__main__":
    main()
