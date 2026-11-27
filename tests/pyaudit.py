"""Audita o Python do worker: registra toda tentativa de conexao ou resolucao de nome
feita pelo codigo Python ao carregar o rembg e remover um fundo com um modelo ja baixado.

uso: python -I -B tests/pyaudit.py python/worker.py <imagem>
"""
import json, os, runpy, sys

events = []


def hook(name, args):
    if name in ("socket.connect", "socket.getaddrinfo", "socket.gethostbyname", "socket.sendto", "urllib.Request"):
        events.append((name, str(args[-1] if name == "socket.connect" else args[0])[:120]))


sys.addaudithook(hook)
worker = runpy.run_path(sys.argv[1], run_name="audit")
out = os.path.join(os.environ.get("TEMP", "."), "rembg-studio-pyaudit.png")
worker["cmd_process"]({"jobId": "x", "input": sys.argv[2], "output": out, "model": "isnet-general-use", "options": {}})
loaded = sorted({m.split(".")[0] for m in sys.modules} & {"gradio", "huggingface_hub", "uvicorn", "fastapi", "requests", "httpx", "pooch"})
print("AUDIT " + json.dumps({"networkEvents": events, "networkRelatedModulesLoaded": loaded, "ortTelemetryEnv": os.environ.get("ORT_DISABLE_TELEMETRY")}), file=sys.stderr)
