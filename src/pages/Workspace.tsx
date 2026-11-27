import { CircleAlert, Download, FolderOpen, ImagePlus, Layers, Play, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Item } from '../../shared/types'
import { Viewer } from '../components/Viewer'
import { AdvancedFields, Collapsible, fmtBytes, fmtMs, fmtRes, Meter, ModelSelect, StatusBadge } from '../components/common'
import { modelMeta } from '../models'
import { addFromDialog, api, canProcess, isBusy, processIds, processTargets, saveMany, saveOne, useStore } from '../state'

function Empty() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <button
        data-testid="dropzone"
        onClick={() => void addFromDialog()}
        className="fade-up flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-line px-10 py-16 transition-colors hover:border-accent hover:bg-panel"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <ImagePlus size={30} />
        </span>
        <span className="text-xl font-semibold">Arraste imagens para cá</span>
        <span className="text-muted">Uma ou várias de uma vez. Pastas também funcionam.</span>
        <span className="btn btn-primary pointer-events-none">Selecionar arquivos</span>
        <span className="text-xs text-muted">PNG · JPG · WEBP · BMP · TIFF — tudo é processado no seu PC</span>
      </button>
    </div>
  )
}

function OutputName({ item }: { item: Item }) {
  const pattern = useStore((s) => s.settings.namePattern)
  const [text, setText] = useState(item.outputName ?? '')
  useEffect(() => setText(item.outputName ?? ''), [item.id, item.outputName])
  const stem = item.name.replace(/\.[^.]+$/, '')
  return (
    <div>
      <div className="label mb-1">Nome do arquivo final</div>
      <input
        className="field"
        value={text}
        placeholder={pattern.replace('{nome}', stem).replace('{modelo}', item.resultModel ?? 'modelo')}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void api().renameItem(item.id, text)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  )
}

function Filmstrip() {
  const items = useStore((s) => s.items)
  const currentId = useStore((s) => s.currentId)
  if (items.length < 2) return null
  return (
    <div className="flex gap-2 overflow-x-auto border-t border-line bg-panel p-2">
      {items.map((i) => (
        <button
          key={i.id}
          title={i.name}
          onClick={() => useStore.setState({ currentId: i.id })}
          className={`checker relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 ${i.id === currentId ? 'border-accent' : 'border-transparent'}`}
        >
          {(i.resultThumbUrl ?? i.thumbUrl) && <img src={(i.resultThumbUrl ?? i.thumbUrl)!} className="h-full w-full object-contain" alt={i.name} />}
          {i.status !== 'idle' && (
            <span
              className={`absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-black/50 ${
                i.status === 'done' ? 'bg-ok' : i.status === 'error' || i.status === 'invalid' ? 'bg-bad' : isBusy(i) ? 'animate-pulse bg-accent' : 'bg-muted'
              }`}
            />
          )}
        </button>
      ))}
    </div>
  )
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  )
}

export function Workspace() {
  const items = useStore((s) => s.items)
  const currentId = useStore((s) => s.currentId)
  const model = useStore((s) => s.model)
  const options = useStore((s) => s.options)
  const stats = useStore((s) => s.stats)
  const env = useStore((s) => s.env)
  const item = items.find((i) => i.id === currentId)

  if (!item) return <Empty />

  const meta = modelMeta(model)
  const measured = stats[model]
  const missing = env && !env.models.find((m) => m.name === model)?.downloaded
  const done = items.filter((i) => i.status === 'done')
  const all = processTargets(items)
  const changedModel = item.status === 'done' && item.resultModel !== model
  const customized = JSON.stringify(options) !== JSON.stringify(useStore.getState().settings.options)

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <Viewer item={item} />
        <Filmstrip />
      </div>
      <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div>
            <div className="label mb-1.5">Modelo</div>
            <ModelSelect testId="model-select" value={model} onChange={(m) => useStore.setState({ model: m })} />
            <p className="mt-2 leading-snug text-muted">{meta.use}</p>
            <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>Velocidade</span><Meter value={meta.speed} />
              <span>Qualidade</span><Meter value={meta.quality} />
            </div>
            {measured && <p className="mt-1.5 text-xs text-muted">No seu PC: ~{fmtMs(measured.avgMs)} por imagem ({measured.device?.toUpperCase()})</p>}
            {meta.heavy && <p className="mt-2 flex gap-1.5 text-xs leading-snug text-warn"><CircleAlert size={13} className="mt-0.5 shrink-0" />Modelo pesado: fica lento se a memória da placa de vídeo estiver ocupada.</p>}
            {missing && <p className="mt-2 text-xs text-warn">Ainda não baixado: será baixado no primeiro uso.</p>}
          </div>

          <Collapsible title="Opções avançadas" badge={customized ? <span className="text-xs text-accent2">alteradas</span> : null}>
            <AdvancedFields value={options} onChange={(o) => useStore.setState({ options: o })} />
          </Collapsible>

          <div className="card flex flex-col gap-1.5 p-3">
            <div className="selectable truncate font-semibold" title={item.path}>{item.name}</div>
            <Info k="Status" v={<StatusBadge item={item} />} />
            <Info k="Resolução" v={fmtRes(item.width, item.height)} />
            <Info k="Arquivo" v={`${item.format ?? item.ext.toUpperCase()} · ${fmtBytes(item.sizeBytes)}`} />
            {item.status === 'done' && (
              <>
                <Info k="Modelo usado" v={item.resultModel} />
                <Info k="Tempo" v={`${fmtMs(item.timeMs)}${item.device ? ` · ${item.device.toUpperCase()}` : ''}`} />
              </>
            )}
            {item.savedPath && (
              <button className="btn mt-1" title={item.savedPath} onClick={() => void api().reveal(item.savedPath!)}>
                <FolderOpen size={14} />Mostrar arquivo salvo
              </button>
            )}
          </div>

          {item.status === 'done' && <OutputName item={item} />}
        </div>

        <div className="flex flex-col gap-2 border-t border-line p-4">
          {isBusy(item) ? (
            <button data-testid="cancel" className="btn h-10" onClick={() => void api().cancel([item.id])}><Square size={14} />Cancelar</button>
          ) : (
            <button data-testid="process" className={`btn h-10 ${item.status !== 'done' || changedModel ? 'btn-primary' : ''}`} disabled={!canProcess(item)} onClick={() => void processIds([item.id])}>
              {item.status === 'done' ? <RotateCcw size={15} /> : <Play size={15} />}
              {item.status === 'done' ? (changedModel ? `Reprocessar com ${meta.label}` : 'Reprocessar') : 'Remover fundo'}
            </button>
          )}
          <button data-testid="save" className={`btn h-10 ${item.status === 'done' && !changedModel ? 'btn-primary' : ''}`} disabled={item.status !== 'done'} onClick={() => void saveOne(item.id)}>
            <Download size={15} />Salvar PNG
          </button>
          {items.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" disabled={!all.ids.length || items.some(isBusy)} onClick={() => void processIds(all.ids)}><Layers size={14} />{all.redo ? 'Refazer todas' : 'Processar todas'}</button>
              <button className="btn" disabled={!done.length} onClick={() => void saveMany(done.map((i) => i.id))}><Download size={14} />Salvar todas</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={() => void addFromDialog()}><ImagePlus size={14} />Adicionar</button>
            <button className="btn btn-ghost" onClick={() => void api().removeItems([item.id])}>
              {items.length > 1 ? <X size={14} /> : <Trash2 size={14} />}Remover da fila
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
