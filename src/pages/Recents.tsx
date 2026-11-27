import { Clock, Eye, FolderOpen, RotateCcw, X } from 'lucide-react'
import { fmtMs, fmtRes } from '../components/common'
import { api, toast, useStore } from '../state'
import type { HistoryEntry } from '../../shared/types'

async function open(h: HistoryEntry, reprocess: boolean) {
  const id = await api().historyOpen(h.id, reprocess)
  if (!id) return
  useStore.setState({ currentId: id, page: 'workspace', ...(reprocess ? { model: h.model } : {}) })
  if (reprocess) toast('info', 'Imagem original carregada. Escolha o modelo e clique em processar.')
}

export function Recents() {
  const history = useStore((s) => s.history)
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel p-4">
        <h1 className="text-lg font-semibold">Recentes</h1>
        <span className="text-muted">O histórico guarda só miniaturas e caminhos, sem cópias das suas imagens.</span>
        <button className="btn ml-auto" disabled={!history.length} onClick={() => confirm('Limpar o histórico? Nenhum arquivo seu será apagado.') && void api().historyClear()}>Limpar histórico</button>
      </header>
      {!history.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted"><Clock size={34} /><p>As imagens processadas aparecem aqui.</p></div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 overflow-auto p-4">
          {history.map((h) => (
            <article key={h.id} data-testid="recent" className="card flex flex-col overflow-hidden">
              <div className="checker h-40">{h.thumbUrl && <img src={h.thumbUrl} loading="lazy" className="h-full w-full object-contain" alt={h.name} />}</div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="selectable truncate font-semibold" title={h.originalPath}>{h.name}</div>
                <div className="text-xs text-muted">{new Date(h.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {h.model}</div>
                <div className="text-xs text-muted">{fmtRes(h.width, h.height)} · {fmtMs(h.timeMs)}{h.device ? ` · ${h.device.toUpperCase()}` : ''}</div>
                <div className={`selectable truncate text-xs ${h.savedPath && h.resultExists ? 'text-muted' : 'text-warn'}`} title={h.savedPath ?? ''}>
                  {h.savedPath ? (h.resultExists ? h.savedPath : 'Arquivo final movido ou apagado') : h.resultExists ? 'Ainda não salvo (some ao fechar o app)' : 'Não foi salvo — reprocesse para gerar de novo'}
                </div>
                {!h.originalExists && <div className="text-xs text-bad">Original não encontrado</div>}
                <div className="mt-2 flex gap-1.5">
                  <button className="btn flex-1" disabled={!h.resultExists} onClick={() => void open(h, false)}><Eye size={13} />Abrir</button>
                  <button className="btn btn-icon" title="Localizar arquivo final" disabled={!h.savedPath || !h.resultExists} onClick={() => void api().reveal(h.savedPath!)}><FolderOpen size={14} /></button>
                  <button className="btn btn-icon" title="Reprocessar" disabled={!h.originalExists} onClick={() => void open(h, true)}><RotateCcw size={14} /></button>
                  <button className="btn btn-icon" title="Tirar do histórico (não apaga arquivos)" onClick={() => void api().historyRemove([h.id])}><X size={14} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
