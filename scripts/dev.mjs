// Desenvolvimento: servidor Vite com recarga + Electron apontando para ele.
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const electronPath = createRequire(import.meta.url)('electron')
const server = await createServer({ configFile: 'vite.config.mts' })
await server.listen()
execFileSync(process.execPath, ['scripts/build-main.mjs'], { stdio: 'inherit' })
const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, REMBG_STUDIO_DEV_URL: 'http://127.0.0.1:5199' },
})
electron.on('exit', async () => {
  await server.close()
  process.exit(0)
})
