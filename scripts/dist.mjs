// Gera os pacotes do Windows sem o elevate.exe.
//
// O electron-builder copia um "elevate.exe" do seu conjunto NSIS para o pacote
// portatil. O Rembg Studio nao pede elevacao, a origem/licenca desse binario nao
// pode ser confirmada e o esquema de configuracao nao permite remove-lo do alvo
// portatil. Aqui desativamos essa copia antes de empacotar e conferimos depois.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { CopyElevateHelper } = require('app-builder-lib/out/targets/nsis/nsisUtil')
if (typeof CopyElevateHelper?.prototype?.resolve !== 'function') {
  throw new Error('O electron-builder mudou: revise scripts/dist.mjs antes de empacotar.')
}
CopyElevateHelper.prototype.resolve = () => Promise.resolve(null)

const { build, Platform, Arch } = require('electron-builder')
const extra = process.argv.slice(2)
const version = extra.find((a) => a.startsWith('--app-version='))?.split('=')[1]
const output = extra.find((a) => a.startsWith('--output='))?.split('=')[1]
const targets = extra.find((a) => a.startsWith('--targets='))?.split('=')[1]?.split(',')
const prepackaged = extra.find((a) => a.startsWith('--prepackaged='))?.split('=')[1]
const config = JSON.parse(readFileSync('package.json', 'utf8')).build
if (output) config.directories = { ...config.directories, output }
if (version) config.extraMetadata = { version }

await build({
  targets: Platform.WINDOWS.createTarget(targets, Arch.x64),
  publish: 'never',
  config,
  ...(prepackaged ? { prepackaged } : {}),
})

const unpacked = join(output ?? config.directories.output, 'win-unpacked', 'resources', 'elevate.exe')
if (existsSync(unpacked)) throw new Error('elevate.exe voltou a ser incluído; revise scripts/dist.mjs.')
