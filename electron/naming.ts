// Nomes de arquivo de saida.
import { existsSync } from 'node:fs'
import { join, parse, resolve } from 'node:path'

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

export function sanitizeName(name: string): string {
  let n = name
    .replace(/\.png$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 180)
  if (!n) n = 'imagem_sem_fundo'
  if (RESERVED.test(n)) n = `_${n}`
  return n
}

export function buildName(pattern: string, original: string, model: string, index: number, now = new Date()): string {
  const pad = (v: number) => String(v).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const base = parse(original).name
  const filled = (pattern || '{nome}_sem_fundo').replace(/\{(nome|modelo|data|n)\}/g, (_, k) =>
    k === 'nome' ? base : k === 'modelo' ? model : k === 'data' ? date : String(index),
  )
  return sanitizeName(filled)
}

export const pathKey = (p: string) => resolve(p).toLowerCase()

/** Caminho livre: acrescenta (2), (3)... enquanto existir ou estiver reservado. */
export function uniquePath(dir: string, base: string, taken: Set<string> = new Set()): string {
  let candidate = join(dir, `${base}.png`)
  for (let i = 2; existsSync(candidate) || taken.has(pathKey(candidate)); i++) {
    candidate = join(dir, `${base} (${i}).png`)
  }
  return candidate
}
