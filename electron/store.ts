// Persistencia local em JSON (configuracoes, historico e estatisticas).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { DEFAULT_OPTIONS, DEFAULT_SETTINGS, type ProcessOptions, type Settings } from '../shared/types'

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    // arquivo danificado: guarda para inspecao em vez de sobrescrever em silencio
    try {
      renameSync(path, `${path}.corrompido-${Date.now()}`)
    } catch {}
    return fallback
  }
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
const int = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
export const isModelName = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_-]{1,64}$/i.test(v)

export function sanitizeOptions(o: any): ProcessOptions {
  const d = DEFAULT_OPTIONS
  return {
    alphaMatting: bool(o?.alphaMatting, d.alphaMatting),
    fgThreshold: int(o?.fgThreshold, 0, 255, d.fgThreshold),
    bgThreshold: int(o?.bgThreshold, 0, 255, d.bgThreshold),
    erodeSize: int(o?.erodeSize, 0, 60, d.erodeSize),
    postProcessMask: bool(o?.postProcessMask, d.postProcessMask),
    decontaminate: bool(o?.decontaminate, d.decontaminate),
    onlyMask: bool(o?.onlyMask, d.onlyMask),
    vitmatte: bool(o?.vitmatte, d.vitmatte),
    vitmatteModel: oneOf(o?.vitmatteModel, ['small-distinctions-646', 'base-distinctions-646'] as const, d.vitmatteModel),
  }
}

export function sanitizeSettings(s: any): Settings {
  const d = DEFAULT_SETTINGS
  const path = (v: unknown) => (typeof v === 'string' && v && isAbsolute(v) ? v : null)
  return {
    defaultModel: isModelName(s?.defaultModel) ? s.defaultModel : d.defaultModel,
    outputDir: path(s?.outputDir),
    autoProcess: bool(s?.autoProcess, d.autoProcess),
    autoSave: bool(s?.autoSave, d.autoSave),
    namePattern: typeof s?.namePattern === 'string' ? s.namePattern.slice(0, 120) : d.namePattern,
    device: oneOf(s?.device, ['auto', 'cpu'] as const, d.device),
    options: sanitizeOptions(s?.options),
    previewBg: oneOf(s?.previewBg, ['checker', 'black', 'white', 'gray'] as const, d.previewBg),
    previewMode: oneOf(s?.previewMode, ['compare', 'result', 'original'] as const, d.previewMode),
    theme: oneOf(s?.theme, ['dark', 'light', 'system'] as const, d.theme),
    pythonPath: path(s?.pythonPath),
    briaAck: bool(s?.briaAck, d.briaAck),
  }
}
