// Teste de ponta a ponta: abre o app real, usa o rembg instalado e confere os arquivos.
// Uso: node tests/e2e.mjs <pasta-de-trabalho> [caminho-do-exe-empacotado]
import { _electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'test-run')
const packaged = process.argv[3] ? resolve(process.argv[3]) : null
const PY = join(process.env.APPDATA, 'uv', 'tools', 'rembg', 'Scripts', 'python.exe')
const fx = join(root, 'fx')
const ud = join(root, 'userdata')
const outDir = join(root, 'saida')
const shots = join(root, 'shots')
const marker = join(root, '.rembg-studio-e2e')
if (existsSync(root) && readdirSync(root).length > 0 && !existsSync(marker)) {
  console.error(`Recusado: ${root} não está vazia e não foi criada por este teste. Escolha outra pasta.`)
  process.exit(2)
}
rmSync(root, { recursive: true, force: true })
for (const d of [fx, ud, outDir, shots]) mkdirSync(d, { recursive: true })
writeFileSync(marker, '')
execFileSync(PY, ['-I', 'tests/make_fixtures.py', fx], { stdio: 'inherit' })

const results = []
let app, page
const consoleErrors = []

async function launch(env) {
  app = await _electron.launch({
    executablePath: packaged ?? createRequire(import.meta.url)('electron'),
    args: packaged ? [] : ['.'],
    colorScheme: null, // sem isso o Playwright força o tema claro
    env: env ?? { ...process.env, REMBG_STUDIO_USERDATA: ud },
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  await page.waitForSelector('[data-testid="nav-workspace"]')
}

const state = () => page.evaluate(() => window.api.getInitialState())
const assert = (c, msg) => { if (!c) throw new Error(msg) }
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const png = (p) => JSON.parse(execFileSync(PY, ['-I', 'tests/check_png.py', p]).toString())
const click = (id) => page.click(`[data-testid="${id}"]`)
const shot = (n) => page.screenshot({ path: join(shots, `${n}.png`) })
const item = async (name) => (await state()).items.find((i) => i.name === name)

async function until(fn, what, timeout = 600_000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await page.waitForTimeout(150)
  }
  throw new Error(`tempo esgotado: ${what}`)
}
const settled = (what, timeout) =>
  until(async () => {
    const s = await state()
    return s.items.every((i) => !['probing', 'queued', 'processing'].includes(i.status)) && s
  }, what, timeout)

const stubOpen = (paths) =>
  app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }) }, paths)
const stubSave = (path) =>
  app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }) }, path)

/** processos python rodando o worker.py deste projeto */
function workerProcs() {
  const cmd = "@(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*worker.py*' } | ForEach-Object { $_.ProcessId }) -join ','"
  return execFileSync('powershell', ['-NoProfile', '-Command', cmd]).toString().trim().split(',').filter(Boolean).map(Number)
}

async function test(name, fn) {
  const t = Date.now()
  try {
    const note = await fn()
    results.push({ ok: true, name, note: note ?? '', s: ((Date.now() - t) / 1000).toFixed(1) })
    console.log(`PASSOU  ${name}  (${results.at(-1).s}s) ${note ?? ''}`)
  } catch (e) {
    results.push({ ok: false, name, note: e.message, s: ((Date.now() - t) / 1000).toFixed(1) })
    console.log(`FALHOU  ${name}: ${e.message}`)
    await shot(`falha-${results.length}`).catch(() => {})
  }
}

const baselineProcs = workerProcs().length
const originals = ['astronauta.png', join('lote', 'gato.jpg'), join('lote', 'cafe.webp'), 'grande_24mp.jpg'].map((f) => join(fx, f))
const originalHashes = originals.map(sha)
const single = join(outDir, 'astronauta_sem_fundo.png')

await test('1. Abrir o aplicativo', async () => {
  await launch()
  await page.waitForTimeout(300)
  assert(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), 'tema padrão não está escuro')
  const s = await until(async () => { const s = await state(); return s.worker.state === 'ready' && s }, 'worker pronto', 90_000)
  await page.waitForSelector('[data-testid="dropzone"]')
  await page.waitForFunction(() => /GPU|CPU/.test(document.querySelector('[data-testid="device-status"]').textContent), null, { timeout: 60_000 })
  await shot('01-vazio')
  return s.worker.pythonPath
})

await test('2. Importar uma imagem (seletor de arquivos)', async () => {
  await stubOpen([join(fx, 'astronauta.png')])
  await click('dropzone')
  const it = await until(async () => { const i = await item('astronauta.png'); return i?.status === 'idle' && i }, 'imagem lida', 30_000)
  assert(it.width === 512 && it.height === 512 && it.sizeBytes > 0, 'metadados errados')
})

await test('3. Visualizar a imagem original', async () => {
  await page.waitForFunction(() => document.querySelector('[data-testid="img-original"]')?.naturalWidth === 512)
  await shot('03-original')
})

await test('4. Remover o fundo com isnet-general-use', async () => {
  await click('process')
  const s = await settled('processar')
  const it = s.items[0]
  assert(it.status === 'done', it.error ?? it.status)
  assert(it.resultModel === 'isnet-general-use', it.resultModel)
  await page.waitForFunction(() => document.querySelector('[data-testid="img-result"]')?.naturalWidth === 512)
  await shot('04-comparar')
  return `${it.device} ${it.timeMs} ms`
})

await test('Visualizador: slider, zoom, ajustar e fundos de prévia', async () => {
  const clip = () => page.$eval('[data-testid="img-result"]', (e) => e.style.clipPath)
  const before = await clip()
  const h = await page.locator('[data-testid="split-handle"]').boundingBox()
  await page.mouse.move(h.x + h.width / 2, h.y + 100)
  await page.mouse.down()
  await page.mouse.move(h.x + 160, h.y + 100, { steps: 5 })
  await page.mouse.up()
  assert((await clip()) !== before, 'slider não mudou o recorte')
  const zoom = () => page.textContent('[data-testid="zoom-level"]')
  const z0 = await zoom()
  await click('zoom-in')
  assert((await zoom()) !== z0, 'zoom não mudou')
  await click('fit')
  assert((await zoom()) === z0, 'ajustar não restaurou')
  await click('mode-result')
  for (const bg of ['black', 'white', 'gray']) await click(`bg-${bg}`)
  await shot('05-fundo-cinza')
  await click('bg-checker')
  await shot('05-quadriculado')
  await click('mode-original')
  await click('mode-compare')
})

await test('5 e 6. Salvar PNG e confirmar transparência', async () => {
  await click('bg-white') // o fundo da prévia não pode ir para o arquivo
  await stubSave(single)
  await click('save')
  await until(() => existsSync(single), 'arquivo salvo', 20_000)
  await click('bg-checker')
  const i = png(single)
  assert(i.format === 'PNG' && i.mode === 'RGBA', JSON.stringify(i))
  assert(i.transparent > 0.15 && i.opaque > 0.15, `alpha suspeito ${JSON.stringify(i)}`)
  return `RGBA ${i.size.join('x')}, ${(i.transparent * 100).toFixed(0)}% transparente, ${(i.opaque * 100).toFixed(0)}% opaco`
})

await test('Proteção: salvar nunca grava por cima do original', async () => {
  await app.evaluate(({ dialog }, p) => {
    let n = 0
    dialog.showSaveDialog = async () => (n++ === 0 ? { canceled: false, filePath: p } : { canceled: true })
    dialog.showMessageBox = async () => ({ response: 0 })
  }, join(fx, 'astronauta.png'))
  await click('save')
  await page.waitForTimeout(800)
  assert(sha(originals[0]) === originalHashes[0], 'original alterado!')
})

const batchFiles = readdirSync(join(fx, 'lote'))
await test('7. Importar várias imagens (PNG, JPG, WEBP, BMP, TIFF)', async () => {
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'lote')) // pasta inteira
  const s = await settled('ler lote', 60_000)
  assert(s.items.length === 1 + batchFiles.length, `esperava ${1 + batchFiles.length}, veio ${s.items.length}`)
  assert(s.items.every((i) => i.status !== 'invalid'), JSON.stringify(s.items.map((i) => i.error)))
  await click('nav-batch')
  assert((await page.locator('[data-testid="batch-row"]').count()) === s.items.length, 'linhas da tabela')
  const tiff = s.items.find((i) => i.name.endsWith('.tiff'))
  const loads = await page.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u }), tiff.originalUrl)
  assert(loads, 'prévia do TIFF não carregou')
})

await test('8. Processar em lote, um por vez, com progresso', async () => {
  await click('process-all')
  let maxRunning = 0
  await until(async () => {
    const s = await state()
    maxRunning = Math.max(maxRunning, s.items.filter((i) => i.status === 'processing').length)
    return s.items.every((i) => i.status === 'done' || i.status === 'error')
  }, 'lote')
  const s = await state()
  assert(s.items.every((i) => i.status === 'done'), JSON.stringify(s.items.map((i) => [i.name, i.error])))
  assert(maxRunning <= 1, `rodaram ${maxRunning} ao mesmo tempo`)
  assert(await page.isVisible('[data-testid="progress"]'), 'sem barra de progresso')
  await shot('08-lote')
  return `${s.items.length} concluídas`
})

await test('Exportar todas e tratar arquivos existentes', async () => {
  await page.evaluate((d) => window.api.setSettings({ outputDir: d }), outDir)
  await click('save-all')
  // astronauta_sem_fundo.png já existe (teste 6): tem que perguntar
  await page.waitForSelector('[data-testid="conflict"]', { timeout: 10_000 })
  const h = sha(single)
  await shot('09-conflito')
  await click('conflict-rename')
  const s = await until(async () => { const s = await state(); return s.items.every((i) => i.savedPath) && s }, 'salvar todas', 20_000)
  assert(sha(single) === h, 'arquivo existente foi alterado')
  assert(existsSync(join(outDir, 'astronauta_sem_fundo (2).png')), 'faltou o nome (2)')
  for (const i of s.items) assert(png(i.savedPath).mode === 'RGBA', `${i.savedPath} sem alpha`)
  assert(new Set(s.items.map((i) => i.savedPath)).size === s.items.length, 'caminhos repetidos')
  return readdirSync(outDir).join(', ')
})

await test('Renomear arquivo e padrão de nomes', async () => {
  await page.evaluate(() => window.api.setSettings({ namePattern: '{n}_{nome}_{modelo}' }))
  const s = await state()
  await page.evaluate((id) => window.api.renameItem(id, 'meu:nome\\ruim?'), s.items[1].id)
  const dir = join(root, 'nomes')
  const r = await page.evaluate(([ids, dir]) => window.api.saveMany(ids, { dir }), [[s.items[0].id, s.items[1].id], dir])
  assert(r.saved.length === 2, JSON.stringify(r))
  const names = readdirSync(dir).sort()
  assert(names.includes('1_astronauta_isnet-general-use.png') && names.includes('meu_nome_ruim_.png'), names.join(','))
  await page.evaluate(() => window.api.setSettings({ namePattern: '{nome}_sem_fundo' }))
})

let isnetAstro
await test('9 e 10. Trocar o modelo e reprocessar (birefnet-general-lite)', async () => {
  const first = await item('astronauta.png')
  isnetAstro = sha(first.resultPath ?? single)
  await click('nav-workspace')
  await page.locator('aside, .overflow-x-auto').first()
  await page.click('button[title="astronauta.png"]')
  await page.selectOption('[data-testid="model-select"]', 'birefnet-general-lite')
  await click('process')
  await settled('birefnet')
  const it = await item('astronauta.png')
  assert(it.status === 'done', it.error)
  assert(it.resultModel === 'birefnet-general-lite', it.resultModel)
  assert(it.resultUrl !== first.resultUrl, 'URL do resultado não mudou (cache)')
  assert(sha(it.resultPath) !== isnetAstro, 'resultado idêntico ao do isnet')
  const i = png(it.resultPath)
  assert(i.mode === 'RGBA' && i.transparent > 0.15, JSON.stringify(i))
  await shot('10-birefnet')
  return `${it.device} ${it.timeMs} ms`
})

await test('11. GPU: teste real na tela de configurações', async () => {
  await click('nav-settings')
  await click('gpu-test')
  await page.waitForSelector('[data-testid="gpu-test-result"]', { timeout: 300_000 })
  const t = await page.textContent('[data-testid="gpu-test-result"]')
  await page.locator('[data-testid="gpu-test"]').scrollIntoViewIfNeeded()
  await shot('11-diagnostico')
  assert(t.includes('GPU confirmada') && t.includes('CUDAExecutionProvider'), t)
  return t
})

await test('11b. Modo somente CPU funciona', async () => {
  await page.selectOption('[data-testid="device"]', 'cpu')
  const a = await item('astronauta.png')
  await page.evaluate((id) => window.api.process([id], { model: 'isnet-general-use' }), a.id)
  await settled('cpu')
  const it = await item('astronauta.png')
  await page.selectOption('[data-testid="device"]', 'auto')
  assert(it.status === 'done' && it.device === 'cpu', `${it.status} ${it.device} ${it.error}`)
  return `${it.timeMs} ms`
})

await test('Opções avançadas: alpha matting, limpar máscara, halo e só máscara', async () => {
  const a = await item('astronauta.png')
  const base = { alphaMatting: false, fgThreshold: 240, bgThreshold: 10, erodeSize: 10, postProcessMask: false, decontaminate: false, onlyMask: false, vitmatte: false, vitmatteModel: 'small-distinctions-646' }
  const run = async (o) => {
    await page.evaluate(([id, options]) => window.api.process([id], { model: 'isnet-general-use', options }), [a.id, { ...base, ...o }])
    await settled(JSON.stringify(o))
    const it = await item('astronauta.png')
    assert(it.status === 'done', it.error)
    return { hash: sha(it.resultPath), info: png(it.resultPath) }
  }
  const plain = await run({})
  for (const o of [{ alphaMatting: true }, { postProcessMask: true }, { decontaminate: true }]) {
    const r = await run(o)
    assert(r.hash !== plain.hash, `sem efeito: ${JSON.stringify(o)}`)
  }
  const mask = await run({ onlyMask: true })
  assert(mask.info.mode === 'L', JSON.stringify(mask.info))
})

await test('Alpha matting em imagem enorme é recusado com aviso', async () => {
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'enorme_30mp.jpg'))
  await settled('ler enorme', 60_000)
  const g = await item('enorme_30mp.jpg')
  const options = { ...(await state()).settings.options, alphaMatting: true }
  await page.evaluate(([id, options]) => window.api.process([id], { model: 'isnet-general-use', options }), [g.id, options])
  await settled('recusar', 60_000)
  const it = await item('enorme_30mp.jpg')
  await page.evaluate((id) => window.api.removeItems([id]), g.id)
  assert(it.status === 'error' && /alpha matting/.test(it.error), `${it.status} ${it.error}`)
  return it.error
})

await test('Perfil de cor (ICC) é preservado no PNG', async () => {
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'com_perfil.jpg'))
  await settled('ler perfil', 30_000)
  const a = await item('com_perfil.jpg')
  await page.evaluate((id) => window.api.process([id], { model: 'isnet-general-use' }), a.id)
  await settled('processar perfil')
  const it = await item('com_perfil.jpg')
  assert(it.status === 'done', it.error)
  const i = png(it.resultPath)
  await page.evaluate((id) => window.api.removeItems([id]), it.id)
  assert(i.mode === 'RGBA' && i.icc, JSON.stringify(i))
})

await test('Imagem acima de 250 MP é recusada', async () => {
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'acima_de_250mp.png'))
  await settled('ler 256 MP', 60_000)
  const it = await item('acima_de_250mp.png')
  await page.evaluate((id) => window.api.removeItems([id]), it.id)
  assert(it.status === 'invalid' && /250/.test(it.error), `${it.status} ${it.error}`)
  return it.error
})

await test('Abrir e localizar só funcionam para caminhos conhecidos', async () => {
  // substitui as chamadas ao Windows para registrar o que seria aberto
  await app.evaluate(({ shell }) => {
    globalThis.shellCalls = []
    shell.showItemInFolder = (p) => { globalThis.shellCalls.push(['reveal', p]) }
    shell.openPath = async (p) => { globalThis.shellCalls.push(['open', p]); return '' }
  })
  const calls = () => app.evaluate(() => globalThis.shellCalls.splice(0))
  const saved = (await state()).items.find((i) => i.savedPath).savedPath
  const windows = process.env.SystemRoot
  await page.evaluate((p) => window.api.reveal(p), join(windows, 'notepad.exe'))
  assert((await calls()).length === 0, 'localizou arquivo desconhecido')
  await page.evaluate((p) => window.api.reveal(p), saved)
  const revealed = await calls()
  assert(revealed.length === 1 && revealed[0][0] === 'reveal', JSON.stringify(revealed))
  await page.evaluate((p) => window.api.openPath(p), windows)
  await page.evaluate((p) => window.api.openPath(p), join(windows, 'notepad.exe'))
  assert((await calls()).length === 0, 'abriu caminho não permitido')
  const dir = (await page.evaluate(() => window.api.getEnv())).modelsDir
  await page.evaluate((p) => window.api.openPath(p), dir)
  const opened = await calls()
  assert(opened.length === 1 && opened[0][0] === 'open', JSON.stringify(opened))
})

await test('12. Arquivos inválidos são tratados sem travar', async () => {
  const r = await page.evaluate((p) => window.api.addPaths(p), [join(fx, 'corrompida.png'), join(fx, 'cortada.jpg'), join(fx, 'notas.txt'), join(fx, 'nao_existe.png')])
  assert(r.added === 2 && r.rejected.length === 2, JSON.stringify(r))
  await settled('inválidas', 30_000)
  const a = await item('corrompida.png')
  const b = await item('cortada.jpg')
  assert(a.status === 'invalid' && b.status === 'invalid', `${a.status} ${b.status}`)
  await click('nav-batch')
  await shot('12-invalidas')
  await page.evaluate((ids) => window.api.removeItems(ids), [a.id, b.id])
  assert((await state()).worker.state === 'ready', 'worker caiu')
  return `${a.error}`
})

await test('Erro de modelo é mostrado e a fila continua', async () => {
  const s = await state()
  await page.evaluate((id) => window.api.process([id], { model: 'modelo-que-nao-existe' }), s.items[0].id)
  await page.evaluate((id) => window.api.process([id], { model: 'isnet-general-use' }), s.items[1].id)
  const after = await settled('erro de modelo')
  assert(after.items[0].status === 'error', after.items[0].status)
  assert(after.items[1].status === 'done', after.items[1].status)
  return after.items[0].error
})

await test('13. Imagem grande (6000×4000)', async () => {
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'grande_24mp.jpg'))
  await settled('ler grande', 60_000)
  const g = await item('grande_24mp.jpg')
  await page.evaluate((id) => window.api.process([id], { model: 'isnet-general-use' }), g.id)
  let worst = 0
  await until(async () => {
    const t = Date.now()
    const i = await item('grande_24mp.jpg')
    worst = Math.max(worst, Date.now() - t)
    return ['done', 'error'].includes(i.status)
  }, 'grande')
  const it = await item('grande_24mp.jpg')
  assert(it.status === 'done' && it.resultWidth === 6000 && it.resultHeight === 4000, `${it.status} ${it.error}`)
  assert(png(it.resultPath).mode === 'RGBA', 'sem alpha')
  assert(worst < 2000, `interface demorou ${worst} ms para responder`)
  await page.evaluate((id) => window.api.removeItems([id]), g.id)
  return `${it.timeMs} ms; resposta máx. da interface ${worst} ms`
})

await test('Cancelar a fila e continuar usando', async () => {
  const s = await state()
  const ids = s.items.map((i) => i.id)
  await page.evaluate((ids) => window.api.process(ids, { model: 'birefnet-general-lite' }), ids)
  await until(async () => (await state()).items.some((i) => i.stage === 'inferring'), 'começar', 120_000)
  await page.evaluate(() => window.api.cancel('all'))
  const after = await settled('cancelar', 60_000)
  assert(after.items.filter((i) => i.status === 'cancelled').length >= ids.length - 1, after.items.map((i) => i.status).join())
  await until(async () => (await state()).worker.state === 'ready', 'reiniciar', 60_000)
  await page.waitForTimeout(1500)
  const procs = workerProcs()
  // o python.exe do ambiente uv é um lançador + o Python real: no máximo 2
  assert(procs.length - baselineProcs <= 2, `processos órfãos: ${procs}`)
  await page.evaluate((id) => window.api.process([id], { model: 'isnet-general-use' }), ids[0])
  const ok = await settled('depois do cancelamento')
  assert(ok.items[0].status === 'done', ok.items[0].error)
})

await test('Queda do processo Python: erro na imagem e a fila segue', async () => {
  const ids = (await state()).items.slice(0, 2).map((i) => i.id)
  await page.evaluate((ids) => window.api.process(ids, { model: 'bria-rmbg' }), ids)
  await until(async () => ['loading', 'inferring'].includes((await state()).items[0].stage), 'começar', 120_000)
  const pids = workerProcs()
  assert((await state()).items[0].status === 'processing', 'terminou antes de dar para derrubar')
  for (const pid of pids) { try { process.kill(pid) } catch {} }
  const after = await settled('recuperar da queda')
  assert(after.items[0].status === 'error', after.items[0].status)
  assert(after.items[1].status === 'done', `${after.items[1].status} ${after.items[1].error}`)
})

await test('Importar com processamento e salvamento automáticos', async () => {
  const auto = join(root, 'auto')
  await page.evaluate((d) => window.api.setSettings({ autoProcess: true, autoSave: true, outputDir: d, defaultModel: 'isnet-general-use' }), auto)
  await page.evaluate(() => window.api.clearItems())
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'lote', 'cafe.webp'))
  await until(async () => existsSync(join(auto, 'cafe_sem_fundo.png')) && (await state()).items[0]?.savedPath, 'salvar sozinho', 120_000)
  await page.evaluate(() => window.api.setSettings({ autoProcess: false }))
})

await test('Recentes: abrir resultado e reprocessar', async () => {
  await page.evaluate(() => window.api.clearItems())
  await click('nav-recents')
  const n = await page.locator('[data-testid="recent"]').count()
  assert(n > 0, 'histórico vazio')
  await shot('14-recentes')
  const h = (await state()).history.find((h) => h.savedPath && h.resultExists && h.originalExists)
  const id = await page.evaluate((id) => window.api.historyOpen(id, false), h.id)
  await settled('abrir recente')
  const it = (await state()).items.find((i) => i.id === id)
  assert(it.status === 'done' && it.resultPath === h.savedPath, `${it.status} ${it.resultPath}`)
  await page.evaluate(() => window.api.clearItems())
  const id2 = await page.evaluate((id) => window.api.historyOpen(id, true), h.id)
  await settled('abrir original')
  await page.evaluate((id) => window.api.process([id]), id2)
  const s = await settled('reprocessar recente')
  assert(s.items[0].status === 'done', s.items[0].error)
  return `${n} itens`
})

await test('Modelos: lista vem da instalação real', async () => {
  await click('nav-models')
  const env = await page.evaluate(() => window.api.getEnv())
  const cards = await page.locator('[data-testid^="model-"]').count()
  assert(cards === env.models.length, `${cards} cartões, ${env.models.length} modelos`)
  assert(!env.models.some((m) => ['sam', 'withoutbg', 'atlascloud', 'u2net_custom'].includes(m.name)), 'modelo incompatível listado')
  await shot('15-modelos')
  return `${cards} modelos, ${env.models.filter((m) => m.downloaded).length} baixados`
})

await test('Arrastar e soltar arquivos na janela (evento real do Chromium)', async () => {
  await page.evaluate(() => window.api.clearItems())
  await click('nav-workspace')
  const cdp = await page.context().newCDPSession(page)
  const data = { items: [], files: [join(fx, 'astronauta.png'), join(fx, 'lote', 'gato.jpg')], dragOperationsMask: 1 }
  for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: 600, y: 400, data })
  const s = await until(async () => { const s = await state(); return s.items.length === 2 && s.items.every((i) => i.status === 'idle') && s }, 'soltar', 20_000)
  assert(await page.isVisible('[data-testid="batch-row"]'), 'não abriu o lote')
  await page.evaluate(() => window.api.clearItems())
  return s.items.map((i) => i.name).join(', ')
})

let historyBefore
await test('14. Fechar e abrir novamente', async () => {
  await click('nav-settings')
  await page.selectOption('[data-testid="theme"]', 'light')
  await page.selectOption('[data-testid="default-model"]', 'birefnet-general-lite')
  await page.fill('[data-testid="name-pattern"]', '{nome}-recorte')
  await page.locator('[data-testid="name-pattern"]').blur()
  await page.waitForTimeout(500)
  await shot('16-tema-claro')
  historyBefore = (await state()).history.length
  await app.close()
  await new Promise((r) => setTimeout(r, 4000))
  const left = workerProcs().length - baselineProcs
  assert(left <= 0, `${left} processo(s) Python continuaram abertos após fechar`)
  await launch()
})

await test('15. Configurações e histórico persistem', async () => {
  const s = await state()
  assert(s.settings.theme === 'light', s.settings.theme)
  assert(s.settings.defaultModel === 'birefnet-general-lite', s.settings.defaultModel)
  assert(s.settings.namePattern === '{nome}-recorte', s.settings.namePattern)
  assert(s.settings.autoSave === true && s.settings.outputDir.endsWith('auto'), 'saída não persistiu')
  assert(s.history.length === historyBefore, `histórico ${s.history.length} != ${historyBefore}`)
  await click('nav-settings')
  assert((await page.inputValue('[data-testid="default-model"]')) === 'birefnet-general-lite', 'tela não reflete')
  assert(await page.isChecked('[data-testid="auto-save"]'), 'checkbox não reflete')
  await click('nav-recents')
  await shot('17-reaberto')
  const unsavedGone = s.history.filter((h) => !h.savedPath).every((h) => !h.resultExists)
  assert(unsavedGone, 'cache de resultados não salvos não foi limpo')
})

await test('PC sem rembg: o app abre, avisa e não trava', async () => {
  await app.close()
  const emptyAppData = join(root, 'appdata-vazio')
  mkdirSync(emptyAppData, { recursive: true })
  const sys = join(process.env.SystemRoot, 'System32')
  // sem %APPDATA%\\uv e com um PATH sem uv, a detecção não encontra o ambiente
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['path', 'appdata'].includes(k.toLowerCase())))
  await launch({ ...env, APPDATA: emptyAppData, PATH: sys, REMBG_STUDIO_USERDATA: join(root, 'ud-sem-rembg') })
  const s = await until(async () => { const s = await state(); return s.worker.state === 'error' && s }, 'erro do worker', 30_000)
  await page.waitForSelector('text=Não encontrei o Python do rembg')
  await page.evaluate((p) => window.api.addPaths([p]), join(fx, 'astronauta.png'))
  const after = await settled('importar sem rembg', 20_000)
  assert(after.items[0].status === 'invalid' && /rembg/.test(after.items[0].error), JSON.stringify(after.items[0]))
  await shot('18-sem-rembg')
  return s.worker.error.slice(0, 60)
})

await test('Originais intactos ao final', () => {
  originals.forEach((p, i) => assert(sha(p) === originalHashes[i], `alterado: ${p}`))
})

await app?.close().catch(() => {})
const failed = results.filter((r) => !r.ok)
const unexpected = consoleErrors.filter((e) => !/404 \(Not Found\)/.test(e))
console.log(`\n${results.length - failed.length}/${results.length} passaram. Erros no console: ${unexpected.length}`)
if (unexpected.length) console.log([...new Set(unexpected)].slice(0, 10).join('\n'))
writeFileSync(join(root, 'resultado.json'), JSON.stringify({ results, consoleErrors }, null, 2))
process.exit(failed.length ? 1 : 0)
