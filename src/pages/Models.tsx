import { Check, Download, Loader2, Star } from 'lucide-react'
import { useState } from 'react'
import { fmtBytes, fmtMs, Meter, useModelNames } from '../components/common'
import { modelMeta, type Category } from '../models'
import { api, errorText, refreshEnv, saveSettings, toast, useStore } from '../state'

const CATS: (Category | 'todos' | 'baixados')[] = ['todos', 'baixados', 'geral', 'pessoas', 'objetos', 'animais', 'anime', 'roupas']

export function Models() {
  const env = useStore((s) => s.env)
  const loading = useStore((s) => s.envLoading)
  const stats = useStore((s) => s.stats)
  const current = useStore((s) => s.model)
  const def = useStore((s) => s.settings.defaultModel)
  const names = useModelNames()
  const [filter, setFilter] = useState<(typeof CATS)[number]>('todos')
  const [downloading, setDownloading] = useState<string | null>(null)

  const info = (n: string) => env?.models.find((m) => m.name === n)
  const shown = names.filter((n) => filter === 'todos' || (filter === 'baixados' ? info(n)?.downloaded : modelMeta(n).categories.includes(filter)))

  const download = async (name: string) => {
    setDownloading(name)
    try {
      const next = await api().downloadModel(name)
      if (next) useStore.setState({ env: next })
      toast('success', `Modelo ${name} baixado.`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-line bg-panel p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Modelos</h1>
          <span className="text-muted">
            {env ? `${env.models.length} modelos compatíveis com o seu rembg ${env.rembgVersion} · ${env.models.filter((m) => m.downloaded).length} baixados` : 'Consultando sua instalação…'}
          </span>
          <button className="btn ml-auto" disabled={loading} onClick={() => void refreshEnv(true)}>{loading && <Loader2 size={13} className="animate-spin" />}Atualizar</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`btn h-7 rounded-full capitalize ${filter === c ? 'btn-primary' : ''}`}>{c}</button>
          ))}
        </div>
        <p className="text-xs text-muted">Velocidade e qualidade são classificações aproximadas. “No seu PC” é medido nos seus processamentos. Baixar um modelo usa a internet só para receber o arquivo do modelo.</p>
      </header>
      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 overflow-auto p-4">
        {shown.map((n) => {
          const m = modelMeta(n)
          const f = info(n)
          return (
            <article key={n} data-testid={`model-${n}`} className={`card flex flex-col gap-2 p-4 ${current === n ? 'border-accent' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{m.label}</div>
                  <code className="selectable text-xs text-muted">{n}</code>
                </div>
                {def === n && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent2"><Star size={11} />Padrão</span>}
              </div>
              <p className="leading-snug">{m.use}</p>
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>Velocidade</span><Meter value={m.speed} />
                <span>Qualidade</span><Meter value={m.quality} />
              </div>
              <div className="flex flex-wrap gap-1">
                {m.categories.map((c) => <span key={c} className="rounded-md bg-hover px-1.5 py-0.5 text-xs capitalize text-muted">{c}</span>)}
                {m.heavy && <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-xs text-warn">pesado</span>}
              </div>
              {m.note && <p className="text-xs leading-snug text-warn">{m.note}</p>}
              <div className="text-xs text-muted">
                {f?.downloaded ? <span className="text-ok">Baixado · {fmtBytes(f.sizeBytes)}</span> : 'Não baixado'}
                {stats[n] && ` · No seu PC: ~${fmtMs(stats[n].avgMs)} (${stats[n].device?.toUpperCase()})`}
              </div>
              <div className="mt-auto flex gap-2 pt-1">
                <button className="btn flex-1" onClick={() => useStore.setState({ model: n, page: 'workspace' })}>{current === n && <Check size={13} />}{current === n ? 'Em uso' : 'Usar'}</button>
                <button className="btn" disabled={def === n} onClick={() => void saveSettings({ defaultModel: n })}>Tornar padrão</button>
                {f && !f.downloaded && (
                  <button className="btn btn-icon" title="Baixar agora" disabled={!!downloading} onClick={() => void download(n)}>
                    {downloading === n ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
