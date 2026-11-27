import { Download, Eye, FolderOpen, ImagePlus, Layers, Play, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { fmtBytes, fmtMs, fmtRes, ModelSelect, StatusBadge, stageText } from '../components/common'
import { addFromDialog, api, canProcess, isBusy, processIds, processTargets, saveMany, saveOne, saveSettings, useStore } from '../state'

export function Batch() {
  const items = useStore((s) => s.items)
  const checked = useStore((s) => s.checked)
  const run = useStore((s) => s.run)
  const model = useStore((s) => s.model)
  const outputDir = useStore((s) => s.settings.outputDir)
  const autoSave = useStore((s) => s.settings.autoSave)

  const selected = items.filter((i) => checked.includes(i.id))
  const done = items.filter((i) => i.status === 'done')
  const busy = items.filter(isBusy)
  const targets = processTargets(items)
  const runItems = items.filter((i) => run.includes(i.id))
  const finished = runItems.filter((i) => !isBusy(i)).length
  const count = (st: string) => items.filter((i) => i.status === st).length
  const toggle = (id: string) => useStore.setState({ checked: checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id] })
  const chooseDir = async () => {
    const dir = await api().chooseFolder(outputDir)
    if (dir) await saveSettings({ outputDir: dir })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-lg font-semibold">Lote</h1>
          <div className="w-72"><ModelSelect value={model} onChange={(m) => useStore.setState({ model: m })} testId="batch-model" /></div>
          <button className="btn" onClick={() => void addFromDialog()}><ImagePlus size={14} />Adicionar</button>
          <div className="ml-auto flex flex-wrap gap-2">
            {busy.length > 0 && <button data-testid="cancel-all" className="btn" onClick={() => void api().cancel('all')}><Square size={13} />Cancelar tudo</button>}
            <button data-testid="process-selected" className="btn" disabled={!selected.some(canProcess)} onClick={() => void processIds(checked)}><Play size={14} />Processar selecionadas</button>
            <button data-testid="process-all" className="btn btn-primary" disabled={!targets.ids.length || busy.length > 0} onClick={() => void processIds(targets.ids)}>
              <Layers size={14} />{targets.redo && targets.ids.length ? 'Reprocessar todas' : `Processar todas${targets.ids.length ? ` (${targets.ids.length})` : ''}`}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => void chooseDir()}><FolderOpen size={14} />Pasta de saída</button>
          <span className="selectable max-w-96 truncate text-muted" title={outputDir ?? ''}>{outputDir ?? (autoSave ? 'Mesma pasta do original' : 'Perguntar ao salvar')}</span>
          {outputDir && <button className="btn btn-ghost btn-icon" title="Limpar pasta padrão" onClick={() => void saveSettings({ outputDir: null })}><X size={14} /></button>}
          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-muted"><input type="checkbox" checked={autoSave} onChange={(e) => void saveSettings({ autoSave: e.target.checked })} />Salvar automaticamente</label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn" disabled={!selected.length} onClick={() => void api().removeItems(checked)}><Trash2 size={14} />Remover selecionadas</button>
            <button className="btn" disabled={!items.length} onClick={() => void api().clearItems()}>Limpar fila</button>
            <button className="btn" disabled={!selected.some((i) => i.status === 'done')} onClick={() => void saveMany(checked)}><Download size={14} />Salvar selecionadas</button>
            <button data-testid="save-all" className="btn" disabled={!done.length} onClick={() => void saveMany(done.map((i) => i.id))}><Download size={14} />Salvar todas ({done.length})</button>
            <button className="btn btn-ghost" disabled={!done.length} title="Escolher outra pasta só desta vez" onClick={() => void saveMany(done.map((i) => i.id), { askDir: true })}>Salvar em…</button>
          </div>
        </div>
        {runItems.length > 0 && (
          <div data-testid="progress">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{busy.length ? `Processando ${Math.min(finished + 1, runItems.length)} de ${runItems.length} — uma por vez` : `Fila concluída: ${finished} de ${runItems.length}`}</span>
              <span>{count('done')} concluídas · {count('error') + count('invalid')} com erro · {count('cancelled')} canceladas</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(finished / runItems.length) * 100}%` }} /></div>
          </div>
        )}
      </header>

      {!items.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
          <Layers size={34} />
          <p>Arraste dezenas de imagens (ou uma pasta) para montar a fila.</p>
          <button className="btn btn-primary" onClick={() => void addFromDialog()}>Selecionar arquivos</button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-bg">
              <tr className="[&>th]:label [&>th]:px-2 [&>th]:py-2">
                <th className="w-10 !pl-4"><input type="checkbox" aria-label="Selecionar todas" checked={checked.length === items.length} onChange={(e) => useStore.setState({ checked: e.target.checked ? items.map((i) => i.id) : [] })} /></th>
                <th>Original</th><th>Nome</th><th>Resolução</th><th>Tamanho</th><th>Modelo</th><th>Status</th><th>Tempo</th><th>Resultado</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} data-testid="batch-row" className={`border-t border-line transition-colors hover:bg-panel [&>td]:px-2 [&>td]:py-1.5 ${checked.includes(i.id) ? 'bg-accent/10' : ''}`}>
                  <td className="!pl-4"><input type="checkbox" aria-label={`Selecionar ${i.name}`} checked={checked.includes(i.id)} onChange={() => toggle(i.id)} /></td>
                  <td><div className="checker h-12 w-12 overflow-hidden rounded-md">{i.thumbUrl && <img src={i.thumbUrl} loading="lazy" className="h-full w-full object-contain" alt="" />}</div></td>
                  <td className="max-w-64"><div className="selectable truncate font-medium" title={i.path}>{i.name}</div>{i.error && <div className="truncate text-xs text-bad" title={i.error}>{i.error}</div>}</td>
                  <td className="whitespace-nowrap text-muted">{fmtRes(i.width, i.height)}</td>
                  <td className="whitespace-nowrap text-muted">{fmtBytes(i.sizeBytes)}</td>
                  <td className="text-muted">{i.model ?? '—'}</td>
                  <td className="whitespace-nowrap"><StatusBadge item={i} />{i.status === 'processing' && <div className="text-xs text-muted">{stageText(i)}</div>}{i.savedPath && <div className="text-xs text-muted" title={i.savedPath}>salvo</div>}</td>
                  <td className="whitespace-nowrap text-muted">{i.status === 'done' ? fmtMs(i.timeMs) : '—'}</td>
                  <td><div className="checker h-12 w-12 overflow-hidden rounded-md">{i.resultThumbUrl && <img src={i.resultThumbUrl} loading="lazy" className="h-full w-full object-contain" alt="Resultado" />}</div></td>
                  <td className="!pr-4">
                    <div className="flex justify-end gap-0.5">
                      <button className="btn btn-ghost btn-icon" title="Ver no Workspace" onClick={() => useStore.setState({ currentId: i.id, page: 'workspace' })}><Eye size={14} /></button>
                      {isBusy(i) ? (
                        <button className="btn btn-ghost btn-icon" title="Cancelar" onClick={() => void api().cancel([i.id])}><Square size={13} /></button>
                      ) : (
                        <button className="btn btn-ghost btn-icon" title={i.status === 'done' ? 'Reprocessar com o modelo escolhido' : 'Processar'} disabled={!canProcess(i)} onClick={() => void processIds([i.id])}>{i.status === 'done' ? <RotateCcw size={14} /> : <Play size={14} />}</button>
                      )}
                      <button className="btn btn-ghost btn-icon" title="Salvar PNG" disabled={i.status !== 'done'} onClick={() => void saveOne(i.id)}><Download size={14} /></button>
                      <button className="btn btn-ghost btn-icon" title="Remover da fila (não apaga o arquivo)" onClick={() => void api().removeItems([i.id])}><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
