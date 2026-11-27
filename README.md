<p align="center">
  <img src="docs/banner.png" alt="Rembg Studio: background removal on your own PC" width="100%">
</p>

# Rembg Studio

A Windows desktop app for background removal using [rembg](https://github.com/danielgatis/rembg), with GPU
acceleration and batch processing. Drop images in, compare before and after, and export transparent PNGs.
Images are processed on your computer and are not uploaded anywhere.

**English** · [Português (Brasil)](README.pt-BR.md)

[Privacy policy](PRIVACY.md) · [Usage notes](TERMS.md) · [Model licenses](MODEL_LICENSES.md) · [Code signing policy](CODE_SIGNING_POLICY.md)

> **The app's interface is in Brazilian Portuguese only.**
>
> **rembg is not bundled.** You install it once (see [Install](#install)); the app finds it and uses it.

## Features

- Drag and drop files or a folder (first level only), or use the file picker. PNG, JPEG, WebP, BMP and TIFF.
- Before/after slider, original and result views, zoom, pan, fit to screen.
- Preview backgrounds (checkerboard, black, white, gray). They never change the exported file.
- Batch view with thumbnails, resolution, size, model, status, time and result. One image is processed at a
  time, with one model loaded at a time.
- Cancel, retry and reprocess with another model.
- Model picker built from what your rembg installation reports.
- Advanced options: alpha matting, ViTMatte edge refinement, mask clean-up, color halo removal, mask-only export.
- PNG export with transparency. The embedded color profile (ICC) is kept for RGB sources.
- Output folder, file name pattern, per-image rename, auto-save. Existing files are not replaced without asking.
- Recent items history (thumbnails and file paths, not copies of your images).
- Diagnostics page with a real GPU test.
- Manual in-app updates from the official GitHub releases, with progress, cancel and SHA-256 verification.

## Screenshots

| Before / after | Batch |
|---|---|
| ![Workspace with the before/after slider](docs/screenshots/workspace.png) | ![Batch queue](docs/screenshots/batch.png) |
| **Models** | **Recent items** |
| ![Model list](docs/screenshots/models.png) | ![History](docs/screenshots/recents.png) |
| **Settings** | **Start screen** |
| ![Settings](docs/screenshots/settings.png) | ![Empty state](docs/screenshots/empty.png) |

## Requirements

- Windows 64-bit. **Tested only on Windows 11 Pro (build 26300).**
- rembg installed in a [uv](https://docs.astral.sh/uv/) tool environment (or another Python environment you point
  the app to). rembg 2.0.88 requires Python 3.11 or newer; the tested setup uses Python 3.12.
- For GPU acceleration: an NVIDIA GPU with a recent driver. **Tested only on an RTX 5060 Ti (16 GB),
  driver 621.x.** AMD and Intel GPU acceleration is not supported or tested.
- Disk space for models (the three used in testing take about 1.4 GB).

## Install

### 1. Install rembg

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), for example:

```powershell
winget install astral-sh.uv
```

Then install **one** of the two variants.

NVIDIA GPU (downloads over 1 GB of CUDA libraries). These are the versions this app was tested with:

```powershell
uv tool install "rembg[gpu,cli]==2.0.88" --python 3.12 --with "onnxruntime-gpu[cuda,cudnn]==1.32.0"
```

CPU only (this package variant has not been tested with the app):

```powershell
uv tool install "rembg[cpu,cli]==2.0.88" --python 3.12
```

### 2. Get the app

From the [Releases](../../releases) page, pick one:

| File | What it is |
|---|---|
| `RembgStudio-Setup-1.1.0.exe` | Installer (per user, you choose the folder). **Not tested yet.** |
| `RembgStudio-1.1.0-portatil.exe` | Single portable file. It unpacks on every launch, so it starts a bit slower. |
| `RembgStudio-1.1.0-win-x64.zip` | Extract anywhere and run `Rembg Studio.exe`. |

The builds are **not code-signed**, so Windows SmartScreen may warn you. Verify your download against
`SHA256SUMS.txt`:

```powershell
Get-FileHash .\RembgStudio-1.1.0-portatil.exe -Algorithm SHA256
```

### 3. First run

The app looks for `%APPDATA%\uv\tools\rembg\Scripts\python.exe`, then asks `uv tool dir`. If rembg lives
somewhere else, open **Configurações → Diagnóstico → Escolher python.exe…**.

> Only choose a `python.exe` you trust: the app runs it.

## Updating

Open **Sobre** (About) → **Verificar atualizações**. Nothing is checked automatically. The app looks only at the
latest published, stable release of this repository (drafts, pre-releases and older versions are ignored),
downloads the file that matches your installation, checks its size and its SHA-256 against `SHA256SUMS.txt` (and
GitHub's own digest when present), and asks before doing anything.

| You use | What the update does |
|---|---|
| Portable `.exe` | Copies the new `.exe` **next to** the current one, starts it and closes the old one. The old file is kept; delete it when you like. Shortcuts that point to the old file must be updated by you. |
| Installer | Opens the new installer and closes the app. Follow the installer. |
| ZIP folder | Saves the new ZIP where you choose. Extract it to a new folder yourself. |

Only the app is updated: Python, rembg, CUDA, drivers, models, settings, history and your files are left alone.
Unsaved results are lost when the app restarts (you are warned), and installing is refused while the queue is busy.
Version 1.0.0 has no updater, so moving from it to 1.1.0 is a manual download.

Limits: the checksums come from the same release as the files, so they catch damaged downloads but do **not** prove
authorship if the repository or account were compromised. Builds are not signed yet. Once a signed version is in
use, the updater also requires a valid signature from the same signer. The updater has never been run against a real
published release (see [Status and testing](#status-and-testing)).

### Uninstalling

Installer: **Windows Settings → Apps → Rembg Studio → Uninstall**. Portable or ZIP: delete the files. In every case
your data stays in `%APPDATA%\Rembg Studio` until you delete that folder; models stay in
`%USERPROFILE%\.rembg`.

## Models

With the default `gpu,cli` extras, rembg 2.0.88 exposes **16 local models** that the app lists:

`isnet-general-use` (default) · `isnet-anime` · `u2net` · `u2netp` · `u2net_human_seg` · `u2net_cloth_seg` ·
`silueta` · `birefnet-general` · `birefnet-general-lite` · `birefnet-portrait` · `birefnet-dis` ·
`birefnet-hrsod` · `birefnet-cod` · `birefnet-massive` · `birefnet-dynamic` · `bria-rmbg`

`birefnet-general-fp16` appears only if rembg's `fp16` extra is installed (not tested). Models that need your own
file or point prompts (`u2net_custom`, `dis_custom`, `ben_custom`, `sam`) and cloud services (`withoutbg`,
`atlascloud`) are intentionally left out.

**Only `isnet-general-use`, `birefnet-general-lite` and `bria-rmbg` were run during testing.** The speed and
quality bars in the app are rough, subjective ratings, not benchmarks. `u2net_cloth_seg` returns three cutouts
stacked vertically (upper body, lower body, full), so the before/after slider is not available for it.

### Downloading more models

A missing model is downloaded the first time you use it, or from the **Modelos** page (download button). From a
terminal:

```powershell
rembg d isnet-anime
```

Models are stored in `%USERPROFILE%\.rembg\models`. Downloads come from the URLs defined by rembg.
Downloading from inside the app has not been tested.

### Model licenses: read before using results commercially

**No model is included in this project or its releases.** Model weights have their own licenses, independent of
rembg's MIT license and of this app's MIT license. The table reports what the upstream pages stated when checked
on 2026-11-27. It is not legal advice.

| Model | Upstream | Code license | Weights license |
|---|---|---|---|
| `bria-rmbg` (RMBG 2.0) | [briaai/RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) | not applicable | ⚠️ **Non-commercial only** (CC BY-NC 4.0 in the model card; tagged `bria-rmbg-2.0`). **Commercial use requires an agreement with BRIA.** |
| `birefnet-*` | [ZhengPeng7/BiRefNet](https://github.com/ZhengPeng7/BiRefNet) | MIT | MIT on the main [Hugging Face page](https://huggingface.co/ZhengPeng7/BiRefNet); variant pages were not checked |
| `u2net`, `u2netp`, `u2net_human_seg` | [xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net) | Apache-2.0 | not stated |
| `silueta` | [U-2-Net issue 295](https://github.com/xuebinqin/U-2-Net/issues/295) (link given by rembg) | not verified | not stated / not verified |
| `u2net_cloth_seg` | [levindabhi/cloth-segmentation](https://github.com/levindabhi/cloth-segmentation) | MIT | not stated |
| `isnet-general-use` | [xuebinqin/DIS](https://github.com/xuebinqin/DIS) | Apache-2.0 | not stated; the DIS5K dataset has separate terms (not reviewed) |
| `isnet-anime` | [SkyTNT/anime-segmentation](https://github.com/SkyTNT/anime-segmentation) | Apache-2.0 | not stated in the repository README |
| ViTMatte (optional refinement) | [hustvl/ViTMatte](https://github.com/hustvl/ViTMatte) | MIT | not stated |

"Not stated" does **not** mean "free to use". Check with the authors if it matters for your work.

## Limitations

- **Alpha matting** runs on the CPU at full resolution and uses a lot of RAM: about 4 GB extra for a 12 MP
  image on the test machine (roughly 0.35 GB per megapixel). The app refuses images **over 25 MP**, or a lower
  limit when little RAM is free, instead of letting the PC stall. ViTMatte is not covered by this limit.
- Images over 250 megapixels are rejected.
- Only the first frame of multi-frame files is processed. 16-bit images are converted to 8-bit.
- Exported PNGs do **not** keep EXIF metadata. The ICC profile is kept only when the source is RGB; CMYK
  sources are converted without color management.
- **Results you have not saved are lost when you close the app:** the temporary cache is deleted the next time it
  starts (until then the files remain under `%APPDATA%\Rembg Studio\cache`). Turn on auto-save to keep them.
- Cancelling restarts the rembg process, so the next image reloads the model.
- The queue holds up to 1000 images and the history up to 300 entries.

## Privacy and local data

Images are processed on your computer. The app has no accounts, analytics or ads, and the maintainer receives no
data. It uses the network only when you ask: checking or downloading an update, and rembg downloading a model you
chose. It asks ONNX Runtime to disable telemetry in the process it starts. History, **file paths** and **thumbnails
of results** are stored unencrypted in `%APPDATA%\Rembg Studio`. Details, measurements and their limits are in the
[privacy policy](PRIVACY.md).

## Code signing policy

Builds are **not code-signed** and no signing application has been approved. See the
[code signing policy](CODE_SIGNING_POLICY.md).

## Status and testing

Version 1.1.0, one test machine (see Requirements).

**Tested on the packaged app with the real rembg installation and GPU** (`tests/e2e.mjs`, 33 checks): start-up,
import in the five formats, removal and transparency, protection of originals, batch processing, existing-file
handling and naming, three models (`isnet-general-use`, `birefnet-general-lite`, `bria-rmbg`) and the BRIA notice,
the GPU test, forced CPU mode, mask options and alpha matting, both size limits, ICC profile, invalid files,
cancel, a killed rembg process, history, settings persistence, no leftover Python processes, and a setup where rembg
cannot be found.

**Updater** (`tests/update-e2e.mjs`, 39 checks against packaged builds):
- *Real:* the portable 1.1.0 downloaded a locally served 1.2.0 test build, verified it, started it and exited;
  the old file, settings, history and a saved result were unchanged, and no Python process was left. The rembg
  environment, uv's Python, the models, the real app data folder, the CUDA path file and the driver version were
  unchanged (file lists, sizes and timestamps).
- *Simulated:* the update server (no newer version, older version, draft, pre-release, wrong tag or architecture,
  rate limit, server and network errors, cancel, cut or short download, wrong or missing checksum, digest mismatch,
  invalid file, foreign URL or redirect, tampered file) and native dialogs, including the confirmation in the real
  portable test.
- *Real GitHub:* the packaged app's update check, which reported no published release. The asset fields the
  updater relies on and the download redirect hosts were also compared, with `curl`, against another published
  release; the app itself has never downloaded from a published release.

**Pure update rules:** `tests/unit.mjs`.

**Other simulations:** open/save dialogs are stubbed; drag and drop is injected through Chrome DevTools Protocol.

**Not tested:** the installer, including updating an installed copy (only the app side was exercised, with the
installer never run); downloading from a real published release, including GitHub's CDN redirects; signature
checking with a signed build; the release workflow; the ZIP and portable downloaded from GitHub; ViTMatte;
downloading a model from the app; the other 13 models; some batch buttons; choosing another `python.exe`; keyboard
shortcuts; the "follow Windows" theme; CPU-only installs; other computers, GPUs or Windows versions.

## Build from source

Requires Node.js 22.12 or newer.

```powershell
git clone https://github.com/odavyyy/rembg-studio.git
cd rembg-studio
npm ci
npm start
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload, plus Electron. Restart after changing `electron/`. |
| `npm run build` | Type-check and build. |
| `npm run dist` | Build the installer, portable `.exe` and ZIP into `release/`. |
| `npm run notices` | Regenerate `THIRD_PARTY_NOTICES.md`. |
| `npm run art` | Re-render `docs/banner.png` from `docs/art/banner.html`. |
| `node tests/e2e.mjs <empty-folder>` | End-to-end tests. Pass a packaged `.exe` as a second argument to test it. |
| `node tests/unit.mjs` | Update rules (no GPU needed). |
| `node tests/update-e2e.mjs <empty-folder> release <next-portable.exe>` | Updater tests on packaged builds. Build the second portable with `node scripts/dist.mjs --app-version=1.2.0 --output=release-next --targets=portable`. |
| `node tests/netaudit.mjs <empty-folder>` | Observe the app's network use. |

- If the Electron binary is missing after `npm ci`, run `node node_modules/electron/install.js`.
- **Long paths:** NSIS fails with `!include: could not open file` when the project path is long. Build from a
  short folder such as `C:\src\rembg-studio`.
- `npm audit` reports moderate advisories in `minimatch`, pulled in by electron-builder. It is build tooling and
  is not part of the packaged app; the fix npm offers is a breaking downgrade, so it was not applied.
- `npm run dist` runs `scripts/dist.mjs`, which stops electron-builder from adding its `elevate.exe` helper.
- While building the installer, electron-builder runs a temporary NSIS stub that only writes the uninstaller
  file into `release/`.
- The tests need rembg with a working NVIDIA GPU and the three models listed above already downloaded. Close
  Rembg Studio first. The folder you pass is wiped, and the test refuses a non-empty folder it did not create.

## Project structure

```text
python/worker.py   process that calls rembg; JSON over stdin/stdout, no network port
electron/          window, IPC, sequential queue, export, history, settings
src/               React + Tailwind interface
shared/types.ts    types used by both sides
scripts/           dev runner, bundler, artwork and notices generators
tests/             end-to-end tests
docs/              banner, screenshots, release notes
```

The interface runs sandboxed, without Node.js access, and talks to the main process through a small preload
API. Image files reach it through a custom protocol that only serves files the app already knows about.

## Ownership and how it was made

Rembg Studio is owned and maintained by [odavyyy](https://github.com/odavyyy), the only code owner.

It was developed with the help of [Claude](https://www.anthropic.com/claude) (Anthropic): most of the code,
documentation and artwork was written by Claude, based on requirements set by the owner. Claude is an AI tool used
in development, not an owner or maintainer. Review the code as you would any other third-party code.

## License and credits

The app's code is under the [MIT License](LICENSE), © 2026 odavyyy. It does not change the licenses of rembg,
the models or other components: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- [rembg](https://github.com/danielgatis/rembg) by Daniel Gatis does the background removal. This is an
  independent project, not affiliated with or endorsed by rembg's author or the model authors.
- Sample photos in the screenshots and banner come with
  [scikit-image](https://github.com/scikit-image/scikit-image): *coffee* (Rachel Michetti, courtesy of Pikolo
  Espresso Bar, CC0) and *chelsea* (Stefan van der Walt, CC0).
