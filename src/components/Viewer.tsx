// Visualizador com zoom, arraste, comparacao antes/depois e fundos de previa.
// O fundo escolhido e so visual: o PNG exportado continua transparente.
import { ChevronsLeftRight, Loader2, Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Item, PreviewBg, PreviewMode } from '../../shared/types'
import { saveSettings, useStore } from '../state'
import { stageText } from './common'

const BG_CLASS: Record<PreviewBg, string> = { checker: 'checker', black: 'bg-view-black', white: 'bg-view-white', gray: 'bg-view-gray' }
const BG_LABEL: Record<PreviewBg, string> = { checker: 'Quadriculado', black: 'Preto', white: 'Branco', gray: 'Cinza' }

export function Viewer({ item }: { item: Item }) {
  const mode = useStore((s) => s.settings.previewMode)
  const bg = useStore((s) => s.settings.previewBg)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [fitted, setFitted] = useState(true)
  const [split, setSplit] = useState(0.5)

  const hasResult = !!item.resultUrl && item.status !== 'invalid'
  const sameShape = !hasResult || (item.resultWidth === item.width && item.resultHeight === item.height)
  let shown: PreviewMode = hasResult ? mode : 'original'
  if (shown === 'compare' && !sameShape) shown = 'result'

  const iw = (shown === 'result' ? item.resultWidth : item.width) || 1
  const ih = (shown === 'result' ? item.resultHeight : item.height) || 1

  useLayoutEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback(() => {
    const scale = Math.max(0.01, Math.min((size.w - 48) / iw, (size.h - 48) / ih, 3))
    return { scale, x: (size.w - iw * scale) / 2, y: (size.h - ih * scale) / 2 }
  }, [size, iw, ih])

  useLayoutEffect(() => setFitted(true), [item.id])
  const v = fitted ? fitView() : view

  const zoomAt = useCallback(
    (factor: number, cx = size.w / 2, cy = size.h / 2) => {
      const cur = fitted ? fitView() : view
      const scale = Math.min(32, Math.max(0.02, cur.scale * factor))
      const k = scale / cur.scale
      setView({ scale, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k })
      setFitted(false)
    },
    [fitted, fitView, view, size],
  )

  useEffect(() => {
    const el = box.current!
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [zoomAt])

  const drag = (e: React.PointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent) => void) => {
    if (e.button !== 0) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy, ev)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pan = (e: React.PointerEvent) => {
    const start = v
    drag(e, (dx, dy) => {
      setView({ scale: start.scale, x: start.x + dx, y: start.y + dy })
      setFitted(false)
    })
  }

  const moveSplit = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    setSplit(Math.min(1, Math.max(0, (clientX - r.left) / r.width)))
  }

  const frame = { left: v.x, top: v.y, width: iw * v.scale, height: ih * v.scale }
  // posicao do divisor em pixels dentro da imagem
  const cut = Math.min(frame.width, Math.max(0, split * size.w - v.x))
  const pixelated = v.scale > 4 ? ('pixelated' as const) : undefined
  const imgClass = 'pointer-events-none absolute inset-0 h-full w-full'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex rounded-lg border border-line p-0.5">
          {(['compare', 'result', 'original'] as PreviewMode[]).map((m) => (
            <button
              key={m}
              data-testid={`mode-${m}`}
              disabled={m !== 'original' && (!hasResult || (m === 'compare' && !sameShape))}
              onClick={() => void saveSettings({ previewMode: m })}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors disabled:cursor-default disabled:opacity-35 ${shown === m ? 'bg-hover text-fg' : 'text-muted'}`}
            >
              {m === 'compare' ? 'Comparar' : m === 'result' ? 'Resultado' : 'Original'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" title="Fundo da prévia (não muda o arquivo exportado)">
          {(Object.keys(BG_LABEL) as PreviewBg[]).map((b) => (
            <button
              key={b}
              data-testid={`bg-${b}`}
              aria-label={`Fundo ${BG_LABEL[b]}`}
              title={BG_LABEL[b]}
              onClick={() => void saveSettings({ previewBg: b })}
              className={`h-5 w-5 cursor-pointer rounded-md border ${BG_CLASS[b]} ${bg === b ? 'border-accent ring-2 ring-accent/50' : 'border-line'}`}
              style={b === 'checker' ? { backgroundSize: '8px 8px' } : undefined}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost btn-icon" onClick={() => zoomAt(1 / 1.25)} aria-label="Diminuir zoom"><Minus size={15} /></button>
          <button data-testid="zoom-level" className="btn btn-ghost w-16 tabular-nums" title="Tamanho real (100%)" onClick={() => zoomAt(1 / v.scale)}>
            {Math.round(v.scale * 100)}%
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => zoomAt(1.25)} aria-label="Aumentar zoom" data-testid="zoom-in"><Plus size={15} /></button>
          <button className="btn" onClick={() => setFitted(true)} data-testid="fit"><Maximize size={13} />Ajustar</button>
        </div>
      </div>

      <div ref={box} data-testid="viewer" className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing" onPointerDown={pan} onDoubleClick={() => setFitted(true)}>
        {item.originalUrl && size.w > 0 && (
          <div className="absolute shadow-2xl shadow-black/30" style={frame}>
            {shown !== 'original' && (
              <div className={`absolute inset-0 ${BG_CLASS[bg]}`} style={shown === 'compare' ? { clipPath: `inset(0 0 0 ${cut}px)` } : undefined} />
            )}
            {shown !== 'result' && (
              <img
                data-testid="img-original"
                src={item.originalUrl}
                className={imgClass}
                style={{ imageRendering: pixelated, clipPath: shown === 'compare' ? `inset(0 ${frame.width - cut}px 0 0)` : undefined }}
                alt="Original"
              />
            )}
            {shown !== 'original' && (
              <img
                data-testid="img-result"
                src={item.resultUrl!}
                className={imgClass}
                style={{ imageRendering: pixelated, clipPath: shown === 'compare' ? `inset(0 0 0 ${cut}px)` : undefined }}
                alt="Sem fundo"
              />
            )}
          </div>
        )}
        {shown === 'compare' && (
          <div className="absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize" style={{ left: split * size.w }} data-testid="split-handle"
            role="slider" tabIndex={0} aria-label="Comparar antes e depois" aria-valuenow={Math.round(split * 100)} aria-valuemin={0} aria-valuemax={100}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - 0.02))
              if (e.key === 'ArrowRight') setSplit((s) => Math.min(1, s + 0.02))
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation()
              drag(e, (_x, _y, ev) => moveSplit(ev.clientX))
            }}
          >
            <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,.7)]" />
            <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
              <ChevronsLeftRight size={16} />
            </div>
          </div>
        )}
        {shown === 'compare' && (
          <>
            <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">Antes</span>
            <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">Depois</span>
          </>
        )}
        {(item.status === 'processing' || item.status === 'queued' || item.status === 'probing') && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 font-medium text-white">
            <Loader2 size={15} className="animate-spin" />
            {item.status === 'processing' ? stageText(item) : item.status === 'queued' ? 'Na fila…' : 'Lendo imagem…'}
          </div>
        )}
        {(item.status === 'error' || item.status === 'invalid') && (
          <div className="selectable absolute bottom-4 left-1/2 z-20 max-w-[80%] -translate-x-1/2 rounded-xl border border-bad/50 bg-panel px-4 py-3 text-bad" data-testid="viewer-error">
            {item.error}
          </div>
        )}
      </div>
    </div>
  )
}
