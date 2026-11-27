// Sobre: versao, atualizacoes e documentos.
import { CircleAlert, CircleCheck, Download, ExternalLink, FileText, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DocId, LinkId, UpdateState } from '../../shared/types'
import { fmtBytes } from '../components/common'
import { api, errorText, toast, useStore } from '../state'

const INSTALL: Record<UpdateState['installType'], string> = {
  portable: 'Versão portátil',
  installed: 'Instalada',
  zip: 'Pasta extraída do ZIP',
  dev: 'Desenvolvimento',
}

const DOCS: [DocId, string][] = [
  ['privacy', 'Privacidade'],
  ['terms', 'Condições de uso'],
  ['models', 'Licenças dos modelos'],
  ['signing', 'Assinatura de código'],
  ['license', 'Licença do app'],
  ['third-party', 'Componentes de terceiros'],
]

const LINK_LABELS: [LinkId, string][] = [
  ['repository', 'Repositório'],
  ['releases', 'Versões publicadas'],
  ['issues', 'Suporte e problemas (Issues)'],
]

function Updates() {
  const u = useStore((s) => s.update)
  if (!u) return null
  const working = ['checking', 'downloading', 'verifying', 'installing'].includes(u.status)
  const percent = u.size ? Math.min(100, Math.floor((u.received / u.size) * 100)) : 0
  const newer = !!u.latestVersion && !['up-to-date', 'no-release', 'checking'].includes(u.status)
  const failed = u.status === 'error' || u.status === 'download-error'
  const installLabel = u.installType === 'portable' ? 'Instalar e reiniciar' : u.installType === 'installed' ? 'Instalar' : 'Salvar ZIP…'

  return (
    <section className="card p-4" data-testid="update-card" data-status={u.status}>
      <h2 className="label mb-3">Atualizações</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-base font-semibold" data-testid="current-version">Rembg Studio {u.currentVersion}</div>
          <div className="text-xs text-muted" data-testid="install-type">{INSTALL[u.installType]}</div>
        </div>
        <button className="btn ml-auto" data-testid="update-check" disabled={working} onClick={() => void api().updateCheck()}>
          <RefreshCw size={14} className={u.status === 'checking' ? 'animate-spin' : ''} />Verificar atualizações
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">A consulta ao GitHub só acontece quando você clica. O GitHub recebe seu endereço IP, a versão do app e o idioma do sistema.</p>
      {u.testServer && <p className="mt-2 rounded-lg border border-warn/50 p-2 text-xs text-warn">Modo de teste: usando um servidor de atualização local.</p>}

      <div aria-live="polite" className="mt-3 flex flex-col gap-3 empty:hidden">
        {u.status === 'up-to-date' && (
          <p className="flex items-center gap-2 text-ok" data-testid="update-message"><CircleCheck size={15} />Você já está na versão mais recente. Última publicada: {u.latestVersion}.</p>
        )}
        {u.message && (
          <p className={`selectable flex items-start gap-2 ${failed ? 'text-bad' : 'text-muted'}`} data-testid="update-message">
            {failed && <CircleAlert size={15} className="mt-0.5 shrink-0" />}{u.message}
          </p>
        )}
        {newer && (
          <div className="rounded-lg border border-line p-3">
            <div className="font-semibold" data-testid="update-version">Nova versão: {u.latestVersion}</div>
            <div className="text-xs text-muted">
              {u.publishedAt ? `Publicada em ${new Date(u.publishedAt).toLocaleDateString('pt-BR')} · ` : ''}{u.assetName} · {fmtBytes(u.size)}
            </div>
            {u.notes && (
              <pre className="selectable mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-bg p-2.5 font-sans text-xs leading-relaxed" data-testid="update-notes">{u.notes}</pre>
            )}
            {(u.status === 'downloading' || u.status === 'verifying') && (
              <div className="mt-3" data-testid="update-progress">
                <div className="mb-1 flex justify-between text-xs tabular-nums text-muted">
                  <span>{u.status === 'verifying' ? 'Verificando integridade…' : `${percent}% · ${fmtBytes(u.received)} de ${fmtBytes(u.size)}`}</span>
                  <span>{u.status === 'downloading' && u.bytesPerSecond ? `${fmtBytes(u.bytesPerSecond)}/s` : ''}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div>
              </div>
            )}
            {u.status === 'ready' && (
              <p className="mt-2 flex items-start gap-2 text-ok" data-testid="update-verified">
                <CircleCheck size={15} className="mt-0.5 shrink-0" />
                Download conferido (tamanho e SHA-256).{u.signature === 'matches' ? ' Assinatura digital confere.' : u.signature === 'unsigned-build' ? ' Esta versão ainda não tem assinatura digital.' : ''}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {['available', 'cancelled', 'download-error'].includes(u.status) && u.installType !== 'dev' && (
                <button className="btn btn-primary" data-testid="update-download" onClick={() => void api().updateDownload()}>
                  {u.status === 'available' ? <Download size={14} /> : <RotateCcw size={14} />}{u.status === 'available' ? 'Baixar atualização' : 'Tentar baixar de novo'}
                </button>
              )}
              {u.status === 'downloading' && <button className="btn" data-testid="update-cancel" onClick={() => void api().updateCancel()}><X size={14} />Cancelar</button>}
              {u.status === 'ready' && <button className="btn btn-primary" data-testid="update-install" onClick={() => void api().updateInstall()}>{installLabel}</button>}
              {u.status === 'installing' && <span className="flex items-center gap-2 text-muted"><Loader2 size={14} className="animate-spin" />Instalando…</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Documents() {
  const [open, setOpen] = useState<{ title: string; text: string } | null>(null)
  const show = async (id: DocId, title: string) => {
    try {
      setOpen({ title, text: await api().readDoc(id) })
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  return (
    <section className="card p-4">
      <h2 className="label mb-3">Documentos e suporte</h2>
      <div className="flex flex-wrap gap-2">
        {DOCS.map(([id, title]) => (
          <button key={id} className="btn" data-testid={`doc-${id}`} onClick={() => void show(id, title)}><FileText size={13} />{title}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {LINK_LABELS.map(([id, label]) => (
          <button key={id} className="btn btn-ghost" onClick={() => void api().openLink(id)}><ExternalLink size={13} />{label}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Os documentos acompanham o app (alguns só em inglês). Os links abrem no seu navegador. As Issues são públicas: não envie dados pessoais nem imagens privadas.</p>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={open.title} className="card fade-up flex max-h-full w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center border-b border-line px-4 py-3">
              <h3 className="font-semibold">{open.title}</h3>
              <button className="btn btn-ghost btn-icon ml-auto" data-testid="doc-close" aria-label="Fechar" onClick={() => setOpen(null)}><X size={15} /></button>
            </div>
            <pre className="selectable overflow-auto whitespace-pre-wrap p-4 font-sans text-[13px] leading-relaxed" data-testid="doc-text">{open.text}</pre>
          </div>
        </div>
      )}
    </section>
  )
}

export function About() {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-lg font-semibold">Sobre</h1>
        <Updates />
        <Documents />
        <p className="pb-2 text-center text-xs text-muted">Projeto independente, sem vínculo com o rembg, com os autores dos modelos ou com a BRIA.</p>
      </div>
    </div>
  )
}
