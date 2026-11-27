import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell, type OpenDialogOptions } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { detectPython, queryNvidiaSmi, Worker } from './worker'
import { Studio, INPUT_EXTS } from './studio'
import { buildName, uniquePath } from './naming'
import { isModelName } from './store'
import { Updater } from './updater'
import { DOC_FILES, LINKS } from './docs'
import type { ConflictPolicy, EnvInfo, GpuInfo, InitialState, Settings } from '../shared/types'
import { readFile } from 'node:fs/promises'

const DEV_URL = app.isPackaged ? undefined : process.env.REMBG_STUDIO_DEV_URL
// usado pelos testes para nao tocar nas configuracoes reais
if (process.env.REMBG_STUDIO_USERDATA) app.setPath('userData', resolve(process.env.REMBG_STUDIO_USERDATA))

protocol.registerSchemesAsPrivileged([
  { scheme: 'rbs', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let win: BrowserWindow | null = null
let worker: Worker
let studio: Studio
let envCache: EnvInfo | null = null
let updater: Updater

/** Aviso unico de licenca antes do primeiro uso ou download do modelo BRIA. */
async function allowModel(model: string): Promise<boolean> {
  if (model !== 'bria-rmbg' || studio.settings.briaAck) return true
  for (;;) {
    const r = await dialog.showMessageBox(win!, {
      type: 'info',
      title: 'Licença do modelo BRIA RMBG 2.0',
      message: 'Este modelo é liberado somente para uso não comercial.',
      detail: 'A BRIA publica o RMBG 2.0 sob CC BY-NC 4.0 para uso não comercial. Uso comercial exige um contrato com a BRIA. A licença do Rembg Studio não muda isso. Confira os termos antes de continuar.',
      buttons: ['Entendi, continuar', 'Ver a licença', 'Cancelar'],
      defaultId: 2,
      cancelId: 2,
      noLink: true,
    })
    if (r.response === 1) {
      await shell.openExternal(LINKS['bria-license'])
      continue
    }
    if (r.response !== 0) return false
    studio.setSettings({ briaAck: true })
    return true
  }
}

const send = (channel: string, data: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}

function createWindow() {
  const dark = studio.settings.theme !== 'light'
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: dark ? '#0c0d10' : '#f4f5f7',
    title: 'Rembg Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => win!.show())
  // a janela nunca navega para fora do app
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  win.on('closed', () => (win = null))
}

async function pickFolder(current?: string | null): Promise<string | null> {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Escolher pasta',
    defaultPath: current ?? undefined,
    properties: ['openDirectory', 'createDirectory'],
  })
  return r.canceled ? null : r.filePaths[0]
}

async function getEnv(refresh = false): Promise<EnvInfo | null> {
  if (!envCache || refresh) {
    try {
      envCache = await worker.request<EnvInfo>('env', {}, 60_000)
    } catch {
      envCache = null
    }
  }
  return envCache
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function registerIpc() {
  const h = (name: string, fn: (...args: any[]) => unknown) =>
    ipcMain.handle(name, (event, ...args) => {
      if (!win || event.sender !== win.webContents) throw new Error('origem não permitida')
      return fn(...args)
    })

  h('getInitialState', (): InitialState => ({
    settings: studio.settings,
    items: studio.items,
    history: studio.historyView(),
    worker: worker.status,
    stats: studio.stats,
    platform: process.platform,
    version: app.getVersion(),
  }))
  h('setSettings', async (patch: Partial<Settings>) => {
    const clean = { ...patch }
    delete clean.briaAck // so o aviso nativo registra isso
    if (clean.defaultModel === 'bria-rmbg' && !(await allowModel('bria-rmbg'))) delete clean.defaultModel
    // o caminho do Python so muda pelo seletor de arquivos (ou volta ao automatico)
    if (clean.pythonPath !== null) delete clean.pythonPath
    const before = studio.settings.pythonPath
    const s = studio.setSettings(clean)
    nativeTheme.themeSource = s.theme
    if (before !== s.pythonPath) {
      envCache = null
      void worker.restart()
    }
    return s
  })
  h('addPaths', (paths: unknown) => studio.addPaths(strings(paths)))
  h('addFromDialog', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Selecionar imagens',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens', extensions: [...INPUT_EXTS].map((e) => e.slice(1)) }],
    })
    return r.canceled ? { added: 0, rejected: [] } : studio.addPaths(r.filePaths)
  })
  h('removeItems', (ids: unknown) => studio.removeItems(strings(ids)))
  h('clearItems', () => studio.removeItems(studio.items.map((i) => i.id)))
  h('process', async (ids: unknown, opts?: any) => {
    const model = isModelName(opts?.model) ? opts.model : studio.settings.defaultModel
    if (!(await allowModel(model))) return false
    studio.process(strings(ids), opts)
    return true
  })
  h('cancel', (ids: unknown) => studio.cancel(ids === 'all' ? 'all' : strings(ids)))
  h('renameItem', (id: string, name: unknown) => studio.renameItem(id, String(name ?? '')))

  h('saveOne', async (id: string) => {
    const item = studio.items.find((i) => i.id === id)
    if (!item || item.status !== 'done') return null
    const dir = studio.settings.outputDir ?? dirname(item.path)
    let defaultPath = uniquePath(dir, studio.outputBase(item))
    for (;;) {
      // o dialogo nativo do Windows pede confirmacao antes de sobrescrever
      const r = await dialog.showSaveDialog(win!, {
        title: 'Salvar PNG',
        defaultPath,
        filters: [{ name: 'PNG', extensions: ['png'] }],
        properties: ['showOverwriteConfirmation'],
      })
      if (r.canceled || !r.filePath) return null
      let target = r.filePath
      if (extname(target).toLowerCase() !== '.png') {
        target += '.png'
        if (existsSync(target)) {
          defaultPath = target
          continue // pede confirmacao com o nome final
        }
      }
      if (studio.isOriginal(target)) {
        await dialog.showMessageBox(win!, { type: 'warning', message: 'Esse é o arquivo original. Escolha outro nome para não perdê-lo.' })
        continue
      }
      await studio.writeResult(item, target, true)
      return target
    }
  })

  h('saveMany', async (ids: unknown, opts: { dir?: string; policy?: ConflictPolicy; askDir?: boolean }) => {
    let dir = typeof opts?.dir === 'string' && isAbsolute(opts.dir) ? opts.dir : null
    if (!dir && !opts?.askDir) dir = studio.settings.outputDir
    if (!dir) dir = await pickFolder(studio.settings.outputDir)
    if (!dir) return { saved: [], skipped: [], failed: [] }
    const policy = ['overwrite', 'rename', 'skip'].includes(opts?.policy as string) ? opts.policy : undefined
    return studio.saveMany(strings(ids), dir, policy)
  })

  h('chooseFolder', (current?: string | null) => pickFolder(current))
  h('choosePython', async () => {
    const options: OpenDialogOptions = {
      title: 'Selecionar o python.exe do ambiente do rembg',
      properties: ['openFile'],
      filters: [{ name: 'Python', extensions: ['exe'] }],
    }
    const r = await dialog.showOpenDialog(win!, options)
    const p = r.canceled ? null : r.filePaths[0]
    if (!p) return null
    if (!/^pythonw?\.exe$/i.test(p.split(/[\\/]/).pop() ?? '')) throw new Error('Selecione um arquivo python.exe.')
    studio.setSettings({ pythonPath: p })
    envCache = null
    await worker.restart()
    return p
  })

  // so arquivos que o app conhece (originais e resultados) podem ser localizados
  h('reveal', (p: string) => {
    if (typeof p === 'string' && studio.canServe(p) && existsSync(p)) shell.showItemInFolder(resolve(p))
  })
  // a unica pasta que a interface pode abrir e a dos modelos
  h('openPath', async (p: string) => {
    const models = (await getEnv())?.modelsDir
    if (typeof p !== 'string' || !models || resolve(p) !== resolve(models)) return
    if (existsSync(models) && statSync(models).isDirectory()) await shell.openPath(resolve(models))
  })

  h('historyRemove', (ids: unknown) => studio.historyRemove(strings(ids)))
  h('historyClear', () => studio.historyRemove(studio.history.map((x) => x.id)))
  h('historyOpen', (id: string, reprocess: boolean) => studio.historyOpen(id, !!reprocess))

  h('getEnv', (refresh?: boolean) => getEnv(!!refresh))
  h('gpuInfo', async (): Promise<GpuInfo> => {
    const g = await queryNvidiaSmi()
    if (!g) return { available: false, name: null, memoryUsedMb: null, memoryTotalMb: null, driver: null, error: 'nvidia-smi não respondeu' }
    return { available: true, name: g.name, memoryUsedMb: g.used, memoryTotalMb: g.total, driver: g.driver }
  })
  h('gpuTest', (model?: string) => worker.request('gpu_test', { model: isModelName(model) ? model : 'isnet-general-use' }, 15 * 60_000))
  h('downloadModel', async (name: string) => {
    if (!isModelName(name)) throw new Error('Modelo inválido.')
    if (!(await allowModel(name))) return getEnv()
    await worker.request('download', { model: name })
    return getEnv(true)
  })
  h('restartWorker', () => {
    envCache = null
    return worker.restart()
  })
  // a interface nao envia URLs nem caminhos: so estes comandos sem parametros
  h('updateState', () => updater.state)
  h('updateCheck', () => updater.check())
  h('updateDownload', () => updater.download())
  h('updateCancel', () => updater.cancel())
  h('updateInstall', () => updater.install())
  h('readDoc', async (id: string) => {
    const file = Object.hasOwn(DOC_FILES, id) ? DOC_FILES[id as keyof typeof DOC_FILES] : null
    if (!file) throw new Error('Documento desconhecido.')
    const path = app.isPackaged ? join(process.resourcesPath, file.packaged) : join(app.getAppPath(), file.source)
    return readFile(path, 'utf8')
  })
  h('openLink', async (id: string) => {
    if (Object.hasOwn(LINKS, id)) await shell.openExternal(LINKS[id as keyof typeof LINKS])
  })
  h('namePreview', (pattern: string) => `${buildName(String(pattern ?? ''), 'imagem.jpg', studio.settings.defaultModel, 1)}.png`)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    const script = app.isPackaged
      ? join(process.resourcesPath, 'python', 'worker.py')
      : join(app.getAppPath(), 'python', 'worker.py')
    worker = new Worker(script, async () => studio.settings.pythonPath ?? (await detectPython()))
    studio = new Studio(app.getPath('userData'), worker)
    nativeTheme.themeSource = studio.settings.theme

    protocol.handle('rbs', async (request) => {
      const p = new URL(request.url).searchParams.get('p')
      if (!p || !studio.canServe(p) || !existsSync(p)) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(p).toString())
    })

    studio.on('items', (v) => send('items', v))
    studio.on('item', (v) => send('item', v))
    studio.on('history', (v) => send('history', v))
    studio.on('stats', (v) => send('stats', v))
    studio.on('toast', (v) => send('toast', v))
    studio.on('settings', (v) => send('settings', v))
    worker.on('status', (v) => send('worker', v))

    updater = new Updater(app.getPath('userData'), {
      window: () => win,
      isBusy: () => studio.isBusy(),
      unsavedResults: () => studio.unsavedResults(),
      stopWorker: () => worker.stopAndWait(),
      resumeWorker: () => void worker.resume(),
    })
    updater.on('state', (v) => send('update', v))

    registerIpc()
    createWindow()
    void worker.start()
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => worker?.stop())
}
