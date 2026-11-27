import { ArrowUpCircle, Boxes, CircleAlert, Clock, CircleCheck, Image as ImageIcon, Info, Layers, Settings as Gear, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { About } from './pages/About'
import { Batch } from './pages/Batch'
import { Models } from './pages/Models'
import { Recents } from './pages/Recents'
import { SettingsPage } from './pages/Settings'
import { Workspace } from './pages/Workspace'
import { modelMeta } from './models'
import { addFiles, addFromDialog, go, init, isBusy, processIds, saveMany, saveOne, useStore, type Page } from './state'

const NAV: [Page, string, typeof ImageIcon][] = [
  ['workspace', 'Workspace', ImageIcon],
  ['batch', 'Lote', Layers],
  ['recents', 'Recentes', Clock],
  ['models', 'Modelos', Boxes],
  ['settings', 'Configurações', Gear],
  ['about', 'Sobre', Info],
]

function DeviceStatus() {
  const worker = useStore((s) => s.worker)
  const env = useStore((s) => s.env)
  const gpu = useStore((s) => s.gpu)
  const forced = useStore((s) => s.settings.device === 'cpu')
  const model = useStore((s) => s.model)
  const processing = useStore((s) => s.items.some((i) => i.status === 'processing'))
  const cuda = env?.availableProviders.includes('CUDAExecutionProvider')

  let device = 'Detectando…'
  let color = 'bg-muted'
  if (forced) [device, color] = ['CPU (escolhida)', 'bg-warn']
  else if (worker.loadedDevice === 'gpu') [device, color] = ['GPU em uso', 'bg-ok']
  else if (worker.loadedDevice === 'cpu') [device, color] = ['CPU (GPU indisponível)', 'bg-warn']
  else if (env) [device, color] = cuda ? ['GPU (CUDA disponível)', 'bg-ok'] : ['Somente CPU', 'bg-warn']
  if (worker.state === 'error') [device, color] = ['rembg indisponível', 'bg-bad']

  const state = worker.state === 'error' ? 'Veja o diagnóstico' : worker.state !== 'ready' ? 'Iniciando rembg…' : processing ? 'Processando…' : 'Pronto'
  return (
    <button data-testid="device-status" onClick={() => go('settings')} className="card m-2 cursor-pointer p-2.5 text-left transition-colors hover:bg-hover" title={`${gpu?.name ?? ''}\nModelo: ${worker.loadedModel ?? model}`}>
      <div className="flex items-center gap-2 font-medium"><span className={`h-2 w-2 shrink-0 rounded-full ${color} ${processing ? 'animate-pulse' : ''}`} />{device}</div>
      {gpu?.name && <div className="truncate text-xs text-muted">{gpu.name.replace('NVIDIA GeForce ', '')}</div>}
      <div className="truncate text-xs text-muted">{modelMeta(model).label}</div>
      <div className="text-xs text-muted">{state}</div>
    </button>
  )
}

function Warning() {
  const worker = useStore((s) => s.worker)
  const env = useStore((s) => s.env)
  const forced = useStore((s) => s.settings.device === 'cpu')
  let text: string | null = null
  if (worker.state === 'error') text = worker.error
  else if (!forced && worker.loadedDevice === 'cpu') text = 'A GPU não pôde ser usada; o processamento está rodando na CPU (mais lento).'
  else if (!forced && env && !env.availableProviders.includes('CUDAExecutionProvider')) text = 'CUDA não disponível nesta instalação. As imagens serão processadas na CPU.'
  if (!text) return null
  return (
    <button onClick={() => go('settings')} className="flex cursor-pointer items-center gap-2 border-b border-warn/40 bg-warn/10 px-4 py-2 text-left text-warn">
      <CircleAlert size={15} className="shrink-0" /><span className="line-clamp-2">{text}</span><span className="ml-auto shrink-0 underline">Diagnóstico</span>
    </button>
  )
}

function ConflictDialog() {
  const c = useStore((s) => s.conflict)
  if (!c) return null
  const choose = (policy: 'overwrite' | 'rename' | 'skip') => {
    useStore.setState({ conflict: null })
    void saveMany(c.ids, { dir: c.dir, policy })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div role="dialog" aria-modal="true" className="card fade-up w-full max-w-md p-5" data-testid="conflict">
        <h2 className="text-base font-semibold">{c.names.length} arquivo(s) já existem</h2>
        <p className="selectable mt-1 break-all text-muted">{c.dir}</p>
        <ul className="selectable my-3 max-h-32 overflow-auto text-xs">{c.names.slice(0, 30).map((n, i) => <li key={i}>{n}</li>)}</ul>
        <div className="flex flex-col gap-2">
          <button autoFocus data-testid="conflict-rename" className="btn btn-primary" onClick={() => choose('rename')}>Manter os dois (renomear os novos)</button>
          <button className="btn" onClick={() => choose('skip')}>Pular os que já existem</button>
          <button className="btn text-bad" onClick={() => choose('overwrite')}>Substituir os existentes</button>
          <button className="btn btn-ghost" onClick={() => useStore.setState({ conflict: null })}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-96 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="fade-up flex items-start gap-2 rounded-xl border border-line bg-card p-3 shadow-xl">
          {t.kind === 'success' ? <CircleCheck size={16} className="shrink-0 text-ok" /> : t.kind === 'error' ? <CircleAlert size={16} className="shrink-0 text-bad" /> : <Info size={16} className="shrink-0 text-accent2" />}
          <span className="min-w-0 whitespace-pre-line break-words">{t.text}</span>
        </div>
      ))}
    </div>
  )
}

export function App() {
  const ready = useStore((s) => s.ready)
  const page = useStore((s) => s.page)
  const total = useStore((s) => s.items.length)
  const pending = useStore((s) => s.items.filter(isBusy).length)
  const [dragging, setDragging] = useState(false)
  const newVersion = useStore((s) => (s.update && ['available', 'downloading', 'verifying', 'ready', 'cancelled', 'download-error'].includes(s.update.status) ? s.update.latestVersion : null))

  useEffect(() => void init(), [])

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); depth++; setDragging(true) } }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      void addFiles([...(e.dataTransfer?.files ?? [])])
    }
    const key = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      const { currentId, items } = useStore.getState()
      const item = items.find((i) => i.id === currentId)
      if (e.key.toLowerCase() === 'o') { e.preventDefault(); void addFromDialog() }
      else if (e.key === 'Enter' && item) { e.preventDefault(); void processIds([item.id]) }
      else if (e.key.toLowerCase() === 's' && item?.status === 'done') { e.preventDefault(); void saveOne(item.id) }
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('keydown', key)
    }
  }, [])

  if (!ready) return null
  return (
    <div className="flex h-full">
      <nav className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="checker h-7 w-7 rounded-lg ring-2 ring-accent" style={{ backgroundSize: '10px 10px' }} />
          <span className="text-[15px] font-semibold">Rembg Studio</span>
        </div>
        <div className="flex flex-col gap-0.5 px-2">
          {NAV.map(([id, label, Icon]) => (
            <button key={id} data-testid={`nav-${id}`} onClick={() => go(id)} className={`flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors ${page === id ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-hover hover:text-fg'}`}>
              <Icon size={16} className={page === id ? 'text-accent2' : ''} />{label}
              {id === 'about' && newVersion && <ArrowUpCircle size={14} className="ml-auto text-accent2" aria-label={`Versão ${newVersion} disponível`} />}
              {id === 'batch' && total > 0 && <span className="ml-auto rounded-full bg-hover px-1.5 text-xs tabular-nums">{pending ? `${total - pending}/${total}` : total}</span>}
            </button>
          ))}
        </div>
        <div className="mt-auto"><DeviceStatus /></div>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col">
        <Warning />
        <div className="min-h-0 flex-1">
          {page === 'workspace' ? <Workspace /> : page === 'batch' ? <Batch /> : page === 'recents' ? <Recents /> : page === 'models' ? <Models /> : page === 'about' ? <About /> : <SettingsPage />}
        </div>
      </main>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/85">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent px-16 py-12 text-lg font-semibold"><Upload size={34} className="text-accent" />Solte para adicionar</div>
        </div>
      )}
      <ConflictDialog />
      <Toasts />
    </div>
  )
}
