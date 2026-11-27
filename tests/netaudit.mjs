// Mede a rede usada pelo app numa sessao sem pedir atualizacao nem baixar modelo:
// registro de rede do Chromium + conexoes TCP/UDP de todos os processos do app.
// Uso: node tests/netaudit.mjs <pasta-vazia> [caminho-do-exe]
import { _electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2])
const packaged = process.argv[3] && !process.argv[3].startsWith('--') ? resolve(process.argv[3]) : null
if (existsSync(root) && readdirSync(root).length) throw new Error('use uma pasta vazia')
mkdirSync(root, { recursive: true })
const PY = join(process.env.APPDATA, 'uv', 'tools', 'rembg', 'Scripts', 'python.exe')
execFileSync(PY, ['-I', '-B', 'tests/make_fixtures.py', join(root, 'fx')])
const log = join(root, 'netlog.json')
const app = await _electron.launch({
  executablePath: packaged ?? createRequire(import.meta.url)('electron'),
  args: [...(packaged ? [] : ['.']), `--log-net-log=${log}`],
  colorScheme: null,
  env: { ...process.env, REMBG_STUDIO_USERDATA: join(root, 'userdata') },
})
const page = await app.firstWindow()
await page.waitForSelector('[data-testid="nav-workspace"]')
const rootPid = app.process().pid
const remote = new Set()
function sample() {
  const procs = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.Name)" }']).toString().split(/\r?\n/).map((l) => l.split(' ')).filter((p) => p.length >= 3)
  const ids = new Map([[rootPid, 'app']])
  for (let i = 0; i < 6; i++) for (const [pid, parent, name] of procs) if (ids.has(Number(parent))) ids.set(Number(pid), name)
  for (const line of execFileSync('netstat', ['-ano']).toString('latin1').split(/\r?\n/)) {
    const f = line.trim().split(/\s+/)
    if (f.length < 4 || !['TCP', 'UDP'].includes(f[0])) continue
    const pid = Number(f.at(-1))
    if (ids.has(pid) && !/^(127\.|\[::1\]|0\.0\.0\.0|\[::\]|\*:)/.test(f[2])) remote.add(`${ids.get(pid)} ${f[0]} ${f[2]}`)
  }
  return ids.size
}
let processes = 0
const watch = async (seconds) => {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    processes = Math.max(processes, sample())
    await page.waitForTimeout(1000)
  }
}
await page.evaluate((p) => window.api.addPaths([p]), join(root, 'fx', 'lote'))
await watch(5)
const ids = await page.evaluate(async () => (await window.api.getInitialState()).items.map((i) => i.id))
await page.evaluate((ids) => window.api.process(ids, { model: 'isnet-general-use' }), ids)
await watch(15)
for (const nav of ['batch', 'recents', 'models', 'settings', 'about', 'workspace']) {
  const el = await page.$(`[data-testid="nav-${nav}"]`)
  if (el) await el.click()
  await watch(3)
}
// controle positivo opcional: a verificacao de atualizacao DEVE aparecer no registro
let updateState = null
if (process.argv.includes('--check-updates')) {
  updateState = await page.evaluate(async () => { const s = await window.api.updateCheck(); return { status: s.status, message: s.message, latest: s.latestVersion, test: s.testServer } })
  await watch(5)
}
await watch(45)
const done = await page.evaluate(async () => (await window.api.getInitialState()).items.filter((i) => i.status === 'done').length)
const cookies = await app.evaluate(async ({ session }) => (await session.defaultSession.cookies.get({})).length)
await app.close()

// o arquivo pode terminar sem o fechamento do JSON
const text = readFileSync(log, 'utf8')
const urls = [...new Set([...text.matchAll(/"url":"((?:https?|wss?):[^"]+)"/g)].map((m) => m[1]))]
const hosts = [...new Set([...text.matchAll(/"host":"((?!127\.0\.0\.1|localhost)[^"]+)"/g)].map((m) => m[1]))]
const report = { updateState, processed: done, processesObserved: processes, cookies, chromiumHttpUrls: urls, chromiumHosts: hosts, externalConnections: [...remote] }
writeFileSync(join(root, 'netaudit.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 1))
