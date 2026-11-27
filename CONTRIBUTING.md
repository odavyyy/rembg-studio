# Contributing

Thanks for your interest. Issues and pull requests are welcome in English or Portuguese.

## Before opening an issue

- Run **Configurações → Testar GPU de verdade** and include the result for GPU problems.
- Include your Windows, rembg, Python and GPU driver versions.
- **Remove personal information** (user names in paths, private images) from logs and screenshots.

## Development

1. Install rembg as described in the README.
2. `npm ci`, then `npm run dev`.
3. Before a pull request, run `npm run build`.
4. If you can, run `node tests/e2e.mjs <empty-folder>`. It needs an NVIDIA GPU and the `isnet-general-use`,
   `birefnet-general-lite` and `bria-rmbg` models. Say in the pull request what you did and did not test.

## Guidelines

- Keep processing local. Do not add features that send images or usage data over the network.
- Do not install, upgrade or modify the user's Python environment from the app.
- Do not commit model files, personal images, build output or secrets.
- New interface text goes in Brazilian Portuguese.
- By contributing, you agree that your contribution is released under the MIT License.
