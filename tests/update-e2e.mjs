// Testes do atualizador no app EMPACOTADO, com um servidor falso em 127.0.0.1.
//
// uso: node tests/update-e2e.mjs <pasta-vazia> <release da versao atual> <portatil da versao seguinte>
//
// SIMULADO: o servidor (releases, falhas, downloads) e as janelas nativas.
// REAL: o app empacotado, o rembg, e a troca de versao do portatil (baixar,
// conferir, abrir a nova versao). O instalador NSIS nunca e executado.
import { _electron, chromium } from 'playwright-core'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

const [rootArg, releaseArg, nextArg] = process.argv.slice(2)
const root = resolve(rootArg)
const release = resolve(releaseArg)
const nextExe = resolve(nextArg)
if (existsSync(root) && readdirSync(root).length) throw new Error('use uma pasta vazia')
mkdirSync(root, { recursive: true })
const CURRENT = JSON.parse(readFileSync('package.json', 'utf8')).version
const NEXT = /(\d+\.\d+\.\d+)-portatil/.exec(nextExe)[1]
const PY = join(process.env.APPDATA, 'uv', 'tools', 'rembg', 'Scripts', 'python.exe')
const fx = join(root, 'fx')
execFileSync(PY, ['-I', '-B', 'tests/make_fixtures.py', fx])
const sha = (data) => createHash('sha256').update(data).digest('hex')
const shaFile = (p) => sha(readFileSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const assert = (c, m) => { if (!c) throw new Error(m) }

// ---------------- inventario do que o atualizador NAO pode tocar ----------------
function manifest(dir, skip = () => false) {
  if (!existsSync(dir)) return { exists: false }
  const lines = []
  let bytes = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (skip(e.name)) continue
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) {
        const s = statSync(p)
        bytes += s.size
        lines.push(`${p}|${s.size}|${s.mtimeMs}`)
      }
    }
  }
  walk(dir)
  return { exists: true, files: lines.length, bytes, hash: sha(lines.sort().join('\n')).slice(0, 16) }
}
const protectedPaths = {
  'ambiente rembg (uv tools)': join(process.env.APPDATA, 'uv', 'tools', 'rembg'),
  'Python gerenciado pelo uv': join(process.env.APPDATA, 'uv', 'python'),
  'modelos (~/.rembg)': join(process.env.USERPROFILE, '.rembg'),
  'dados reais do app (%APPDATA%\\Rembg Studio)': join(process.env.APPDATA, 'Rembg Studio'),
}
const snapshot = () => Object.fromEntries(Object.entries(protectedPaths).map(([k, v]) => [k, manifest(v)]))
const pth = join(protectedPaths['ambiente rembg (uv tools)'], 'Lib', 'site-packages', 'zz_cuda_dlls.pth')
const before = snapshot()
const pthBefore = existsSync(pth) ? shaFile(pth) : null
const nvidiaBefore = execFileSync('nvidia-smi', ['--query-gpu=driver_version', '--format=csv,noheader']).toString().trim()

// ---------------- servidor falso ----------------
const REPO = 'odavyyy/rembg-studio'
let scenario = {}
const hits = []
const fake = (magic, size) => Buffer.concat([Buffer.from(magic), randomBytes(size - magic.length)])
const payloads = {
  zip: fake('PK', 3_000_000),
  setup: fake('MZ', 2_000_000),
}
let realPortable = null
const names = (v) => ({ zip: `RembgStudio-${v}-win-x64.zip`, setup: `RembgStudio-Setup-${v}.exe`, portable: `RembgStudio-${v}-portatil.exe` })
function body(name) {
  if (name.endsWith('.zip')) return scenario.zipBody ?? payloads.zip
  if (name.includes('Setup')) return payloads.setup
  return (realPortable ??= readFileSync(nextExe))
}
function releaseJson(base) {
  const v = scenario.version ?? NEXT
  const list = Object.values(names(v)).filter((n) => !(scenario.omit ?? []).some((o) => n.includes(o)))
  if (!scenario.noSums) list.push('SHA256SUMS.txt')
  const assets = list.map((name) => ({
    name: scenario.rename ? scenario.rename(name) : name,
    state: 'uploaded',
    size: name === 'SHA256SUMS.txt' ? 400 : body(name).length,
    digest: scenario.badDigest && name !== 'SHA256SUMS.txt' ? 'sha256:' + 'f'.repeat(64) : null,
    browser_download_url: scenario.foreignUrl && name !== 'SHA256SUMS.txt' ? `https://example.com/${name}` : `${base}/${REPO}/releases/download/v${v}/${name}`,
  }))
  return { tag_name: scenario.tag ?? `v${v}`, draft: !!scenario.draft, prerelease: !!scenario.prerelease, published_at: '2026-11-27T12:00:00Z', body: 'Notas de teste:\n- item um\n<img src=x onerror="window.__xss=1">', assets }
}
const server = createServer((req, res) => {
  hits.push({ url: req.url, ua: req.headers['user-agent'], auth: req.headers.authorization ?? null })
  const base = `http://127.0.0.1:${server.address().port}`
  if (req.url === `/repos/${REPO}/releases/latest`) {
    if (scenario.dropApi) return req.socket.destroy()
    if (scenario.apiStatus) {
      res.writeHead(scenario.apiStatus, scenario.apiStatus === 403 ? { 'x-ratelimit-remaining': '0' } : {})
      return res.end('{}')
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(scenario.garbage ? 'isto nao e json' : JSON.stringify(releaseJson(base)))
  }
  const name = decodeURIComponent(req.url.split('/').pop())
  if (name === 'SHA256SUMS.txt') {
    const v = scenario.version ?? NEXT
    const lines = Object.values(names(v)).map((n) => `${scenario.wrongHash ? '0'.repeat(64) : sha(body(n))}  ${scenario.sumsOtherName ? 'outro.bin' : n}`)
    res.writeHead(200)
    return res.end(lines.join('\n') + '\n')
  }
  if (scenario.redirectAway) {
    // mesma maquina, outra origem: tem de ser recusado
    res.writeHead(302, { location: `http://localhost:${server.address().port}/${name}` })
    return res.end()
  }
  if (scenario.redirectOk && !req.url.startsWith('/cdn/')) {
    res.writeHead(302, { location: `${base}/cdn/${name}` })
    return res.end()
  }
  let data = body(name)
  if (scenario.larger) data = Buffer.concat([data, Buffer.alloc(5000)])
  if (scenario.truncate) {
    // sem content-length: a resposta "termina bem", mas com dados a menos
    res.writeHead(200)
    return res.end(data.subarray(0, Math.floor(data.length / 2)))
  }
  res.writeHead(200, { 'content-length': data.length })
  if (scenario.reset) {
    res.write(data.subarray(0, data.length / 3))
    return setTimeout(() => res.socket.destroy(), 300)
  }
  if (scenario.slow) {
    let off = 0
    const timer = setInterval(() => {
      res.write(data.subarray(off, (off += 60_000)))
      if (off >= data.length) { clearInterval(timer); res.end() }
    }, 100)
    return res.on('close', () => clearInterval(timer))
  }
  res.end(data)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const URL_ = `http://127.0.0.1:${server.address().port}`

// ---------------- processos ----------------
function procs() {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -or $_.Name -like '*Rembg*' } | ForEach-Object { \"$($_.ProcessId)|$($_.Name)|$($_.ExecutablePath)|$($_.CommandLine)\" }"]).toString()
  return out.split(/\r?\n/).filter(Boolean).map((l) => { const [pid, name, path, ...cmd] = l.split('|'); return { pid: Number(pid), name, path, cmd: cmd.join('|') } })
}
const workers = () => procs().filter((p) => p.name === 'python.exe' && p.cmd.includes('worker.py'))
const studios = () => procs().filter((p) => /rembg/i.test(p.name) && p.name !== 'python.exe')
async function until(fn, what, timeout = 120_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(200)
  }
  throw new Error(`tempo esgotado: ${what}`)
}
assert(workers().length === 0 && studios().length === 0, 'feche o Rembg Studio antes de testar')

const results = []
async function test(kind, name, fn) {
  try {
    const note = await fn()
    results.push({ ok: true, kind, name, note: note ?? '' })
    console.log(`PASSOU  [${kind}] ${name} ${note ?? ''}`)
  } catch (e) {
    results.push({ ok: false, kind, name, note: e.message })
    console.log(`FALHOU  [${kind}] ${name}: ${e.message}`)
  }
}

// ---------------- app empacotado (pasta) ----------------
let app, page
async function launch(exe, userData) {
  app = await _electron.launch({ executablePath: exe, colorScheme: null, env: { ...process.env, REMBG_STUDIO_USERDATA: userData, REMBG_STUDIO_UPDATE_TEST_URL: URL_ } })
  page = await app.firstWindow()
  await page.waitForSelector('[data-testid="nav-about"]')
  await app.evaluate(({ dialog, shell }) => {
    globalThis.calls = []
    globalThis.confirm = 0
    dialog.showMessageBox = async (_w, o) => { globalThis.calls.push(['confirm', o.message, o.detail]); return { response: globalThis.confirm } }
    dialog.showSaveDialog = async () => (globalThis.savePath ? { canceled: false, filePath: globalThis.savePath } : { canceled: true })
    shell.openPath = async (p) => { globalThis.calls.push(['openPath', p]); return '' }
    shell.showItemInFolder = (p) => globalThis.calls.push(['reveal', p])
    shell.openExternal = async (u) => globalThis.calls.push(['external', u])
  })
  await page.click('[data-testid="nav-about"]')
}
const up = () => page.evaluate(() => window.api.updateState())
const settledState = () => until(async () => { const s = await up(); return !['checking', 'downloading', 'verifying'].includes(s.status) && s }, 'estado do atualizador')
async function check(s) {
  scenario = s
  await page.click('[data-testid="update-check"]')
  await sleep(150)
  return settledState()
}
async function download(s) {
  Object.assign(scenario, s)
  await page.click('[data-testid="update-download"]')
  await sleep(150)
  return settledState()
}
const updatesDir = (ud) => join(ud, 'updates')
const leftovers = (ud) => (existsSync(updatesDir(ud)) ? readdirSync(updatesDir(ud)) : [])

const zipUd = join(root, 'ud-zip')
await launch(join(release, 'win-unpacked', 'Rembg Studio.exe'), zipUd)

await test('simulado', 'tela Sobre mostra versão, tipo de instalação e aviso de teste', async () => {
  const s = await up()
  assert(s.currentVersion === CURRENT && s.installType === 'zip' && s.testServer, JSON.stringify(s))
  assert(hits.length === 0, 'consultou sem o usuário pedir')
  await page.screenshot({ path: join(root, 'sobre.png') })
  return `${s.currentVersion}, ${s.installType}`
})
await test('simulado', 'sem atualização (mesma versão)', async () => {
  const s = await check({ version: CURRENT })
  assert(s.status === 'up-to-date', s.status)
  await page.waitForSelector('text=Você já está na versão mais recente')
})
await test('simulado', 'versão anterior não é oferecida (sem downgrade)', async () => {
  const s = await check({ version: '1.0.0' })
  assert(s.status === 'up-to-date', s.status)
  assert((await page.$('[data-testid="update-download"]')) === null, 'ofereceu download')
})
await test('simulado', 'detecta nova versão, mostra notas como texto puro', async () => {
  const s = await check({})
  assert(s.status === 'available' && s.latestVersion === NEXT, JSON.stringify(s))
  assert((await page.textContent('[data-testid="update-notes"]')).includes('<img src=x'), 'notas não aparecem como texto')
  assert(!(await page.evaluate(() => window.__xss)), 'HTML das notas foi executado')
  await page.screenshot({ path: join(root, 'disponivel.png') })
  const h = hits.at(-1)
  assert(h.ua === `RembgStudio/${CURRENT}` && !h.auth, `cabeçalhos ${h.ua} ${h.auth}`)
  return `User-Agent ${h.ua}, sem token`
})
for (const [name, sc, expect] of [
  ['rascunho é ignorado', { draft: true }, /rascunho|pré-lançamento/],
  ['pré-lançamento é ignorado', { prerelease: true }, /rascunho|pré-lançamento/],
  ['tag de pré-lançamento é recusada', { tag: `v${NEXT}-beta` }, /tag não reconhecida/],
  ['artefato só para outra arquitetura é recusado', { omit: ['win-x64'], rename: (n) => n.replace('portatil', 'arm64') }, /não tem o arquivo/],
  ['release sem SHA256SUMS.txt é recusada', { noSums: true }, /SHA256SUMS/],
  ['endereço de artefato de outro site é recusado', { foreignUrl: true }, /Endereço inesperado/],
  ['limite de consultas do GitHub tem mensagem própria', { apiStatus: 403 }, /limitou as consultas/],
  ['erro do servidor', { apiStatus: 500 }, /erro 500/],
  ['falha de rede (conexão derrubada)', { dropApi: true }, /conexão/i],
  ['resposta que não é JSON', { garbage: true }, /Resposta inválida/],
]) {
  await test('simulado', name, async () => {
    const s = await check(sc)
    assert(s.status === 'error' && expect.test(s.message), `${s.status}: ${s.message}`)
    return s.message
  })
}
await test('simulado', 'nenhuma versão publicada (404)', async () => {
  const s = await check({ apiStatus: 404 })
  assert(s.status === 'no-release', s.status)
  return s.message
})

await test('simulado', 'cancelar o download limpa os temporários', async () => {
  await check({ slow: true })
  await page.click('[data-testid="update-download"]')
  const mid = await until(async () => { const s = await up(); return s.status === 'downloading' && s.received > 100_000 && s.bytesPerSecond > 0 && s }, 'progresso', 30_000)
  const text = await page.textContent('[data-testid="update-progress"]')
  assert(/\d+% · .+ de .+/.test(text) && text.includes('/s'), `progresso: ${text}`)
  assert(leftovers(zipUd).some((f) => f.endsWith('.part')), 'sem arquivo .part durante o download')
  await page.screenshot({ path: join(root, 'progresso.png') })
  await page.click('[data-testid="update-cancel"]')
  const s = await settledState()
  assert(s.status === 'cancelled', s.status)
  assert(leftovers(zipUd).length === 0, `sobrou ${leftovers(zipUd)}`)
  return `cancelado em ${mid.received} bytes; ${text.trim()}`
})
for (const [name, sc, expect] of [
  ['conexão cortada no meio do download', { reset: true }, /interrompida|incompleto|conexão/i],
  ['download incompleto (corpo menor que o anunciado)', { truncate: true }, /incompleto/],
  ['arquivo maior que o anunciado', { larger: true }, /maior que o anunciado/],
  ['hash incorreto', { wrongHash: true }, /SHA-256 não confere/],
  ['soma publicada sem o arquivo', { sumsOtherName: true }, /não tem uma soma/],
  ['digest do GitHub diferente do SHA256SUMS', { badDigest: true }, /não bate/],
  ['artefato inválido (hash confere, mas não é pacote)', { zipBody: Buffer.from('<html>erro</html>'.repeat(1000)) }, /não é um pacote válido/],
  ['redirecionamento para outra origem', { redirectAway: true }, /Redirecionamento não permitido/],
]) {
  await test('simulado', name, async () => {
    const c = await check(sc)
    assert(c.status === 'available', `${c.status}: ${c.message}`)
    const s = await download({})
    assert(s.status === 'download-error' && expect.test(s.message), `${s.status}: ${s.message}`)
    assert(leftovers(zipUd).length === 0, `sobrou ${leftovers(zipUd)}`)
    assert((await page.$('[data-testid="update-install"]')) === null, 'ofereceu instalar')
    return s.message
  })
}
await test('simulado', 'arquivo alterado depois de conferido não é usado', async () => {
  await check({})
  const s = await download({})
  assert(s.status === 'ready', `${s.status} ${s.message}`)
  writeFileSync(join(updatesDir(zipUd), s.assetName), 'adulterado')
  await page.click('[data-testid="update-install"]')
  const after = await until(async () => { const x = await up(); return x.status === 'download-error' && x }, 'recusa', 20_000)
  assert(/mudou ou sumiu/.test(after.message), after.message)
  assert(leftovers(zipUd).length === 0, 'não limpou')
})
await test('simulado', 'ZIP: redirecionamento permitido, hash conferido e salvo onde o usuário escolher', async () => {
  await check({ redirectOk: true })
  const s = await download({})
  assert(s.status === 'ready' && hits.some((h) => h.url.startsWith('/cdn/')), `${s.status} ${s.message}`)
  const target = join(root, 'salvo.zip')
  await app.evaluate((_e, p) => { globalThis.savePath = p }, target)
  await page.click('[data-testid="update-install"]')
  await until(async () => (await up()).status === 'saved', 'salvar', 20_000)
  assert(shaFile(target) === sha(payloads.zip), 'ZIP salvo difere')
})
await test('simulado', 'avisos de documentos e links só os permitidos', async () => {
  for (const id of ['privacy', 'terms', 'models', 'signing', 'license', 'third-party']) {
    await page.click(`[data-testid="doc-${id}"]`)
    assert((await page.textContent('[data-testid="doc-text"]')).length > 500, id)
    await page.click('[data-testid="doc-close"]')
  }
  const bad = await page.evaluate(() => window.api.readDoc('../../package.json').then(() => 'leu', () => 'recusado'))
  assert(bad === 'recusado', 'leu arquivo arbitrário')
  await page.evaluate(async () => { await window.api.openLink('https://example.com'); await window.api.openLink('__proto__'); await window.api.openLink('issues') })
  const ext = (await app.evaluate(() => globalThis.calls)).filter((c) => c[0] === 'external')
  assert(ext.length === 1 && ext[0][1].endsWith('/issues'), JSON.stringify(ext))
})
await app.close()
await until(() => workers().length === 0, 'worker sair', 20_000)

// ---------------- tipo instalado (instalador NAO e executado) ----------------
await test('simulado', 'versão instalada: confirma, abre o instalador (substituído) e fecha o app', async () => {
  const dir = join(root, 'instalado')
  cpSync(join(release, 'win-unpacked'), dir, { recursive: true })
  writeFileSync(join(dir, 'Uninstall Rembg Studio.exe'), '')
  const ud = join(root, 'ud-instalado')
  await launch(join(dir, 'Rembg Studio.exe'), ud)
  assert((await up()).installType === 'installed', (await up()).installType)
  await check({})
  const s = await download({})
  assert(s.status === 'ready' && s.assetName.includes('Setup') && s.signature === 'unsigned-build', JSON.stringify(s))
  // recusar a confirmacao nao faz nada
  await app.evaluate(() => { globalThis.confirm = 1 })
  await page.click('[data-testid="update-install"]')
  await sleep(1200)
  assert((await up()).status === 'ready', 'saiu do estado pronto ao cancelar')
  assert(!(await app.evaluate(() => globalThis.calls)).some((c) => c[0] === 'openPath'), 'abriu sem confirmação')
  await app.evaluate(() => { globalThis.confirm = 0; const prev = globalThis.calls; globalThis.log = prev })
  const exited = new Promise((r) => app.process().once('exit', r))
  const opened = join(root, 'openpath.txt')
  await app.evaluate(({ shell }, file) => { shell.openPath = async (p) => { process.mainModule.require('node:fs').writeFileSync(file, p); return '' } }, opened)
  await page.click('[data-testid="update-install"]')
  await Promise.race([exited, sleep(15_000).then(() => { throw new Error('o app não fechou') })])
  const p = readFileSync(opened, 'utf8')
  assert(p.endsWith(`RembgStudio-Setup-${NEXT}.exe`) && p.startsWith(join(ud, 'updates')), p)
  assert(shaFile(p) === sha(payloads.setup), 'instalador diferente do verificado')
  await until(() => workers().length === 0, 'sem python órfão', 20_000)
})

await test('simulado', 'instalar é recusado enquanto há imagens na fila', async () => {
  const dir = join(root, 'instalado')
  await launch(join(dir, 'Rembg Studio.exe'), join(root, 'ud-ocupado'))
  await check({})
  assert((await download({})).status === 'ready', 'download')
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'lote'))
  await until(async () => (await page.evaluate(async () => (await window.api.getInitialState()).items)).every((i) => i.status === 'idle'), 'importar')
  const s = await page.evaluate(async () => {
    const ids = (await window.api.getInitialState()).items.map((i) => i.id)
    await window.api.process(ids, { model: 'birefnet-general-lite' })
    return window.api.updateInstall()
  })
  assert(s.status === 'ready' && /fila terminar/.test(s.message), `${s.status} ${s.message}`)
  assert(!(await app.evaluate(() => globalThis.calls)).some((c) => c[0] === 'confirm' || c[0] === 'openPath'), 'prosseguiu')
  await page.evaluate(() => window.api.cancel('all'))
  await app.close()
  await until(() => workers().length === 0, 'worker sair', 20_000)
})

await test('simulado', 'servidor de teste é ignorado fora de 127.0.0.1', async () => {
  const a = await _electron.launch({ executablePath: join(release, 'win-unpacked', 'Rembg Studio.exe'), env: { ...process.env, REMBG_STUDIO_USERDATA: join(root, 'ud-host'), REMBG_STUDIO_UPDATE_TEST_URL: 'http://example.com:80' } })
  const p = await a.firstWindow()
  await p.waitForSelector('[data-testid="nav-about"]')
  const s = await p.evaluate(() => window.api.updateState())
  await a.close()
  assert(s.testServer === false, 'aceitou servidor externo')
})

// ---------------- PORTATIL REAL: 1.1.0 -> versao seguinte ----------------
async function mainEval(port, expression) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const ws = new WebSocket(list[0].webSocketDebuggerUrl)
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
  const result = await new Promise((ok) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) ok(d.result) }
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, includeCommandLineAPI: true, returnByValue: true, awaitPromise: true } }))
  })
  ws.close()
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'erro no processo principal')
  return result.result.value
}
const folder = join(root, 'pasta do portátil') // com espaco e acento de proposito
const portableUd = join(root, 'ud-portatil')
mkdirSync(folder, { recursive: true })
const oldExe = join(folder, `RembgStudio-${CURRENT}-portatil.exe`)
copyFileSync(join(release, `RembgStudio-${CURRENT}-portatil.exe`), oldExe)
const oldHash = shaFile(oldExe)
const newExe = join(folder, `RembgStudio-${NEXT}-portatil.exe`)
let settingsBefore, historyBefore, savedResult, savedHash

await test('real', `portátil ${CURRENT}: baixa, confere, abre a ${NEXT} e fecha a antiga`, async () => {
  scenario = {}
  const child = spawn(oldExe, ['--remote-debugging-port=9333', '--inspect=9334'], { detached: true, stdio: 'ignore', env: { ...process.env, REMBG_STUDIO_USERDATA: portableUd, REMBG_STUDIO_UPDATE_TEST_URL: URL_ } })
  child.unref()
  const browser = await until(() => chromium.connectOverCDP('http://127.0.0.1:9333').catch(() => null), 'conectar ao portátil', 90_000)
  page = await until(() => browser.contexts()[0]?.pages()[0], 'janela')
  await page.waitForSelector('[data-testid="nav-about"]')
  const s0 = await up()
  assert(s0.installType === 'portable' && s0.currentVersion === CURRENT, JSON.stringify(s0))

  // cria dados do usuario: configuracoes, um resultado salvo e historico
  savedResult = join(root, 'resultados', 'meu_resultado.png')
  await page.evaluate(([dir]) => window.api.setSettings({ theme: 'dark', namePattern: '{nome}-meu', outputDir: dir }), [join(root, 'resultados')])
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'astronauta.png'))
  const items = () => page.evaluate(async () => (await window.api.getInitialState()).items)
  await until(async () => (await items())[0]?.status === 'idle', 'importar')
  await page.evaluate(async () => window.api.process([(await window.api.getInitialState()).items[0].id], { model: 'isnet-general-use' }))
  await until(async () => (await items())[0]?.status === 'done', 'processar')
  await page.evaluate(async ([dir]) => window.api.saveMany([(await window.api.getInitialState()).items[0].id], { dir }), [join(root, 'resultados')])
  savedResult = (await items())[0].savedPath
  savedHash = shaFile(savedResult)
  settingsBefore = readFileSync(join(portableUd, 'settings.json'), 'utf8')
  historyBefore = JSON.parse(readFileSync(join(portableUd, 'history.json'), 'utf8')).map((h) => [h.id, h.savedPath, h.originalPath, h.model])

  await mainEval(9334, "(()=>{const {dialog}=require('electron'); globalThis.confirmText=null; dialog.showMessageBox=async(_w,o)=>{globalThis.confirmText=o.message+' | '+o.detail; return {response:0}}; return true})()")
  await page.click('[data-testid="nav-about"]')
  assert((await check({})).status === 'available', 'não detectou')
  const ready = await download({})
  assert(ready.status === 'ready' && ready.assetName === `RembgStudio-${NEXT}-portatil.exe`, JSON.stringify(ready))
  await page.screenshot({ path: join(root, 'pronto-portatil.png') })
  const oldPids = new Set(studios().map((p) => p.pid))
  const oldWorkers = new Set(workers().map((p) => p.pid))
  await page.click('[data-testid="update-install"]').catch(() => {})
  const fresh = await until(() => {
    const s = studios().filter((p) => !oldPids.has(p.pid) && p.name === 'Rembg Studio.exe' && !p.cmd.includes('--type='))
    const w = workers().filter((p) => !oldWorkers.has(p.pid))
    return s.length && w.length ? { app: s[0], w } : null
  }, 'a nova versão abrir', 120_000)
  const version = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Item -LiteralPath $env:P).VersionInfo.ProductVersion`], { env: { ...process.env, P: fresh.app.path } }).toString().trim()
  assert(version.startsWith(NEXT), `nova instância é ${version}`)
  await until(() => [...oldPids].every((pid) => !studios().some((p) => p.pid === pid)), 'a antiga fechar', 60_000)
  assert(![...oldWorkers].some((pid) => workers().some((p) => p.pid === pid)), 'python antigo ficou vivo')
  await sleep(6000)
  assert(studios().some((p) => p.pid === fresh.app.pid), 'a nova versão fechou sozinha (trava de instância única?)')
  return `nova instância ProductVersion ${version}`
})
await test('real', 'versão antiga preservada; nova copiada ao lado e idêntica à publicada', () => {
  assert(existsSync(oldExe) && shaFile(oldExe) === oldHash, 'a versão antiga mudou ou sumiu')
  assert(existsSync(newExe) && shaFile(newExe) === shaFile(nextExe), 'a nova difere da servida')
  assert(readFileSync(`${newExe}:Zone.Identifier`, 'utf8').includes('ZoneId=3'), 'sem marca de origem da internet')
  return readdirSync(folder).join(', ')
})
await test('real', 'configurações, histórico e resultado salvo preservados após a atualização', () => {
  assert(readFileSync(join(portableUd, 'settings.json'), 'utf8') === settingsBefore, 'configurações mudaram')
  const after = JSON.parse(readFileSync(join(portableUd, 'history.json'), 'utf8')).map((h) => [h.id, h.savedPath, h.originalPath, h.model])
  assert(JSON.stringify(after) === JSON.stringify(historyBefore) && after.length === 1, 'histórico mudou')
  assert(shaFile(savedResult) === savedHash, 'resultado salvo mudou')
  assert(!existsSync(join(portableUd, 'updates')) || readdirSync(join(portableUd, 'updates')).length === 0, 'temporários da atualização não foram limpos')
})
await test('real', 'fechar a nova versão não deixa processos Python órfãos', async () => {
  execFileSync('powershell', ['-NoProfile', '-Command', "Get-Process | Where-Object { $_.MainWindowTitle -eq 'Rembg Studio' } | ForEach-Object { [void]$_.CloseMainWindow() }"])
  await until(() => workers().length === 0 && studios().length === 0, 'tudo fechar', 45_000)
})

// ---------------- o que nao podia mudar ----------------
const after = snapshot()
for (const key of Object.keys(protectedPaths)) {
  await test('real', `não alterado: ${key}`, () => {
    assert(JSON.stringify(before[key]) === JSON.stringify(after[key]), `${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`)
    return before[key].exists ? `${before[key].files} arquivos, ${before[key].bytes} bytes` : 'não existe (continua sem existir)'
  })
}
await test('real', 'zz_cuda_dlls.pth e driver NVIDIA inalterados', () => {
  assert((existsSync(pth) ? shaFile(pth) : null) === pthBefore, 'pth mudou')
  assert(execFileSync('nvidia-smi', ['--query-gpu=driver_version', '--format=csv,noheader']).toString().trim() === nvidiaBefore, 'driver mudou')
  return `driver ${nvidiaBefore}`
})

server.close()
writeFileSync(join(root, 'resultado.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passaram (${results.filter((r) => r.kind === 'real').length} reais, ${results.filter((r) => r.kind === 'simulado').length} com servidor/janelas simulados)`)
process.exit(failed ? 1 : 0)
