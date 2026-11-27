import { CircleAlert, CircleCheck, FolderOpen, Loader2, RefreshCw, Zap } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { DevicePref, GpuTest, PreviewBg, PreviewMode, Theme } from '../../shared/types'
import { DEFAULT_OPTIONS } from '../../shared/types'
import { AdvancedFields, Collapsible, fmtMs, ModelSelect, Toggle } from '../components/common'
import { api, errorText, refreshEnv, saveSettings, toast, useStore } from '../state'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="label mb-3">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}
function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_minmax(260px,320px)] items-center gap-4">
      <div><div className="font-medium">{title}</div>{hint && <div className="text-xs leading-snug text-muted">{hint}</div>}</div>
      <div>{children}</div>
    </div>
  )
}
function Select<T extends string>({ value, onChange, options, testId }: { value: T; onChange: (v: T) => void; options: [T, string][]; testId?: string }) {
  return (
    <select data-testid={testId} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}
function Check({ ok, label, value }: { ok: boolean | null; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-line py-1.5 last:border-0">
      {ok === null ? <span className="w-[15px]" /> : ok ? <CircleCheck size={15} className="mt-0.5 shrink-0 text-ok" /> : <CircleAlert size={15} className="mt-0.5 shrink-0 text-warn" />}
      <span className="w-44 shrink-0 text-muted">{label}</span>
      <span className="selectable min-w-0 break-all">{value}</span>
    </div>
  )
}

function Diagnostics() {
  const env = useStore((s) => s.env)
  const gpu = useStore((s) => s.gpu)
  const worker = useStore((s) => s.worker)
  const loading = useStore((s) => s.envLoading)
  const custom = useStore((s) => s.settings.pythonPath)
  const model = useStore((s) => s.settings.defaultModel)
  const [test, setTest] = useState<GpuTest | null>(null)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const cuda = !!env?.availableProviders.includes('CUDAExecutionProvider')
  const testModel = env?.models.find((m) => m.name === model)?.downloaded ? model : 'isnet-general-use'

  const runTest = async () => {
    setTesting(true)
    setTestError(null)
    setTest(null)
    try {
      setTest(await api().gpuTest(testModel))
    } catch (e) {
      setTestError(errorText(e))
    } finally {
      setTesting(false)
    }
  }
  const choose = async () => {
    try {
      if (await api().choosePython()) await refreshEnv(true)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <Section title="Diagnóstico do rembg, Python e GPU">
      <div>
        <Check ok={worker.state === 'ready'} label="Processo do rembg" value={worker.error ?? ({ ready: 'Pronto', starting: 'Iniciando…', restarting: 'Reiniciando…', busy: 'Ocupado', error: 'Erro', stopped: 'Parado' } as const)[worker.state]} />
        <Check ok={env ? true : null} label="Python do rembg" value={env ? `${env.python} — ${env.pythonExecutable}` : (worker.pythonPath ?? '—')} />
        <Check ok={env ? !!env.rembgVersion : null} label="rembg" value={env?.rembgVersion ?? '—'} />
        <Check ok={env ? true : null} label="Caminho da instalação" value={env?.prefix ?? '—'} />
        <Check ok={env ? env.onnxruntimeGpu : null} label="ONNX Runtime" value={env ? `${env.onnxruntimeVersion}${env.onnxruntimeGpu ? ' (GPU)' : ' (só CPU)'}` : '—'} />
        <Check ok={env ? cuda : null} label="Provedor CUDA listado" value={env ? env.availableProviders.join(', ') : '—'} />
        <Check ok={env ? env.cudaDllDirs > 0 : null} label="DLLs do CUDA (pip)" value={env ? (env.cudaDllDirs > 0 ? `${env.cudaDllDirs} pasta(s) dos pacotes nvidia-* carregadas pelo app` : 'Nenhum pacote nvidia-* no ambiente; a GPU depende de um CUDA instalado no Windows. Use o teste abaixo.') : '—'} />
        <Check ok={gpu ? gpu.available : null} label="Placa de vídeo (nvidia-smi)" value={gpu?.available ? `${gpu.name} · driver ${gpu.driver} · ${gpu.memoryUsedMb} de ${gpu.memoryTotalMb} MB em uso` : (gpu?.error ?? '—')} />
        <Check ok={null} label="Pasta dos modelos" value={env?.modelsDir ?? '—'} />
      </div>
      <p className="text-xs leading-snug text-muted">A lista de provedores não garante que a GPU funciona. O teste real carrega um modelo e mostra onde ele de fato rodou.</p>
      {test && (
        <div data-testid="gpu-test-result" className={`rounded-lg border p-3 ${test.device === 'gpu' ? 'border-ok/50 text-ok' : 'border-warn/50 text-warn'}`}>
          {test.device === 'gpu' ? 'GPU confirmada' : 'Rodou na CPU'}: {test.model} em {fmtMs(test.inferMs)} (imagem 640×480). Provedores ativos: {test.providers.join(', ')}
        </div>
      )}
      {testError && <div className="selectable text-bad">{testError}</div>}
      <div className="flex flex-wrap gap-2">
        <button data-testid="gpu-test" className="btn btn-primary" disabled={testing} onClick={() => void runTest()}>{testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}Testar GPU de verdade</button>
        <button className="btn" disabled={loading} onClick={() => void refreshEnv(true)}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Verificar de novo</button>
        <button className="btn" onClick={() => void api().restartWorker()}>Reiniciar processo</button>
        <button className="btn" onClick={() => void choose()}>Escolher python.exe…</button>
        {custom && <button className="btn" onClick={() => void saveSettings({ pythonPath: null }).then(() => refreshEnv(true))}>Detectar automaticamente</button>}
        {env && <button className="btn" onClick={() => void api().openPath(env.modelsDir)}><FolderOpen size={14} />Abrir pasta dos modelos</button>}
      </div>
    </Section>
  )
}

export function SettingsPage() {
  const s = useStore((x) => x.settings)
  const version = useStore((x) => x.version)
  const [pattern, setPattern] = useState(s.namePattern)
  const [sample, setSample] = useState('')
  useEffect(() => setPattern(s.namePattern), [s.namePattern])
  useEffect(() => void api().namePreview(pattern).then(setSample), [pattern, s.defaultModel])

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-lg font-semibold">Configurações</h1>
        <Section title="Processamento">
          <Row title="Modelo padrão"><ModelSelect testId="default-model" value={s.defaultModel} onChange={(m) => void saveSettings({ defaultModel: m })} /></Row>
          <Row title="Dispositivo" hint="Automático usa a GPU quando ela funciona.">
            <Select<DevicePref> testId="device" value={s.device} onChange={(v) => void saveSettings({ device: v })} options={[['auto', 'Automático (GPU)'], ['cpu', 'Somente CPU']]} />
          </Row>
          <Toggle testId="auto-process" title="Processar automaticamente ao importar" checked={s.autoProcess} onChange={(v) => void saveSettings({ autoProcess: v })} />
        </Section>
        <Section title="Saída">
          <Row title="Pasta de saída padrão" hint="Sem pasta: o salvamento automático usa a pasta do original.">
            <div className="flex gap-2">
              <input className="field" readOnly value={s.outputDir ?? ''} placeholder="Não definida" title={s.outputDir ?? ''} />
              <button className="btn" onClick={() => void api().chooseFolder(s.outputDir).then((d) => { if (d) void saveSettings({ outputDir: d }) })}>Escolher</button>
              {s.outputDir && <button className="btn" onClick={() => void saveSettings({ outputDir: null })}>Limpar</button>}
            </div>
          </Row>
          <Toggle testId="auto-save" title="Salvar resultados automaticamente" hint="Nunca sobrescreve: se o nome já existir, acrescenta (2), (3)…" checked={s.autoSave} onChange={(v) => void saveSettings({ autoSave: v })} />
          <Row title="Padrão de nomes" hint="Use {nome}, {modelo}, {data} e {n} (posição na fila).">
            <input data-testid="name-pattern" className="field" value={pattern} onChange={(e) => setPattern(e.target.value)} onBlur={() => void saveSettings({ namePattern: pattern.trim() || '{nome}_sem_fundo' })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <div className="mt-1 text-xs text-muted">Exemplo: {sample}</div>
          </Row>
        </Section>
        <Section title="Prévia e aparência">
          <Row title="Visualização padrão"><Select<PreviewMode> value={s.previewMode} onChange={(v) => void saveSettings({ previewMode: v })} options={[['compare', 'Comparar antes/depois'], ['result', 'Resultado'], ['original', 'Original']]} /></Row>
          <Row title="Fundo da prévia"><Select<PreviewBg> value={s.previewBg} onChange={(v) => void saveSettings({ previewBg: v })} options={[['checker', 'Quadriculado'], ['black', 'Preto'], ['white', 'Branco'], ['gray', 'Cinza']]} /></Row>
          <Row title="Tema"><Select<Theme> testId="theme" value={s.theme} onChange={(v) => void saveSettings({ theme: v })} options={[['dark', 'Escuro'], ['light', 'Claro'], ['system', 'Igual ao Windows']]} /></Row>
        </Section>
        <Collapsible title="Opções avançadas padrão">
          <AdvancedFields value={s.options} onChange={(o) => void saveSettings({ options: o })} />
          <button className="btn mt-3" onClick={() => void saveSettings({ options: DEFAULT_OPTIONS })}>Restaurar padrões</button>
        </Collapsible>
        <Diagnostics />
        <p className="pb-2 text-center text-xs text-muted">Rembg Studio {version} · imagens processadas neste computador · atalhos: Ctrl+O abrir, Ctrl+Enter processar, Ctrl+S salvar</p>
      </div>
    </div>
  )
}
