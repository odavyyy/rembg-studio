// Gerencia o processo Python (python/worker.py) que roda o rembg instalado.
// Comunicacao por stdin/stdout em JSON, uma mensagem por linha. Sem rede.
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import type { WorkerStatus } from '../shared/types'

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer?: NodeJS.Timeout }
export type JobEvent =
  | { type: 'progress'; jobId: string; stage: string; model?: string }
  | { type: 'done'; jobId: string; [k: string]: any }
  | { type: 'error'; jobId: string; error: string; detail?: string }

// O Windows procura executaveis tambem na pasta atual; fixamos uma pasta do
// sistema para que um uv.exe/nvidia-smi.exe plantado ao lado nao seja usado.
const safeCwd = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32') : undefined

/** Procura o Python do ambiente uv onde o rembg foi instalado. */
export async function detectPython(): Promise<string | null> {
  const appdata = process.env.APPDATA
  const candidates: string[] = []
  if (appdata) candidates.push(join(appdata, 'uv', 'tools', 'rembg', 'Scripts', 'python.exe'))
  for (const c of candidates) if (existsSync(c)) return c
  const toolDir = await new Promise<string | null>((resolve) => {
    execFile('uv', ['tool', 'dir'], { timeout: 8000, windowsHide: true, cwd: safeCwd }, (err, out) =>
      resolve(err ? null : String(out).trim() || null),
    )
  })
  if (toolDir) {
    const p = join(toolDir, 'rembg', 'Scripts', 'python.exe')
    if (existsSync(p)) return p
  }
  return null
}

export class Worker extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<string, Pending>()
  private seq = 0
  private stderrTail: string[] = []
  private intentionalKill = false
  private restarts = 0
  status: WorkerStatus = { state: 'stopped', pythonPath: null, error: null, loadedModel: null, loadedDevice: null }
  private readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] = []
  private shuttingDown = false

  constructor(private scriptPath: string, private resolvePython: () => Promise<string | null>) {
    super()
  }

  private setStatus(patch: Partial<WorkerStatus>) {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.status)
  }

  async start(): Promise<void> {
    if (this.proc) return
    const python = await this.resolvePython()
    if (!python || !existsSync(python)) {
      this.setStatus({
        state: 'error',
        pythonPath: python,
        error:
          'Não encontrei o Python do rembg. Indique o caminho em Configurações > Diagnóstico (normalmente %APPDATA%\\uv\\tools\\rembg\\Scripts\\python.exe).',
      })
      this.failReady(new Error(this.status.error!))
      return
    }
    if (!existsSync(this.scriptPath)) {
      this.setStatus({ state: 'error', pythonPath: python, error: `worker.py não encontrado em ${this.scriptPath}` })
      this.failReady(new Error(this.status.error!))
      return
    }
    this.setStatus({ state: this.restarts ? 'restarting' : 'starting', pythonPath: python, error: null, loadedModel: null, loadedDevice: null })
    this.intentionalKill = false
    // -I: modo isolado (ignora PYTHONPATH e o site do usuario). Argumentos fixos,
    // sem shell: nada digitado pelo usuario vira comando.
    const proc = spawn(python, ['-I', '-B', this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    })
    this.proc = proc
    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => this.onLine(line))
    proc.stderr.on('data', (d: Buffer) => {
      const lines = d.toString('utf8').split(/\r?\n/).filter(Boolean)
      this.stderrTail.push(...lines)
      if (this.stderrTail.length > 60) this.stderrTail.splice(0, this.stderrTail.length - 60)
    })
    proc.on('error', (err) => {
      this.setStatus({ state: 'error', error: `Falha ao iniciar o Python: ${err.message}` })
    })
    proc.on('exit', (code) => {
      const wasIntentional = this.intentionalKill
      this.proc = null
      const err = new Error(wasIntentional ? 'cancelled' : `O processo do rembg terminou (codigo ${code}).`)
      for (const [, p] of this.pending) {
        if (p.timer) clearTimeout(p.timer)
        p.reject(err)
      }
      this.pending.clear()
      if (this.shuttingDown) return
      const fatal = this.status.state === 'error'
      const willRestart = !fatal && (wasIntentional || this.restarts < 5)
      if (willRestart) {
        if (!wasIntentional) this.restarts++
        // sai de ready/busy antes de avisar: novos pedidos esperam o processo novo
        this.setStatus({ state: 'restarting', loadedModel: null, loadedDevice: null })
        setTimeout(() => this.start(), wasIntentional ? 50 : 1000)
      } else if (!fatal) {
        const tail = this.stderrTail.slice(-8).join(String.fromCharCode(10))
        this.setStatus({ state: 'error', error: `O processo do rembg caiu várias vezes. Veja o diagnóstico. ${tail}` })
        this.failReady(new Error(this.status.error!))
      }
      this.emit('exit', { intentional: wasIntentional })
    })
  }

  private failReady(e: Error) {
    for (const w of this.readyWaiters.splice(0)) w.reject(e)
  }

  whenReady(): Promise<void> {
    if (this.status.state === 'ready' || this.status.state === 'busy') return Promise.resolve()
    if (this.status.state === 'error') return Promise.reject(new Error(this.status.error ?? 'erro'))
    return new Promise((resolve, reject) => this.readyWaiters.push({ resolve, reject }))
  }

  private onLine(line: string) {
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    switch (msg.type) {
      case 'ready':
        this.restarts = 0
        this.setStatus({ state: 'ready', error: null })
        for (const w of this.readyWaiters.splice(0)) w.resolve()
        break
      case 'fatal':
        this.setStatus({ state: 'error', error: msg.error })
        this.failReady(new Error(msg.error))
        break
      case 'result': {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (p.timer) clearTimeout(p.timer)
        if (msg.ok) p.resolve(msg.data)
        else p.reject(new Error(msg.error))
        break
      }
      case 'progress':
      case 'done':
      case 'error':
        if (msg.type === 'done') {
          this.setStatus({ loadedDevice: msg.device })
        }
        if (msg.type === 'progress' && msg.model) this.setStatus({ loadedModel: msg.model })
        this.emit('job', msg as JobEvent)
        break
    }
  }

  private write(obj: object) {
    if (!this.proc) throw new Error('O processo do rembg não está rodando.')
    this.proc.stdin.write(JSON.stringify(obj) + '\n')
  }

  async request<T = any>(cmd: string, payload: object = {}, timeoutMs = 0): Promise<T> {
    await this.whenReady()
    const id = `r${++this.seq}`
    return new Promise<T>((resolve, reject) => {
      const p: Pending = { resolve, reject }
      if (timeoutMs > 0) p.timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Tempo esgotado esperando o rembg.'))
      }, timeoutMs)
      this.pending.set(id, p)
      try {
        this.write({ id, cmd, ...payload })
      } catch (e) {
        this.pending.delete(id)
        reject(e as Error)
      }
    })
  }

  async submitJob(job: object): Promise<void> {
    await this.whenReady()
    this.write({ cmd: 'process', ...job })
  }

  /** Interrompe o processamento atual matando o processo; ele reinicia sozinho. */
  abortCurrent() {
    if (!this.proc) return
    this.intentionalKill = true
    this.proc.kill()
  }

  async restart(): Promise<void> {
    this.restarts = 0
    if (this.status.state === 'error') this.setStatus({ state: 'stopped', error: null })
    if (this.proc) {
      this.intentionalKill = true
      this.proc.kill()
    } else {
      await this.start()
    }
  }

  stop() {
    if (!this.proc) return
    this.shuttingDown = true
    try {
      this.proc.stdin.write(JSON.stringify({ cmd: 'shutdown' }) + '\n')
    } catch {}
    const p = this.proc
    setTimeout(() => p.kill(), 1500)
  }

  lastStderr() {
    return this.stderrTail.slice(-20).join('\n')
  }
}

/** Informacao da placa via nvidia-smi (chamado so sob demanda). */
export function queryNvidiaSmi(): Promise<{ name: string; used: number; total: number; driver: string } | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,memory.used,memory.total,driver_version', '--format=csv,noheader,nounits'],
      { timeout: 6000, windowsHide: true, cwd: safeCwd },
      (err, out) => {
        if (err) return resolve(null)
        const first = String(out).split(/\r?\n/)[0]
        const [name, used, total, driver] = first.split(',').map((s) => s.trim())
        if (!name) return resolve(null)
        resolve({ name, used: Number(used), total: Number(total), driver })
      },
    )
  })
}
