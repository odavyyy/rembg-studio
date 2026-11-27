// Atualizador do Rembg Studio. Atualiza SOMENTE o aplicativo: nao toca no
// ambiente Python, no rembg, no CUDA, nos modelos nem nos dados do usuario.
// So acessa a rede quando o usuario pede (verificar / baixar).
import { app, dialog, net, shell, type BrowserWindow } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, createReadStream, existsSync, mkdirSync, openSync, readSync, realpathSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { evaluateRelease, expectedHash, looksLikeArtifact, REPO, type Candidate, type InstallType } from './release'
import type { UpdateState } from '../shared/types'

const STALL_MS = 60_000

interface Endpoints {
  api: string
  downloads: string
  test: boolean
}

// Servidor falso para testar o app empacotado. So vale para 127.0.0.1 e junto
// com um perfil de teste isolado; a interface avisa quando esta ativo.
function endpoints(): Endpoints {
  const test = process.env.REMBG_STUDIO_UPDATE_TEST_URL
  if (test && process.env.REMBG_STUDIO_USERDATA && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(test)) {
    return { api: test, downloads: `${test}/${REPO}/releases/download`, test: true }
  }
  return { api: 'https://api.github.com', downloads: `https://github.com/${REPO}/releases/download`, test: false }
}

export function detectInstallType(): InstallType {
  if (!app.isPackaged) return 'dev'
  const portable = process.env.PORTABLE_EXECUTABLE_FILE
  // a variavel e herdada por processos filhos; o portatil de verdade roda extraido no %TEMP%
  // forma longa dos dois caminhos: o %TEMP% pode vir no formato curto (8.3)
  const full = (p: string) => {
    try {
      return realpathSync.native(p).toLowerCase()
    } catch {
      return resolve(p).toLowerCase()
    }
  }
  if (portable && existsSync(portable) && full(process.execPath).startsWith(full(tmpdir()) + sep)) return 'portable'
  if (existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`))) return 'installed'
  return 'zip'
}

function sha256File(path: string): Promise<string> {
  return new Promise((ok, fail) => {
    const h = createHash('sha256')
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail)
  })
}

interface Signature {
  status: string
  subject: string | null
}

function authenticode(path: string): Promise<Signature> {
  const system = process.env.SystemRoot ?? 'C:\\Windows'
  return new Promise((ok, fail) => {
    // o caminho vai por variavel de ambiente: nada e interpolado no comando
    execFile(
      join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', '$s = Get-AuthenticodeSignature -LiteralPath $env:RS_VERIFY_PATH; "$($s.Status)`n$($s.SignerCertificate.Subject)"'],
      { env: { ...process.env, RS_VERIFY_PATH: path, PSModulePath: join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules') }, timeout: 60_000, windowsHide: true },
      (err, out) => {
        if (err) return fail(new Error('Não foi possível conferir a assinatura digital.'))
        const [status, subject] = String(out).split(/\r?\n/)
        ok({ status: status.trim(), subject: subject?.trim() || null })
      },
    )
  })
}

export interface UpdaterHooks {
  window: () => BrowserWindow | null
  /** ha imagens na fila ou sendo processadas */
  isBusy: () => boolean
  unsavedResults: () => number
  /** encerra o processo Python e espera ele sair */
  stopWorker: () => Promise<void>
  resumeWorker: () => void
}

export class Updater extends EventEmitter {
  private ends = endpoints()
  private dir: string
  private candidate: Candidate | null = null
  private file: string | null = null
  private hash: string | null = null
  private abort: (() => void) | null = null
  state: UpdateState

  constructor(userData: string, private hooks: UpdaterHooks) {
    super()
    this.dir = join(userData, 'updates')
    this.cleanup()
    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
      installType: detectInstallType(),
      testServer: this.ends.test,
      latestVersion: null,
      notes: null,
      publishedAt: null,
      assetName: null,
      size: null,
      received: 0,
      bytesPerSecond: 0,
      signature: null,
      message: null,
      checkedAt: null,
    }
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch }
    this.emit('state', this.state)
  }

  /** apaga apenas a pasta de temporarios do proprio atualizador */
  private cleanup() {
    try {
      rmSync(this.dir, { recursive: true, force: true })
    } catch {
      // um instalador ainda aberto pode segurar o arquivo; fica para a proxima
    }
  }

  private allowed(url: string): boolean {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return false
    }
    if (this.ends.test) return u.origin === this.ends.api
    return u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname === 'api.github.com' || u.hostname.endsWith('.githubusercontent.com'))
  }

  /** GET com redirecionamentos conferidos um a um. */
  private get(
    url: string,
    onData: (chunk: Buffer) => void,
    accept = 'application/octet-stream',
  ): { done: Promise<{ status: number; headers: Record<string, string | string[]> }>; cancel: () => void } {
    let cancel = () => {}
    const done = new Promise<{ status: number; headers: Record<string, string | string[]> }>((ok, fail) => {
      if (!this.allowed(url)) return fail(new Error('Endereço de atualização não permitido.'))
      const request = net.request({ url, redirect: 'manual', useSessionCookies: false })
      request.setHeader('User-Agent', `RembgStudio/${app.getVersion()}`)
      request.setHeader('Accept', accept)
      let settled = false
      let timer: NodeJS.Timeout
      let redirects = 0
      const finish = (err: Error | null, value?: { status: number; headers: Record<string, string | string[]> }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) {
          try {
            request.abort()
          } catch {}
          fail(err)
        } else ok(value!)
      }
      const arm = () => {
        clearTimeout(timer)
        timer = setTimeout(() => finish(new Error('A conexão parou de responder.')), STALL_MS)
      }
      cancel = () => finish(new Error('cancelled'))
      request.on('redirect', (_status, _method, next) => {
        if (++redirects > 5 || !this.allowed(next)) return finish(new Error('Redirecionamento não permitido durante a atualização.'))
        request.followRedirect()
      })
      request.on('response', (response) => {
        const status = response.statusCode
        const headers = response.headers
        response.on('data', (chunk: Buffer) => {
          if (settled) return
          arm()
          try {
            if (status === 200) onData(chunk)
          } catch (e) {
            finish(e as Error)
          }
        })
        response.on('end', () => finish(null, { status, headers }))
        response.on('aborted', () => finish(new Error('A conexão foi interrompida.')))
        response.on('error', () => finish(new Error('A conexão foi interrompida.')))
      })
      request.on('error', () => finish(new Error('Falha de conexão. Verifique sua internet e tente de novo.')))
      arm()
      request.end()
    })
    return { done, cancel: () => cancel() }
  }

  private async getText(url: string, limit: number, accept?: string) {
    const parts: Buffer[] = []
    let total = 0
    const r = await this.get(url, (c) => {
      total += c.length
      if (total > limit) throw new Error('Resposta grande demais do servidor de atualizações.')
      parts.push(c)
    }, accept).done
    return { ...r, text: Buffer.concat(parts).toString('utf8') }
  }

  async check(): Promise<UpdateState> {
    if (['checking', 'downloading', 'verifying', 'installing'].includes(this.state.status)) return this.state
    this.cleanup()
    this.candidate = null
    this.file = null
    this.set({ status: 'checking', message: null, latestVersion: null, notes: null, publishedAt: null, assetName: null, size: null, received: 0, signature: null })
    try {
      const r = await this.getText(`${this.ends.api}/repos/${REPO}/releases/latest`, 2_000_000, 'application/vnd.github+json')
      const checkedAt = Date.now()
      if (r.status === 404) {
        this.set({ status: 'no-release', checkedAt, message: 'Ainda não há nenhuma versão publicada.' })
        return this.state
      }
      const remaining = String(r.headers['x-ratelimit-remaining'] ?? '')
      if (r.status === 429 || (r.status === 403 && remaining === '0')) {
        throw new Error('O GitHub limitou as consultas deste endereço de internet. Tente novamente mais tarde.')
      }
      if (r.status !== 200) throw new Error(`O servidor de atualizações respondeu com erro ${r.status}.`)
      let json: unknown
      try {
        json = JSON.parse(r.text)
      } catch {
        throw new Error('Resposta inválida do servidor de atualizações.')
      }
      if (process.arch !== 'x64') throw new Error('As atualizações são publicadas apenas para Windows x64.')
      const result = evaluateRelease(json, app.getVersion(), this.state.installType, this.ends.downloads)
      if (result.kind === 'current') {
        this.set({ status: 'up-to-date', latestVersion: result.latest, checkedAt })
      } else {
        const c = result.candidate
        this.candidate = c
        this.set({ status: 'available', latestVersion: c.version, notes: c.notes, publishedAt: c.publishedAt, assetName: c.asset.name, size: c.asset.size, checkedAt })
      }
    } catch (e) {
      this.set({ status: 'error', message: (e as Error).message, checkedAt: Date.now() })
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    const c = this.candidate
    if (!c || !['available', 'cancelled', 'download-error'].includes(this.state.status)) return this.state
    if (this.state.installType === 'dev') {
      this.set({ message: 'No modo de desenvolvimento só é possível verificar.' })
      return this.state
    }
    const part = join(this.dir, `${c.asset.name}.part`)
    let fd: number | null = null
    let cancelled = false
    this.abort = () => {
      cancelled = true
    }
    this.set({ status: 'downloading', received: 0, bytesPerSecond: 0, message: null })
    try {
      const sums = await this.getText(c.sums.url, 65_536)
      if (sums.status !== 200) throw new Error('Não foi possível baixar o SHA256SUMS.txt; a atualização foi recusada.')
      const wanted = expectedHash(sums.text, c.asset)
      if (cancelled) throw new Error('cancelled')

      mkdirSync(this.dir, { recursive: true })
      fd = openSync(part, 'w')
      const hash = createHash('sha256')
      let received = 0
      let lastAt = Date.now()
      let lastBytes = 0
      const req = this.get(c.asset.url, (chunk) => {
        received += chunk.length
        if (received > c.asset.size) throw new Error('O arquivo recebido é maior que o anunciado.')
        writeSync(fd!, chunk)
        hash.update(chunk)
        const now = Date.now()
        if (now - lastAt >= 250) {
          this.set({ received, bytesPerSecond: Math.round(((received - lastBytes) * 1000) / (now - lastAt)) })
          lastAt = now
          lastBytes = received
        }
      })
      this.abort = () => {
        cancelled = true
        req.cancel()
      }
      const r = await req.done
      if (r.status !== 200) throw new Error(`O download falhou com erro ${r.status}.`)
      closeSync(fd)
      fd = null
      this.set({ status: 'verifying', received })
      if (received !== c.asset.size) throw new Error('O download veio incompleto.')
      if (hash.digest('hex') !== wanted) throw new Error('A soma SHA-256 não confere. O arquivo foi descartado.')
      const head = Buffer.alloc(4)
      const h = openSync(part, 'r')
      readSync(h, head, 0, 4, 0)
      closeSync(h)
      if (!looksLikeArtifact(c.asset.name, head)) throw new Error('O arquivo baixado não é um pacote válido. Ele foi descartado.')
      const file = join(this.dir, c.asset.name)
      renameSync(part, file)
      const signature = c.asset.name.endsWith('.exe') ? await this.verifySignature(file) : null
      this.file = file
      this.hash = wanted
      this.set({ status: 'ready', received, signature })
    } catch (e) {
      if (fd !== null) closeSync(fd)
      this.cleanup()
      if (cancelled) this.set({ status: 'cancelled', received: 0, message: 'Download cancelado.' })
      else this.set({ status: 'download-error', received: 0, message: (e as Error).message })
    } finally {
      this.abort = null
    }
    return this.state
  }

  /**
   * Se a versao em uso for assinada, a nova precisa ter assinatura valida do
   * mesmo emissor. Enquanto o app nao for assinado, isso nao se aplica.
   */
  private async verifySignature(file: string): Promise<'matches' | 'unsigned-build'> {
    const running = this.state.installType === 'portable' ? process.env.PORTABLE_EXECUTABLE_FILE! : process.execPath
    const mine = await authenticode(running)
    if (mine.status === 'NotSigned') return 'unsigned-build'
    const next = await authenticode(file)
    if (mine.status !== 'Valid' || next.status !== 'Valid' || next.subject !== mine.subject) {
      throw new Error('A assinatura digital da atualização não confere com a desta versão. Ela foi recusada.')
    }
    return 'matches'
  }

  cancel() {
    this.abort?.()
  }

  async install(): Promise<UpdateState> {
    const c = this.candidate
    const file = this.file
    if (!c || !file || this.state.status !== 'ready') return this.state
    const type = this.state.installType
    const win = this.hooks.window()
    if (!win) return this.state
    if (this.hooks.isBusy()) {
      this.set({ message: 'Aguarde a fila terminar (ou cancele) antes de atualizar.' })
      return this.state
    }
    try {
      // confere de novo imediatamente antes de usar o arquivo
      if (!existsSync(file) || (await sha256File(file)) !== this.hash) {
        this.cleanup()
        this.file = null
        this.set({ status: 'download-error', message: 'O arquivo baixado mudou ou sumiu. Baixe novamente.' })
        return this.state
      }
      if (type === 'zip') return await this.saveZip(win, c, file)

      const unsaved = this.hooks.unsavedResults()
      const detail = [
        unsaved ? `ATENÇÃO: ${unsaved} resultado(s) ainda não salvo(s) serão perdidos.` : null,
        type === 'portable'
          ? `A nova versão será colocada ao lado da atual, que não é apagada, e o app será reaberto.`
          : 'O instalador será aberto e o app será fechado. Siga os passos do instalador.',
        'Somente o Rembg Studio é atualizado. rembg, Python, CUDA, modelos e suas configurações não são alterados.',
        this.state.signature === 'unsigned-build' ? 'Estas versões ainda não têm assinatura digital: a verificação feita é a soma SHA-256 publicada na mesma release.' : null,
      ].filter(Boolean).join('\n\n')
      const answer = await dialog.showMessageBox(win, {
        type: unsaved ? 'warning' : 'question',
        title: 'Instalar atualização',
        message: `Instalar o Rembg Studio ${c.version}?`,
        detail,
        buttons: [type === 'portable' ? 'Instalar e reiniciar' : 'Abrir instalador', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      if (answer.response !== 0 || this.hooks.isBusy()) return this.state

      this.set({ status: 'installing', message: null })
      if (type === 'portable') await this.installPortable(win, c, file)
      else await this.runInstaller(file)
    } catch (e) {
      this.set({ status: 'ready', message: (e as Error).message })
    }
    return this.state
  }

  /** marca o arquivo como vindo da internet, como um navegador faria */
  private markFromInternet(path: string) {
    try {
      writeFileSync(`${path}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n')
    } catch {}
  }

  /** copia sem nunca sobrescrever; reaproveita um arquivo identico ja presente */
  private async placeBeside(source: string, folder: string, name: string): Promise<string> {
    const { name: stem, ext } = parse(name)
    for (let i = 1; i < 50; i++) {
      const target = join(folder, i === 1 ? name : `${stem} (${i})${ext}`)
      if (existsSync(target)) {
        if ((await sha256File(target)) === this.hash) return target
        continue
      }
      await copyFile(source, target, constants.COPYFILE_EXCL)
      return target
    }
    throw new Error('Já existem muitos arquivos com esse nome na pasta.')
  }

  private async installPortable(win: BrowserWindow, c: Candidate, file: string) {
    const folder = dirname(process.env.PORTABLE_EXECUTABLE_FILE!)
    let target: string
    try {
      target = await this.placeBeside(file, folder, c.asset.name)
    } catch (e) {
      if (!['EACCES', 'EPERM', 'EROFS'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e
      const r = await dialog.showSaveDialog(win, { title: 'A pasta atual não permite gravar. Onde salvar a nova versão?', defaultPath: join(app.getPath('downloads'), c.asset.name), filters: [{ name: 'Programa', extensions: ['exe'] }] })
      if (r.canceled || !r.filePath) {
        this.set({ status: 'ready' })
        return
      }
      target = await this.placeBeside(file, dirname(r.filePath), parse(r.filePath).base)
    }
    if ((await sha256File(target)) !== this.hash) throw new Error('A cópia da nova versão saiu diferente do arquivo verificado.')
    this.markFromInternet(target)

    await this.hooks.stopWorker()
    // sem isto a nova versao veria a trava de instancia unica e fecharia sozinha
    app.releaseSingleInstanceLock()
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PORTABLE_EXECUTABLE')))
    try {
      await new Promise<void>((ok, fail) => {
        const child = spawn(target, [], { detached: true, stdio: 'ignore', cwd: dirname(target), env })
        child.once('error', fail)
        child.once('spawn', () => {
          child.unref()
          ok()
        })
      })
    } catch {
      // a versao atual continua funcionando
      app.requestSingleInstanceLock()
      this.hooks.resumeWorker()
      throw new Error('O Windows não permitiu abrir a nova versão. A versão atual continua funcionando.')
    }
    app.quit()
  }

  private async runInstaller(file: string) {
    this.markFromInternet(file)
    // abre pelo Windows: o usuario ve o assistente e os avisos do sistema
    const error = await shell.openPath(file)
    if (error) throw new Error(`Não foi possível abrir o instalador: ${error}`)
    setTimeout(() => app.quit(), 800)
  }

  private async saveZip(win: BrowserWindow, c: Candidate, file: string): Promise<UpdateState> {
    const r = await dialog.showSaveDialog(win, { title: 'Salvar o pacote da nova versão', defaultPath: join(app.getPath('downloads'), c.asset.name), filters: [{ name: 'ZIP', extensions: ['zip'] }] })
    if (r.canceled || !r.filePath) return this.state
    await copyFile(file, r.filePath)
    this.markFromInternet(r.filePath)
    shell.showItemInFolder(r.filePath)
    this.set({ status: 'saved', message: `Salvo em ${r.filePath}. Feche o app, extraia o ZIP em uma pasta nova e abra o Rembg Studio.exe de lá.` })
    return this.state
  }
}
