// Tipos compartilhados entre o processo principal (Electron) e a interface.

export type PreviewBg = 'checker' | 'black' | 'white' | 'gray'
export type PreviewMode = 'compare' | 'result' | 'original'
export type Theme = 'dark' | 'light' | 'system'
export type DevicePref = 'auto' | 'cpu'

export interface ProcessOptions {
  alphaMatting: boolean
  fgThreshold: number
  bgThreshold: number
  erodeSize: number
  postProcessMask: boolean
  decontaminate: boolean
  onlyMask: boolean
  vitmatte: boolean
  vitmatteModel: 'small-distinctions-646' | 'base-distinctions-646'
}

export const DEFAULT_OPTIONS: ProcessOptions = {
  alphaMatting: false,
  fgThreshold: 240,
  bgThreshold: 10,
  erodeSize: 10,
  postProcessMask: false,
  decontaminate: false,
  onlyMask: false,
  vitmatte: false,
  vitmatteModel: 'small-distinctions-646',
}

export interface Settings {
  defaultModel: string
  outputDir: string | null
  autoProcess: boolean
  autoSave: boolean
  namePattern: string
  device: DevicePref
  options: ProcessOptions
  previewBg: PreviewBg
  previewMode: PreviewMode
  theme: Theme
  pythonPath: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: 'isnet-general-use',
  outputDir: null,
  autoProcess: false,
  autoSave: false,
  namePattern: '{nome}_sem_fundo',
  device: 'auto',
  options: DEFAULT_OPTIONS,
  previewBg: 'checker',
  previewMode: 'compare',
  theme: 'dark',
  pythonPath: null,
}

export type ItemStatus =
  | 'probing'
  | 'invalid'
  | 'idle'
  | 'queued'
  | 'processing'
  | 'done'
  | 'error'
  | 'cancelled'

export type Stage = 'downloading' | 'loading' | 'refining' | 'inferring' | 'saving' | null

export interface Item {
  id: string
  path: string
  name: string
  ext: string
  sizeBytes: number | null
  width: number | null
  height: number | null
  format: string | null
  thumbUrl: string | null
  originalUrl: string | null
  status: ItemStatus
  stage: Stage
  error: string | null
  /** modelo pedido para a proxima execucao (ou usado na ultima) */
  model: string | null
  resultUrl: string | null
  resultThumbUrl: string | null
  resultPath: string | null
  resultModel: string | null
  resultWidth: number | null
  resultHeight: number | null
  timeMs: number | null
  inferMs: number | null
  device: 'gpu' | 'cpu' | null
  savedPath: string | null
  /** nome escolhido pelo usuario (sem .png); null = usar o padrao */
  outputName: string | null
  addedAt: number
  historyId: string | null
}

export interface HistoryEntry {
  id: string
  name: string
  originalPath: string
  resultPath: string | null
  savedPath: string | null
  model: string
  date: number
  thumbUrl: string | null
  width: number | null
  height: number | null
  device: 'gpu' | 'cpu' | null
  timeMs: number | null
  originalExists?: boolean
  resultExists?: boolean
}

export interface ModelFile {
  name: string
  downloaded: boolean
  path: string | null
  sizeBytes: number | null
}

export interface EnvInfo {
  python: string
  pythonExecutable: string
  prefix: string
  rembgVersion: string | null
  onnxruntimeVersion: string
  onnxruntimeGpu: boolean
  availableProviders: string[]
  ortDevice: string
  /** pastas de DLLs do CUDA (pacotes nvidia-* do pip) encontradas no ambiente */
  cudaDllDirs: number
  modelsDir: string
  models: ModelFile[]
  vitmatte: { variant: string; downloaded: boolean }[]
}

export interface GpuInfo {
  available: boolean
  name: string | null
  memoryUsedMb: number | null
  memoryTotalMb: number | null
  driver: string | null
  error?: string
}

export interface GpuTest {
  model: string
  providers: string[]
  device: 'gpu' | 'cpu'
  inferMs: number
}

export type WorkerState = 'starting' | 'ready' | 'busy' | 'restarting' | 'error' | 'stopped'

export interface WorkerStatus {
  state: WorkerState
  pythonPath: string | null
  error: string | null
  loadedModel: string | null
  loadedDevice: 'gpu' | 'cpu' | null
}

export interface ModelStats {
  [model: string]: { runs: number; avgMs: number; device: 'gpu' | 'cpu' | null }
}

export interface InitialState {
  settings: Settings
  items: Item[]
  history: HistoryEntry[]
  worker: WorkerStatus
  stats: ModelStats
  platform: string
  version: string
}

export type ConflictPolicy = 'overwrite' | 'rename' | 'skip'

export interface SaveManyResult {
  needsDecision?: { conflicts: string[]; dir: string }
  saved: { id: string; path: string }[]
  skipped: string[]
  failed: { id: string; error: string }[]
  dir?: string
}

export interface Toast {
  kind: 'info' | 'success' | 'error'
  text: string
}

export interface Api {
  getInitialState(): Promise<InitialState>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  pathForFile(file: File): string
  addPaths(paths: string[]): Promise<{ added: number; rejected: string[] }>
  addFromDialog(): Promise<{ added: number; rejected: string[] }>
  removeItems(ids: string[]): Promise<void>
  clearItems(): Promise<void>
  process(ids: string[], opts?: { model?: string; options?: ProcessOptions }): Promise<void>
  cancel(ids: string[] | 'all'): Promise<void>
  saveOne(id: string): Promise<string | null>
  saveMany(ids: string[], opts: { dir?: string; policy?: ConflictPolicy; askDir?: boolean }): Promise<SaveManyResult>
  chooseFolder(current?: string | null): Promise<string | null>
  choosePython(): Promise<string | null>
  reveal(path: string): Promise<void>
  openPath(path: string): Promise<void>
  historyRemove(ids: string[]): Promise<void>
  historyClear(): Promise<void>
  historyOpen(id: string, reprocess: boolean): Promise<string | null>
  getEnv(refresh?: boolean): Promise<EnvInfo | null>
  gpuInfo(): Promise<GpuInfo>
  gpuTest(model?: string): Promise<GpuTest>
  downloadModel(name: string): Promise<EnvInfo | null>
  restartWorker(): Promise<void>
  namePreview(pattern: string): Promise<string>
  renameItem(id: string, name: string): Promise<void>
  onItems(cb: (items: Item[]) => void): () => void
  onItemPatch(cb: (item: Item) => void): () => void
  onHistory(cb: (h: HistoryEntry[]) => void): () => void
  onWorker(cb: (w: WorkerStatus) => void): () => void
  onStats(cb: (s: ModelStats) => void): () => void
  onToast(cb: (t: Toast) => void): () => void
  onSettings(cb: (s: Settings) => void): () => void
}
