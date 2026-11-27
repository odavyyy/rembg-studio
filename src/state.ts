import { create } from 'zustand'
import type {
  Api,
  ConflictPolicy,
  EnvInfo,
  GpuInfo,
  HistoryEntry,
  InitialState,
  Item,
  ModelStats,
  ProcessOptions,
  Settings,
  Toast,
  UpdateState,
  WorkerStatus,
} from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

declare global {
  interface Window {
    api: Api
  }
}

export type Page = 'workspace' | 'batch' | 'recents' | 'models' | 'settings' | 'about'

interface Conflict {
  ids: string[]
  dir: string
  names: string[]
}

interface State {
  ready: boolean
  page: Page
  settings: Settings
  items: Item[]
  history: HistoryEntry[]
  worker: WorkerStatus
  stats: ModelStats
  env: EnvInfo | null
  envLoading: boolean
  gpu: GpuInfo | null
  version: string
  currentId: string | null
  checked: string[]
  /** ids do lote em andamento, para a barra de progresso */
  run: string[]
  /** modelo e opcoes em uso nesta sessao (comecam nos padroes das configuracoes) */
  model: string
  options: ProcessOptions
  toasts: (Toast & { id: number })[]
  conflict: Conflict | null
  update: UpdateState | null
}

export const useStore = create<State>(() => ({
  ready: false,
  page: 'workspace',
  settings: DEFAULT_SETTINGS,
  items: [],
  history: [],
  worker: { state: 'starting', pythonPath: null, error: null, loadedModel: null, loadedDevice: null },
  stats: {},
  env: null,
  envLoading: false,
  gpu: null,
  version: '',
  currentId: null,
  checked: [],
  run: [],
  model: DEFAULT_SETTINGS.defaultModel,
  options: DEFAULT_SETTINGS.options,
  toasts: [],
  conflict: null,
  update: null,
}))

const set = useStore.setState
const get = useStore.getState
export const api = () => window.api

let toastSeq = 0
export function toast(kind: Toast['kind'], text: string) {
  const id = ++toastSeq
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4000)
}

export const errorText = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function withItems(items: Item[]) {
  const ids = new Set(items.map((i) => i.id))
  const { currentId, checked, run } = get()
  set({
    items,
    currentId: currentId && ids.has(currentId) ? currentId : (items[0]?.id ?? null),
    checked: checked.filter((i) => ids.has(i)),
    run: run.filter((i) => ids.has(i)),
  })
}

export async function refreshEnv(force = false) {
  set({ envLoading: true })
  const [env, gpu] = await Promise.all([api().getEnv(force), api().gpuInfo()])
  set({ env, gpu, envLoading: false })
}

let initialized = false
export async function init() {
  if (initialized) return
  initialized = true
  const a = api()
  a.onItems(withItems)
  a.onItemPatch((item) =>
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? item : i)) })),
  )
  a.onHistory((history) => set({ history }))
  a.onStats((stats) => set({ stats }))
  a.onToast((t) => toast(t.kind, t.text))
  a.onSettings((settings) => set({ settings }))
  a.onUpdate((update) => set({ update }))
  void a.updateState().then((update) => set({ update }))
  a.onWorker((worker) => {
    const was = get().worker.state
    set({ worker })
    if (worker.state === 'ready' && was !== 'ready' && !get().env && !get().envLoading) void refreshEnv()
  })
  const s: InitialState = await a.getInitialState()
  set({
    ready: true,
    settings: s.settings,
    history: s.history,
    worker: s.worker,
    stats: s.stats,
    version: s.version,
    model: s.settings.defaultModel,
    options: s.settings.options,
  })
  withItems(s.items)
  void refreshEnv()
}

export async function saveSettings(patch: Partial<Settings>) {
  const before = get().settings
  const settings = await api().setSettings(patch)
  set({
    settings,
    ...(settings.defaultModel !== before.defaultModel ? { model: settings.defaultModel } : {}),
    ...(patch.options ? { options: settings.options } : {}),
  })
}

export function reportAdd(r: { added: number; rejected: string[] }) {
  if (r.rejected.length) toast('error', r.rejected.slice(0, 4).join('\n') + (r.rejected.length > 4 ? `\n…e mais ${r.rejected.length - 4}` : ''))
}

export async function addFromDialog() {
  const before = new Set(get().items.map((i) => i.id))
  const r = await api().addFromDialog()
  reportAdd(r)
  focusNew(before, r.added)
}

export async function addFiles(files: File[]) {
  const paths = files.map((f) => api().pathForFile(f)).filter(Boolean)
  if (!paths.length) return
  const before = new Set(get().items.map((i) => i.id))
  const r = await api().addPaths(paths)
  reportAdd(r)
  focusNew(before, r.added)
}

function focusNew(before: Set<string>, added: number) {
  if (!added) return
  const first = get().items.find((i) => !before.has(i.id))
  if (first) set({ currentId: first.id })
  if (added > 1) set({ page: 'batch' })
  else if (get().page !== 'batch') set({ page: 'workspace' })
}

export const isBusy = (i: Item) => i.status === 'queued' || i.status === 'processing'
export const canProcess = (i: Item) => !isBusy(i) && i.status !== 'invalid'

export async function processIds(ids: string[]) {
  const { items, model, options, run } = get()
  const valid = items.filter((i) => ids.includes(i.id) && canProcess(i)).map((i) => i.id)
  if (!valid.length) return
  const active = items.some(isBusy)
  set({ run: active ? [...new Set([...run, ...valid])] : valid })
  // false: o aviso de licenca do modelo foi recusado e nada entrou na fila
  if (!(await api().process(valid, { model, options }))) set({ run })
}

/** pendentes; se nao houver, todas (reprocessar) */
export function processTargets(items: Item[]) {
  const pending = items.filter((i) => ['idle', 'probing', 'error', 'cancelled'].includes(i.status))
  return pending.length
    ? { ids: pending.map((i) => i.id), redo: false }
    : { ids: items.filter((i) => i.status === 'done').map((i) => i.id), redo: true }
}

export async function saveOne(id: string) {
  try {
    const p = await api().saveOne(id)
    if (p) toast('success', `Salvo em ${p}`)
  } catch (e) {
    toast('error', errorText(e))
  }
}

export async function saveMany(ids: string[], opts: { dir?: string; policy?: ConflictPolicy; askDir?: boolean } = {}) {
  try {
    const r = await api().saveMany(ids, opts)
    if (r.needsDecision) {
      set({ conflict: { ids, dir: r.needsDecision.dir, names: r.needsDecision.conflicts } })
      return
    }
    if (r.saved.length) toast('success', `${r.saved.length} PNG salvo(s) em ${r.dir}`)
    if (r.skipped.length) toast('info', `${r.skipped.length} arquivo(s) existente(s) foram pulados`)
    if (r.failed.length) toast('error', `${r.failed.length} falha(s): ${r.failed[0].error}`)
  } catch (e) {
    toast('error', errorText(e))
  }
}

export const go = (page: Page) => set({ page })
