// Testes das regras puras do atualizador (sem rede, sem Electron).  node tests/unit.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const out = await build({ entryPoints: ['electron/release.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const r = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))

let n = 0
const t = (name, fn) => {
  fn()
  n++
  console.log('ok  ' + name)
}
const base = 'https://github.com/odavyyy/rembg-studio/releases/download'
const asset = (name, v = '1.2.0', extra = {}) => ({ name, size: 10, state: 'uploaded', digest: null, browser_download_url: `${base}/v${v}/${name}`, ...extra })
const release = (v = '1.2.0', extra = {}) => ({
  tag_name: `v${v}`, draft: false, prerelease: false, body: 'notas',
  assets: ['RembgStudio-1.2.0-portatil.exe', 'RembgStudio-Setup-1.2.0.exe', 'RembgStudio-1.2.0-win-x64.zip', 'SHA256SUMS.txt'].map((x) => asset(x, v)),
  ...extra,
})
const evaluate = (j, cur = '1.1.0', type = 'portable') => r.evaluateRelease(j, cur, type, base)

t('compara versões numericamente', () => {
  assert.equal(r.compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(r.compareVersions('2.0.0', '2.0.0'), 0)
  assert.equal(r.compareVersions('1.0.0', '1.0.1'), -1)
  assert.throws(() => r.compareVersions('1.0', '1.0.0'))
})
t('mesma versão e versão antiga não são oferecidas', () => {
  assert.equal(evaluate(release('1.1.0')).kind, 'current')
  assert.equal(evaluate(release('1.0.0')).kind, 'current')
})
t('rascunho, pré-lançamento e campos ausentes são recusados', () => {
  assert.throws(() => evaluate(release('1.2.0', { draft: true })))
  assert.throws(() => evaluate(release('1.2.0', { prerelease: true })))
  assert.throws(() => evaluate({ ...release(), draft: undefined }))
})
t('tags fora do padrão são recusadas', () => {
  for (const tag of ['1.2.0', 'v1.2.0-beta', 'v1.2', 'latest']) assert.throws(() => evaluate(release('1.2.0', { tag_name: tag })))
})
t('escolhe o artefato x64 certo para cada tipo de instalação', () => {
  assert.equal(evaluate(release()).candidate.asset.name, 'RembgStudio-1.2.0-portatil.exe')
  assert.equal(evaluate(release(), '1.1.0', 'installed').candidate.asset.name, 'RembgStudio-Setup-1.2.0.exe')
  assert.equal(evaluate(release(), '1.1.0', 'zip').candidate.asset.name, 'RembgStudio-1.2.0-win-x64.zip')
})
t('sem artefato compatível ou sem SHA256SUMS, recusa', () => {
  assert.throws(() => evaluate(release('1.2.0', { assets: [asset('RembgStudio-1.2.0-arm64.exe'), asset('SHA256SUMS.txt')] })))
  assert.throws(() => evaluate(release('1.2.0', { assets: [asset('RembgStudio-1.2.0-portatil.exe')] })))
})
t('endereço, tamanho e estado do artefato são conferidos', () => {
  const bad = (extra) => release('1.2.0', { assets: [asset('RembgStudio-1.2.0-portatil.exe', '1.2.0', extra), asset('SHA256SUMS.txt')] })
  assert.throws(() => evaluate(bad({ browser_download_url: 'https://evil.example/x.exe' })))
  assert.throws(() => evaluate(bad({ browser_download_url: 'https://github.com/outro/repo/releases/download/v1.2.0/RembgStudio-1.2.0-portatil.exe' })))
  assert.throws(() => evaluate(bad({ size: 0 })))
  assert.throws(() => evaluate(bad({ size: 5e9 })))
  assert.throws(() => evaluate(bad({ state: 'starter' })))
})
t('SHA256SUMS: falha fechada e conferência com o digest do GitHub', () => {
  const a = { name: 'a.exe', digest: null }
  const h = 'a'.repeat(64)
  assert.equal(r.expectedHash(`${h}  a.exe\n`, a), h)
  assert.equal(r.expectedHash(`${h.toUpperCase()} *a.exe\r\n`, a), h)
  assert.throws(() => r.expectedHash(`${h}  b.exe\n`, a))
  assert.throws(() => r.expectedHash('', a))
  assert.throws(() => r.expectedHash(`${h}  a.exe\n${'b'.repeat(64)}  a.exe\n`, a))
  assert.throws(() => r.expectedHash(`${h}  a.exe\n`, { ...a, digest: 'sha256:' + 'c'.repeat(64) }))
})
t('assinatura de arquivo: MZ para exe, PK para zip', () => {
  assert.ok(r.looksLikeArtifact('a.exe', Buffer.from('MZxx')))
  assert.ok(r.looksLikeArtifact('a.zip', Buffer.from('PKxx')))
  assert.ok(!r.looksLikeArtifact('a.exe', Buffer.from('<htm')))
  assert.ok(!r.looksLikeArtifact('a.msi', Buffer.from('MZxx')))
})
console.log(`\n${n} grupos de testes passaram`)
