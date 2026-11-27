# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - unreleased

### Added

- In-app updates from the official GitHub releases (manual check), with progress, cancel, SHA-256 verification and
  confirmation; side-by-side replacement for the portable version.
- **Sobre** (About) page with version, updates, documents and support links.
- Privacy policy, usage notes, model license table and code signing policy, included in the app.
- One-time license notice before using or downloading `bria-rmbg`.
- Release workflow prepared for optional code signing (not yet run).

### Changed

- The app asks ONNX Runtime to disable telemetry in the rembg process it starts.
- The portable package no longer contains `elevate.exe`.

## [1.0.0] - 2026-11-27

First public release.

### Added

- Windows desktop interface (Brazilian Portuguese) for an existing local rembg installation.
- Drag and drop, file picker and folder import for PNG, JPEG, WebP, BMP and TIFF.
- Before/after comparison, zoom, pan and preview backgrounds.
- Sequential batch queue with per-image status, cancel and reprocess.
- Model list read from the rembg installation, with short descriptions and on-demand download.
- Advanced options: alpha matting, ViTMatte, mask clean-up, halo removal, mask-only export.
- Transparent PNG export with output folder, name pattern, rename and auto-save; originals are protected.
- Local history, persistent settings, light and dark themes.
- Diagnostics page with a real GPU test; CUDA DLL folders from pip packages are loaded for the app's process.
- Memory guard for alpha matting (25 MP, or less when free RAM is low).
