# Changelog

This project follows [Semantic Versioning](https://semver.org/).

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
