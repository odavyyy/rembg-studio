// Gera THIRD_PARTY_NOTICES.md a partir dos pacotes que vao dentro do app.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// pacotes cujo codigo, CSS ou fonte entra no bundle da interface
const BUNDLED = ['react', 'react-dom', 'scheduler', 'zustand', 'lucide-react', '@fontsource-variable/inter', 'tailwindcss']
const RUNTIME = ['electron']

const section = (name) => {
  const dir = join('node_modules', name)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const text = readFileSync(join(dir, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim()
  return `### ${name} ${pkg.version} (${pkg.license})\n\n\`\`\`text\n${text}\n\`\`\`\n`
}

const out = `# Third-party notices

Rembg Studio itself is released under the MIT License (see \`LICENSE\`). This file covers software
and assets by other authors. Regenerate it with \`npm run notices\`.

## Included in the distributed app

### Electron runtime

The Windows builds include the Electron runtime, which bundles Chromium, Node.js and FFmpeg
(\`ffmpeg.dll\`, LGPL-2.1-or-later as distributed by Electron). Their licenses ship next to the
executable in \`LICENSE.electron.txt\` and \`LICENSES.chromium.html\`.

${RUNTIME.map(section).join('\n')}
### Interface libraries and font

${BUNDLED.map(section).join('\n')}
### Installer and portable wrapper

\`RembgStudio-Setup-*.exe\` and \`RembgStudio-*-portatil.exe\` are produced by electron-builder using
[NSIS](https://nsis.sourceforge.io/License) (zlib/libpng license; some compression modules are
under the bzip2 and CPL-1.0 licenses) and its bundled plug-ins.

The portable \`.exe\` also contains \`resources/elevate.exe\`, a helper that electron-builder adds from its NSIS
toolset and that Rembg Studio does not use. The file identifies itself as "Elevate" by Johannes Passing,
"Copyright (C) 2007". A project by the same author, https://github.com/jpassing/elevate, is shown by GitHub as
MIT-licensed, but we could not verify that this binary was built from it, so we do not state a license for it.

## NOT included: installed separately by the user

The app calls a rembg installation that already exists on the computer. None of the following is
redistributed by this project; each keeps its own license.

| Component | License | Source |
|---|---|---|
| rembg | MIT | https://github.com/danielgatis/rembg |
| ONNX Runtime | MIT | https://github.com/microsoft/onnxruntime |
| Python and rembg's Python dependencies (Pillow, NumPy, SciPy, scikit-image, PyMatting, …) | each under its own license | https://pypi.org/ |
| NVIDIA CUDA and cuDNN libraries (\`nvidia-*\` pip packages) | NVIDIA's proprietary license agreements | https://docs.nvidia.com/cuda/ |

## Models

**No model is included in this repository or in the builds.** rembg downloads a model file when you
first use it. Model weights have their own licenses, independent of rembg's and of this project's.
See the model license table in the README before using any model, especially commercially.

## Images used in screenshots, the banner and tests

Sample photos that ship with [scikit-image](https://github.com/scikit-image/scikit-image). The
license statements below are the ones in scikit-image's own documentation of each image.

| Image | Statement |
|---|---|
| \`coffee\` | Photo courtesy of Pikolo Espresso Bar. CC0 by the photographer (Rachel Michetti). |
| \`chelsea\` (cat) | CC0 by the photographer (Stefan van der Walt). |
| \`astronaut\` (tests only) | NASA photo of Eileen Collins; no known copyright restrictions, public domain. |

The test images are generated at test time and are not stored in the repository.
`

writeFileSync('THIRD_PARTY_NOTICES.md', out)
console.log('THIRD_PARTY_NOTICES.md gerado')
