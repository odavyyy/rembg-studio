// Regras puras de atualizacao: versoes, escolha do artefato e somas SHA-256.
export const REPO = 'odavyyy/rembg-studio'
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024

export type InstallType = 'portable' | 'installed' | 'zip' | 'dev'

export interface ReleaseAsset {
  name: string
  size: number
  url: string
  digest: string | null
}

export interface Candidate {
  version: string
  notes: string
  publishedAt: string | null
  asset: ReleaseAsset
  sums: ReleaseAsset
}

const VERSION = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/

export function parseVersion(v: string): [number, number, number] | null {
  const m = VERSION.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) throw new Error(`Versão inválida: ${!x ? a : b}`)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

/** Nomes definidos no package.json (electron-builder). Somente Windows x64. */
export function assetName(type: InstallType, version: string): string {
  if (type === 'portable') return `RembgStudio-${version}-portatil.exe`
  if (type === 'installed') return `RembgStudio-Setup-${version}.exe`
  return `RembgStudio-${version}-win-x64.zip`
}

export type Evaluation =
  | { kind: 'update'; candidate: Candidate }
  | { kind: 'current'; latest: string }

/**
 * Avalia a resposta de /releases/latest. Mesmo que o servidor ja exclua
 * rascunhos e pre-lancamentos, conferimos de novo.
 * @param downloadBase prefixo obrigatorio das URLs dos artefatos
 */
export function evaluateRelease(json: any, current: string, type: InstallType, downloadBase: string): Evaluation {
  if (!json || typeof json !== 'object') throw new Error('Resposta inválida do servidor de atualizações.')
  if (json.draft !== false || json.prerelease !== false) throw new Error('A versão encontrada é um rascunho ou pré-lançamento e foi ignorada.')
  const tag = String(json.tag_name ?? '')
  const version = tag.startsWith('v') ? tag.slice(1) : ''
  if (!parseVersion(version)) throw new Error(`A versão publicada tem uma tag não reconhecida (${tag || 'sem tag'}).`)
  // nunca oferecemos a mesma versao nem uma anterior
  if (compareVersions(version, current) <= 0) return { kind: 'current', latest: version }

  const assets: any[] = Array.isArray(json.assets) ? json.assets : []
  const pick = (name: string): ReleaseAsset => {
    const a = assets.find((x) => x?.name === name)
    if (!a) throw new Error(`A versão ${version} não tem o arquivo ${name}.`)
    const expected = `${downloadBase}/${tag}/${name}`
    if (a.browser_download_url !== expected) throw new Error(`Endereço inesperado para ${name}; a atualização foi recusada.`)
    if (a.state && a.state !== 'uploaded') throw new Error(`O arquivo ${name} ainda não terminou de ser enviado.`)
    if (!Number.isSafeInteger(a.size) || a.size <= 0 || a.size > MAX_ASSET_BYTES) throw new Error(`Tamanho inválido para ${name}.`)
    return { name, size: a.size, url: expected, digest: typeof a.digest === 'string' ? a.digest : null }
  }
  return {
    kind: 'update',
    candidate: {
      version,
      notes: String(json.body ?? '').slice(0, 20_000),
      publishedAt: typeof json.published_at === 'string' ? json.published_at : null,
      asset: pick(assetName(type, version)),
      sums: pick('SHA256SUMS.txt'),
    },
  }
}

/** Hash esperado do artefato. Sem soma publicada, a atualizacao e recusada. */
export function expectedHash(sumsText: string, asset: ReleaseAsset): string {
  const found: string[] = []
  for (const line of sumsText.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})[ \t]+\*?(.+?)\s*$/.exec(line)
    if (m && m[2] === asset.name) found.push(m[1].toLowerCase())
  }
  if (found.length !== 1) throw new Error(`SHA256SUMS.txt não tem uma soma única para ${asset.name}; a atualização foi recusada.`)
  if (asset.digest) {
    const m = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest)
    if (m && m[1].toLowerCase() !== found[0]) {
      throw new Error('A soma do SHA256SUMS.txt não bate com a informada pelo GitHub; a atualização foi recusada.')
    }
  }
  return found[0]
}

/** Confere os primeiros bytes: .exe comeca com "MZ" e .zip com "PK". */
export function looksLikeArtifact(name: string, head: Uint8Array): boolean {
  if (name.endsWith('.exe')) return head[0] === 0x4d && head[1] === 0x5a
  if (name.endsWith('.zip')) return head[0] === 0x50 && head[1] === 0x4b
  return false
}
