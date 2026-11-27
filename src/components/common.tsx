import { ChevronDown, CircleAlert, CircleCheck, Clock, Loader2, Ban, Circle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Item, ProcessOptions, Stage } from '../../shared/types'
import { modelMeta, FALLBACK_MODELS } from '../models'
import { useStore } from '../state'

export const fmtBytes = (b: number | null) =>
  b == null ? '—' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
export const fmtMs = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
export const fmtRes = (w: number | null, h: number | null) => (w && h ? `${w} × ${h}` : '—')

const STAGES: Record<Exclude<Stage, null>, string> = {
  downloading: 'Baixando modelo…',
  loading: 'Carregando modelo…',
  inferring: 'Removendo fundo…',
  refining: 'Refinando bordas…',
  saving: 'Gravando PNG…',
}
export const stageText = (i: Item) => (i.stage ? STAGES[i.stage] : 'Processando…')

export function StatusBadge({ item }: { item: Item }) {
  const map = {
    probing: ['Lendo…', 'text-muted', <Loader2 size={12} className="animate-spin" />],
    invalid: ['Inválida', 'text-bad', <CircleAlert size={12} />],
    idle: ['Pronta', 'text-muted', <Circle size={12} />],
    queued: ['Aguardando', 'text-warn', <Clock size={12} />],
    processing: ['Processando', 'text-accent2', <Loader2 size={12} className="animate-spin" />],
    done: ['Concluído', 'text-ok', <CircleCheck size={12} />],
    error: ['Erro', 'text-bad', <CircleAlert size={12} />],
    cancelled: ['Cancelado', 'text-muted', <Ban size={12} />],
  } as const
  const [label, color, icon] = map[item.status]
  return (
    <span data-status={item.status} title={item.error ?? undefined} className={`inline-flex items-center gap-1 font-medium ${color}`}>
      {icon}
      {label}
    </span>
  )
}

export function useModelNames(): string[] {
  const env = useStore((s) => s.env)
  const names = env?.models.map((m) => m.name) ?? FALLBACK_MODELS
  // recomendado primeiro, depois os ja baixados
  return [...names].sort((a, b) => {
    const rank = (n: string) => (n === 'isnet-general-use' ? 0 : env?.models.find((m) => m.name === n)?.downloaded ? 1 : 2)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
}

export function ModelSelect({ value, onChange, testId }: { value: string; onChange: (m: string) => void; testId?: string }) {
  const env = useStore((s) => s.env)
  const names = useModelNames()
  const all = names.includes(value) ? names : [value, ...names]
  return (
    <select data-testid={testId} className="field cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)}>
      {all.map((n) => {
        const downloaded = env?.models.find((m) => m.name === n)?.downloaded
        return (
          <option key={n} value={n}>
            {modelMeta(n).label} — {n}
            {env && !downloaded ? ' (baixa ao usar)' : ''}
          </option>
        )
      })}
    </select>
  )
}

export function Meter({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-3.5 rounded-full ${i <= value ? 'bg-accent' : 'bg-line'}`} />
      ))}
    </span>
  )
}

export function Toggle({ checked, onChange, title, hint, testId }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint?: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input data-testid={testId} type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium">{title}</span>
        {hint && <span className="block text-xs leading-snug text-muted">{hint}</span>}
      </span>
    </label>
  )
}

function Slider({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between font-medium">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <div className="text-xs leading-snug text-muted">{hint}</div>
    </div>
  )
}

export function AdvancedFields({ value, onChange }: { value: ProcessOptions; onChange: (v: ProcessOptions) => void }) {
  const env = useStore((s) => s.env)
  const up = (p: Partial<ProcessOptions>) => onChange({ ...value, ...p })
  const matting = value.alphaMatting || value.vitmatte
  const vitDownloaded = env?.vitmatte.find((v) => v.variant === value.vitmatteModel)?.downloaded
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="mb-1 font-medium">Refinamento de bordas</div>
        <select
          className="field"
          value={value.vitmatte ? 'vitmatte' : value.alphaMatting ? 'alpha' : 'none'}
          disabled={value.onlyMask}
          onChange={(e) => up({ alphaMatting: e.target.value === 'alpha', vitmatte: e.target.value === 'vitmatte' })}
        >
          <option value="none">Nenhum (mais rápido)</option>
          <option value="alpha">Alpha matting</option>
          <option value="vitmatte">ViTMatte (IA para cabelo e pelos)</option>
        </select>
        <div className="mt-1 text-xs leading-snug text-muted">
          {value.vitmatte
            ? `Uma segunda IA refina fios finos.${env && !vitDownloaded ? ' Baixa um modelo extra no primeiro uso.' : ''}`
            : value.alphaMatting
              ? 'Suaviza transições em cabelo e bordas. Usa muita memória RAM em fotos grandes (cerca de 4 GB a mais em 12 MP); o limite é de até 25 MP, menor se houver pouca RAM livre.'
              : 'Usa a máscara do modelo como está.'}
        </div>
      </div>
      {value.vitmatte && (
        <select className="field" value={value.vitmatteModel} onChange={(e) => up({ vitmatteModel: e.target.value as ProcessOptions['vitmatteModel'] })}>
          <option value="small-distinctions-646">ViTMatte pequeno (recomendado)</option>
          <option value="base-distinctions-646">ViTMatte base (maior e mais lento)</option>
        </select>
      )}
      {matting && !value.onlyMask && (
        <>
          <Slider label="Certeza de objeto" hint="Acima deste valor a área é mantida com certeza. Diminua se partes do objeto sumirem." min={0} max={255} value={value.fgThreshold} onChange={(v) => up({ fgThreshold: v })} />
          <Slider label="Certeza de fundo" hint="Abaixo deste valor a área é fundo com certeza. Aumente se sobrar fundo." min={0} max={255} value={value.bgThreshold} onChange={(v) => up({ bgThreshold: v })} />
          <Slider label="Largura da borda analisada" hint="Quanto maior, mais larga a faixa que o refinamento recalcula." min={0} max={40} value={value.erodeSize} onChange={(v) => up({ erodeSize: v })} />
        </>
      )}
      <Toggle title="Limpar a máscara" hint="Remove pontinhos soltos e alisa o contorno. As bordas ficam mais duras." checked={value.postProcessMask} onChange={(v) => up({ postProcessMask: v })} />
      {!matting && (
        <Toggle title="Remover halo colorido" hint="Tira a cor do fundo antigo que sobra nas bordas suaves." checked={value.decontaminate} onChange={(v) => up({ decontaminate: v })} />
      )}
      <Toggle title="Exportar só a máscara" hint="Gera uma imagem em preto e branco (sem transparência), útil em editores." checked={value.onlyMask} onChange={(v) => up({ onlyMask: v })} />
    </div>
  )
}

export function Collapsible({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <button className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        {title}
        <span className="ml-auto">{badge}</span>
      </button>
      {open && <div className="fade-up border-t border-line p-3">{children}</div>}
    </div>
  )
}
