// Documentos incluidos no app e os unicos links externos que ele abre.
import { REPO } from './release'

export const DOC_FILES = {
  privacy: { source: 'PRIVACY.md', packaged: 'PRIVACY.md' },
  terms: { source: 'TERMS.md', packaged: 'TERMS.md' },
  models: { source: 'MODEL_LICENSES.md', packaged: 'MODEL_LICENSES.md' },
  signing: { source: 'CODE_SIGNING_POLICY.md', packaged: 'CODE_SIGNING_POLICY.md' },
  license: { source: 'LICENSE', packaged: 'LICENSE.txt' },
  'third-party': { source: 'THIRD_PARTY_NOTICES.md', packaged: 'THIRD_PARTY_NOTICES.md' },
} as const

export const LINKS = {
  repository: `https://github.com/${REPO}`,
  releases: `https://github.com/${REPO}/releases`,
  issues: `https://github.com/${REPO}/issues`,
  'bria-license': 'https://huggingface.co/briaai/RMBG-2.0',
} as const
