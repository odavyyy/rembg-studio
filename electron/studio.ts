// Estado do app no processo principal: lista de imagens, fila sequencial,
// exportacao e historico. So um trabalho e enviado ao Python por vez.
import { EventEmitter } from 'node:events'
import { constants, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { copyFile, readdir, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import type {
  ConflictPolicy,
  HistoryEntry,
  Item,
  ModelStats,
  ProcessOptions,
  SaveManyResult,
  Settings,
  Toast,
} from '../shared/types'
import { readJson, sanitizeOptions, sanitizeSettings, writeJson, isModelName } from './store'
import { buildName, pathKey, sanitizeName, uniquePath } from './naming'
import type { JobEvent, Worker } from './worker'

export const INPUT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'])
const MAX_ITEMS = 1000
const MAX_HISTORY = 300

interface Job {
  jobId: string
  itemId: string
  model: string
  options: ProcessOptions
  output: string
  thumb: string
  submitted: boolean
}

export const fileUrl = (p: string, v: number | string = 0) => `rbs://f/?p=${encodeURIComponent(p)}&v=${v}`

export class Studio extends EventEmitter {
  settings: Settings
  items: Item[] = []
  history: HistoryEntry[]
  stats: ModelStats

  private queue: Omit<Job, 'jobId' | 'output' | 'thumb' | 'submitted'>[] = []
  private current: Job | null = null
  private paths: { settings: string; history: string; stats: string; thumbs: string; previews: string; results: string; historyThumbs: string }

  constructor(userData: string, private worker: Worker) {
    super()
    const cache = join(userData, 'cache')
    this.paths = {
      settings: join(userData, 'settings.json'),
      history: join(userData, 'history.json'),
      stats: join(userData, 'stats.json'),
      thumbs: join(cache, 'thumbs'),
      previews: join(cache, 'previews'),
      results: join(cache, 'results'),
      historyThumbs: join(userData, 'history-thumbs'),
    }
    this.settings = sanitizeSettings(readJson(this.paths.settings, {}))
    const history = readJson<unknown>(this.paths.history, [])
    this.history = Array.isArray(history)
      ? (history as HistoryEntry[]).filter((h) => h && typeof h.id === 'string' && typeof h.originalPath === 'string')
      : []
    const stats = readJson<unknown>(this.paths.stats, {})
    this.stats = stats && typeof stats === 'object' ? (stats as ModelStats) : {}
    // A fila nao e persistida, entao o cache de uma sessao anterior e descartado.
    // Resultados que nunca foram salvos nao viram copias acumuladas no disco.
    for (const d of [this.paths.thumbs, this.paths.previews, this.paths.results]) {
      rmSync(d, { recursive: true, force: true })
      mkdirSync(d, { recursive: true })
    }
    mkdirSync(this.paths.historyThumbs, { recursive: true })
    for (const h of this.history) {
      if (h.resultPath && this.isCache(h.resultPath)) h.resultPath = h.savedPath
    }
    this.pruneHistoryThumbs()
    this.saveHistory()

    worker.on('job', (e: JobEvent) => void this.onJob(e))
    worker.on('exit', (e: { intentional: boolean }) => this.onWorkerExit(e.intentional))
  }

  // ---------------- utilidades ----------------
  private isCache(p: string) {
    return resolve(p).toLowerCase().startsWith(resolve(this.paths.results).toLowerCase() + sep)
  }
  private toast(kind: Toast['kind'], text: string) {
    this.emit('toast', { kind, text } satisfies Toast)
  }
  private find(id: string) {
    return this.items.find((i) => i.id === id)
  }
  private patch(item: Item, changes: Partial<Item>) {
    Object.assign(item, changes)
    this.emit('item', item)
  }
  private emitItems() {
    this.emit('items', this.items)
  }

  /** Lista de arquivos que a interface pode ler pelo protocolo rbs: */
  canServe(p: string): boolean {
    const key = pathKey(p)
    const inside = (dir: string) => key.startsWith(resolve(dir).toLowerCase() + sep)
    if ([this.paths.thumbs, this.paths.previews, this.paths.results, this.paths.historyThumbs].some(inside)) return true
    const same = (q: string | null) => !!q && pathKey(q) === key
    return (
      this.items.some((i) => same(i.path) || same(i.savedPath) || same(i.resultPath)) ||
      this.history.some((h) => same(h.originalPath) || same(h.savedPath) || same(h.resultPath))
    )
  }

  setSettings(patch: Partial<Settings>): Settings {
    const merged = { ...this.settings, ...patch, options: { ...this.settings.options, ...(patch.options ?? {}) } }
    this.settings = sanitizeSettings(merged)
    writeJson(this.paths.settings, this.settings)
    this.emit('settings', this.settings)
    return this.settings
  }

  // ---------------- importacao ----------------
  private blankItem(path: string): Item {
    return {
      id: randomUUID(),
      path,
      name: basename(path),
      ext: extname(path).slice(1).toLowerCase(),
      sizeBytes: null,
      width: null,
      height: null,
      format: null,
      thumbUrl: null,
      originalUrl: null,
      status: 'probing',
      stage: null,
      error: null,
      model: null,
      resultUrl: null,
      resultThumbUrl: null,
      resultPath: null,
      resultModel: null,
      resultWidth: null,
      resultHeight: null,
      timeMs: null,
      inferMs: null,
      device: null,
      savedPath: null,
      outputName: null,
      addedAt: Date.now(),
      historyId: null,
    }
  }

  async addPaths(input: string[]): Promise<{ added: number; rejected: string[] }> {
    const rejected: string[] = []
    const files: string[] = []
    for (const raw of input.slice(0, MAX_ITEMS)) {
      if (typeof raw !== 'string' || !isAbsolute(raw)) continue
      try {
        const s = await stat(raw)
        if (s.isDirectory()) {
          // pastas arrastadas: inclui as imagens do primeiro nivel
          for (const n of (await readdir(raw)).sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }))) {
            if (INPUT_EXTS.has(extname(n).toLowerCase())) files.push(join(raw, n))
          }
        } else if (INPUT_EXTS.has(extname(raw).toLowerCase())) files.push(raw)
        else rejected.push(`${basename(raw)}: formato não suportado`)
      } catch {
        rejected.push(`${basename(raw)}: arquivo não encontrado`)
      }
    }
    const known = new Set(this.items.map((i) => pathKey(i.path)))
    const fresh: Item[] = []
    for (const f of files) {
      if (known.has(pathKey(f))) continue
      if (this.items.length + fresh.length >= MAX_ITEMS) {
        rejected.push(`Limite de ${MAX_ITEMS} imagens na fila atingido`)
        break
      }
      known.add(pathKey(f))
      fresh.push(this.blankItem(resolve(f)))
    }
    this.items.push(...fresh)
    this.emitItems()
    for (const item of fresh) void this.probe(item)
    return { added: fresh.length, rejected }
  }

  private async probe(item: Item, attempt = 0): Promise<void> {
    const thumb = join(this.paths.thumbs, `${item.id}.png`)
    const preview = join(this.paths.previews, `${item.id}.png`)
    try {
      const info = await this.worker.request<{ width: number; height: number; format: string; sizeBytes: number; preview: string | null }>(
        'probe',
        { path: item.path, thumb, preview },
      )
      if (!this.find(item.id)) return
      const changes: Partial<Item> = {
        width: info.width,
        height: info.height,
        format: info.format,
        sizeBytes: info.sizeBytes,
        thumbUrl: fileUrl(thumb, item.addedAt),
        originalUrl: fileUrl(info.preview ?? item.path, item.addedAt),
      }
      if (item.status === 'probing') changes.status = 'idle'
      this.patch(item, changes)
      if (this.settings.autoProcess && item.status === 'idle') this.process([item.id])
    } catch (e) {
      if (!this.find(item.id)) return
      const msg = (e as Error).message
      // o processo reiniciou (cancelamento) no meio da leitura: tenta de novo
      if ((msg === 'cancelled' || msg.includes('terminou')) && attempt < 3) return this.probe(item, attempt + 1)
      if (item.status === 'probing' || item.status === 'queued') {
        this.queue = this.queue.filter((j) => j.itemId !== item.id)
        this.patch(item, { status: 'invalid', error: msg })
      }
    }
  }

  // ---------------- fila ----------------
  process(ids: string[], opts?: { model?: string; options?: ProcessOptions }) {
    const model = isModelName(opts?.model) ? opts!.model! : this.settings.defaultModel
    const options = sanitizeOptions(opts?.options ?? this.settings.options)
    for (const id of ids) {
      const item = this.find(id)
      if (!item || ['invalid', 'queued', 'processing'].includes(item.status)) continue
      this.queue.push({ itemId: id, model, options })
      this.patch(item, { status: 'queued', model, error: null, stage: null })
    }
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.current) return
    const next = this.queue.shift()
    if (!next) return
    const item = this.find(next.itemId)
    if (!item) return this.pump()
    const stamp = `${item.id}-${Date.now()}`
    const job: Job = {
      ...next,
      jobId: randomUUID(),
      output: join(this.paths.results, `${stamp}.png`),
      thumb: join(this.paths.thumbs, `${stamp}-r.png`),
      submitted: false,
    }
    this.current = job
    this.patch(item, { status: 'processing', stage: 'loading', model: job.model })
    try {
      await this.worker.whenReady()
      if (this.current !== job) return // cancelado enquanto esperava
      job.submitted = true
      await this.worker.submitJob({
        jobId: job.jobId,
        input: item.path,
        output: job.output,
        thumb: job.thumb,
        model: job.model,
        options: job.options,
        device: this.settings.device,
      })
    } catch (e) {
      if (this.current !== job) return
      this.current = null
      this.patch(item, { status: 'error', stage: null, error: (e as Error).message })
      void this.pump()
    }
  }

  private async onJob(e: JobEvent) {
    const job = this.current
    if (!job || e.jobId !== job.jobId) return
    const item = this.find(job.itemId)
    if (e.type === 'progress') {
      if (item) this.patch(item, { stage: e.stage as Item['stage'] })
      return
    }
    this.current = null
    if (item) {
      if (e.type === 'error') {
        this.patch(item, { status: 'error', stage: null, error: e.error })
      } else {
        await this.finishItem(item, job, e as any)
      }
    }
    void this.pump()
  }

  private async finishItem(item: Item, job: Job, e: any) {
    const stamp = Date.now()
    const previous = item.resultPath
    this.patch(item, {
      status: 'done',
      stage: null,
      error: null,
      resultPath: job.output,
      resultUrl: fileUrl(job.output, stamp),
      resultThumbUrl: fileUrl(job.thumb, stamp),
      resultModel: job.model,
      resultWidth: e.width,
      resultHeight: e.height,
      timeMs: e.totalMs,
      inferMs: e.inferMs,
      device: e.device,
      savedPath: null,
    })
    if (previous && previous !== job.output && this.isCache(previous)) {
      if (!this.history.some((h) => h.resultPath === previous)) rmSync(previous, { force: true })
    }

    const s = this.stats[job.model]
    // a media so vale para execucoes no mesmo dispositivo
    const same = s && s.device === e.device
    this.stats[job.model] = {
      runs: same ? s.runs + 1 : 1,
      avgMs: same ? Math.round((s.avgMs * s.runs + e.inferMs) / (s.runs + 1)) : e.inferMs,
      device: e.device,
    }
    writeJson(this.paths.stats, this.stats)
    this.emit('stats', this.stats)

    await this.recordHistory(item, job.thumb)

    if (this.settings.autoSave) {
      try {
        const dir = this.settings.outputDir ?? dirname(item.path)
        await this.writeResult(item, uniquePath(dir, this.outputBase(item)), false)
      } catch (err) {
        this.toast('error', `Não foi possível salvar automaticamente ${item.name}: ${(err as Error).message}`)
      }
    }
  }

  private onWorkerExit(intentional: boolean) {
    const job = this.current
    if (!job || !job.submitted) return
    this.current = null
    const item = this.find(job.itemId)
    if (item) {
      this.patch(
        item,
        intentional
          ? { status: 'cancelled', stage: null }
          : { status: 'error', stage: null, error: 'O processo do rembg caiu durante esta imagem (possível falta de memória). Tente um modelo mais leve.' },
      )
    }
    void this.pump()
  }

  cancel(ids: string[] | 'all') {
    const match = (id: string) => ids === 'all' || ids.includes(id)
    const dropped = this.queue.filter((j) => match(j.itemId))
    this.queue = this.queue.filter((j) => !match(j.itemId))
    for (const j of dropped) {
      const item = this.find(j.itemId)
      if (item) this.patch(item, { status: 'cancelled', stage: null })
    }
    const job = this.current
    if (job && match(job.itemId)) {
      this.current = null
      const item = this.find(job.itemId)
      if (item) this.patch(item, { status: 'cancelled', stage: null })
      // a inferencia nao pode ser interrompida por dentro: reinicia o processo
      if (job.submitted) this.worker.abortCurrent()
      void this.pump()
    }
  }

  removeItems(ids: string[]) {
    this.cancel(ids)
    this.items = this.items.filter((i) => !ids.includes(i.id))
    this.emitItems()
  }

  // ---------------- exportacao ----------------
  outputBase(item: Item): string {
    if (item.outputName) return sanitizeName(item.outputName)
    const index = this.items.indexOf(item) + 1
    return buildName(this.settings.namePattern, item.name, item.resultModel ?? '', index)
  }

  renameItem(id: string, name: string) {
    const item = this.find(id)
    if (item) this.patch(item, { outputName: name.trim() ? sanitizeName(name) : null })
  }

  /** Protege os originais: nunca gravamos por cima de uma imagem de entrada. */
  isOriginal(target: string) {
    const key = pathKey(target)
    return this.items.some((i) => pathKey(i.path) === key) || this.history.some((h) => pathKey(h.originalPath) === key)
  }

  async writeResult(item: Item, target: string, overwrite: boolean) {
    if (!item.resultPath || !existsSync(item.resultPath)) throw new Error('O resultado não está mais disponível. Processe novamente.')
    if (this.isOriginal(target)) throw new Error('Esse caminho é uma imagem original. Escolha outro nome.')
    mkdirSync(dirname(target), { recursive: true })
    if (pathKey(target) !== pathKey(item.resultPath)) {
      await copyFile(item.resultPath, target, overwrite ? 0 : constants.COPYFILE_EXCL)
    }
    this.patch(item, { savedPath: target })
    const h = this.history.find((x) => x.id === item.historyId)
    if (h) {
      h.savedPath = target
      h.resultPath = target
      this.saveHistory()
    }
  }

  async saveMany(ids: string[], dir: string, policy?: ConflictPolicy): Promise<SaveManyResult> {
    const out: SaveManyResult = { saved: [], skipped: [], failed: [], dir }
    const list = ids.map((id) => this.find(id)).filter((i): i is Item => !!i && i.status === 'done')
    if (!policy) {
      const conflicts = list.map((i) => `${this.outputBase(i)}.png`).filter((n) => existsSync(join(dir, n)))
      if (conflicts.length) return { ...out, needsDecision: { conflicts, dir } }
    }
    const taken = new Set<string>() // nomes ja usados neste lote
    for (const item of list) {
      try {
        const base = this.outputBase(item)
        let target = join(dir, `${base}.png`)
        const exists = existsSync(target)
        if (policy === 'skip' && exists && !taken.has(pathKey(target))) {
          out.skipped.push(item.id)
          continue
        }
        const overwrite = policy === 'overwrite' && !taken.has(pathKey(target)) && !this.isOriginal(target)
        if (!overwrite) target = uniquePath(dir, base, taken)
        await this.writeResult(item, target, overwrite)
        taken.add(pathKey(target))
        out.saved.push({ id: item.id, path: target })
      } catch (e) {
        out.failed.push({ id: item.id, error: (e as Error).message })
      }
    }
    return out
  }

  // ---------------- historico ----------------
  private async recordHistory(item: Item, resultThumb: string) {
    const prev = this.history.find((h) => h.id === item.historyId)
    // se a execucao anterior nunca foi salva, ela e substituida
    if (prev && !prev.savedPath) this.history = this.history.filter((h) => h !== prev)
    const id = randomUUID()
    const thumb = join(this.paths.historyThumbs, `${id}.png`)
    let thumbUrl: string | null = null
    try {
      await copyFile(resultThumb, thumb)
      thumbUrl = fileUrl(thumb, 1)
    } catch {}
    this.history.unshift({
      id,
      name: item.name,
      originalPath: item.path,
      resultPath: item.resultPath,
      savedPath: null,
      model: item.resultModel!,
      date: Date.now(),
      thumbUrl,
      width: item.resultWidth,
      height: item.resultHeight,
      device: item.device,
      timeMs: item.timeMs,
    })
    this.history = this.history.slice(0, MAX_HISTORY)
    item.historyId = id
    this.pruneHistoryThumbs()
    this.saveHistory()
  }

  private pruneHistoryThumbs() {
    const keep = new Set(this.history.map((h) => `${h.id}.png`))
    for (const f of readdirSync(this.paths.historyThumbs)) {
      if (!keep.has(f)) rmSync(join(this.paths.historyThumbs, f), { force: true })
    }
  }

  historyView(): HistoryEntry[] {
    const isFile = (p: string | null) => {
      try {
        return !!p && statSync(p).isFile()
      } catch {
        return false
      }
    }
    return this.history.map((h) => ({ ...h, originalExists: isFile(h.originalPath), resultExists: isFile(h.resultPath) }))
  }

  private saveHistory() {
    writeJson(this.paths.history, this.history)
    this.emit('history', this.historyView())
  }

  historyRemove(ids: string[]) {
    // remove so o registro e a miniatura; nenhum arquivo do usuario e apagado
    this.history = this.history.filter((h) => !ids.includes(h.id))
    this.pruneHistoryThumbs()
    this.saveHistory()
  }

  async historyOpen(id: string, reprocess: boolean): Promise<string | null> {
    const h = this.history.find((x) => x.id === id)
    if (!h) return null
    const hasOriginal = existsSync(h.originalPath)
    const hasResult = !!h.resultPath && existsSync(h.resultPath)
    if (reprocess ? !hasOriginal : !hasResult) {
      this.toast('error', reprocess ? 'A imagem original não está mais disponível.' : 'O resultado não está mais disponível.')
      return null
    }
    const source = hasOriginal ? h.originalPath : h.resultPath!
    let item = this.items.find((i) => pathKey(i.path) === pathKey(source))
    if (!item) {
      item = this.blankItem(source)
      item.name = h.name
      this.items.push(item)
      this.emitItems()
      const auto = this.settings.autoProcess
      this.settings.autoProcess = false // abrir um recente nao dispara processamento
      try {
        await this.probe(item)
      } finally {
        this.settings.autoProcess = auto
      }
    }
    if (!reprocess && hasResult && item.status !== 'queued' && item.status !== 'processing') {
      this.patch(item, {
        status: 'done',
        resultPath: h.resultPath,
        resultUrl: fileUrl(h.resultPath!, Date.now()),
        resultThumbUrl: h.thumbUrl,
        resultModel: h.model,
        model: h.model,
        resultWidth: h.width,
        resultHeight: h.height,
        timeMs: h.timeMs,
        device: h.device,
        savedPath: h.savedPath,
        historyId: h.id,
      })
    }
    return item.id
  }
}
