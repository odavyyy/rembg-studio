// Gera os botoes de download (SVG) e o bloco de botoes no topo dos READMEs.
// A cada versao nova, atualize VERSAO e os tamanhos (como o GitHub os mostra) e rode:
//   node scripts/botoes.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const VERSAO = '1.1.0'
const TAMANHOS = { instalador: '116 MB', portatil: '106 MB', zip: '147 MB' }

const BASE = `https://github.com/odavyyy/rembg-studio/releases/download/v${VERSAO}`
const ARQUIVOS = {
  instalador: `RembgStudio-Setup-${VERSAO}.exe`,
  portatil: `RembgStudio-${VERSAO}-portatil.exe`,
  zip: `RembgStudio-${VERSAO}-win-x64.zip`,
}
const FONTE = 'Segoe UI, -apple-system, Helvetica, Arial, sans-serif'

// cores da identidade do app (roxo #7c6cff sobre fundo escuro)
function botao({ titulo, subtitulo, principal }) {
  const fundo = principal
    ? `  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5645d6"/><stop offset="1" stop-color="#7c6cff"/></linearGradient></defs>
  <rect x="1" y="1" width="328" height="64" rx="14" fill="url(#g)"/>`
    : `  <rect x="1" y="1" width="328" height="64" rx="14" fill="#181b21" stroke="#7c6cff" stroke-width="2"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="66" viewBox="0 0 330 66" role="img" aria-label="${titulo}">
${fundo}
  <g transform="translate(26 20)" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M6 11l6 6 6-6"/><path d="M4 22h16"/></g>
  <text x="68" y="30" font-family="${FONTE}" font-size="19" font-weight="700" fill="#ffffff">${titulo}</text>
  <text x="68" y="50" font-family="${FONTE}" font-size="13" fill="${principal ? '#ece9ff' : '#b9bdc9'}">${subtitulo}</text>
</svg>
`
}

const IDIOMAS = [
  {
    readme: 'README.md',
    principal: { arquivo: 'baixar-principal.svg', titulo: 'Baixar para Windows', subtitulo: `Instalador .exe · v${VERSAO} · ${TAMANHOS.instalador}`, alt: `Baixar o instalador (v${VERSAO})` },
    secundario: { arquivo: 'baixar-secundario.svg', titulo: 'Baixar versão portátil', subtitulo: `Sem instalação · v${VERSAO} · ${TAMANHOS.portatil}`, alt: `Baixar a versão portátil (v${VERSAO})` },
    linha: `Windows 64 bits · precisa do <a href="#instalação">rembg instalado</a> · sem assinatura digital · estes dois .exe ainda não foram testados (<a href="${BASE}/${ARQUIVOS.zip}">o .zip, ${TAMANHOS.zip}, foi</a>) · <a href="../../releases/latest">todas as versões</a>`,
  },
  {
    readme: 'README.en.md',
    principal: { arquivo: 'download-main.svg', titulo: 'Download for Windows', subtitulo: `.exe installer · v${VERSAO} · ${TAMANHOS.instalador}`, alt: `Download the installer (v${VERSAO})` },
    secundario: { arquivo: 'download-portable.svg', titulo: 'Download portable', subtitulo: `No installation · v${VERSAO} · ${TAMANHOS.portatil}`, alt: `Download the portable version (v${VERSAO})` },
    linha: `Windows 64-bit · requires <a href="#install">rembg installed</a> · not code-signed · these two .exe files have not been tested (<a href="${BASE}/${ARQUIVOS.zip}">the .zip, ${TAMANHOS.zip}, has</a>) · <a href="../../releases/latest">all versions</a>`,
  },
]

mkdirSync('docs/botoes', { recursive: true })

// botoes de troca de idioma
for (const [arquivo, texto] of [['idioma-english.svg', 'Read in English'], ['idioma-portugues.svg', 'Ler em Português']]) {
  writeFileSync(
    `docs/botoes/${arquivo}`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="40" viewBox="0 0 190 40" role="img" aria-label="${texto}">
  <rect x="1" y="1" width="188" height="38" rx="10" fill="#181b21" stroke="#7c6cff" stroke-width="2"/>
  <g transform="translate(15 10)" fill="none" stroke="#ffffff" stroke-width="1.6"><circle cx="10" cy="10" r="9"/><ellipse cx="10" cy="10" rx="4" ry="9"/><path d="M1 10h18"/></g>
  <text x="108" y="25" text-anchor="middle" font-family="${FONTE}" font-size="14" font-weight="700" fill="#ffffff">${texto}</text>
</svg>
`,
  )
}
for (const i of IDIOMAS) {
  writeFileSync(`docs/botoes/${i.principal.arquivo}`, botao({ ...i.principal, principal: true }))
  writeFileSync(`docs/botoes/${i.secundario.arquivo}`, botao({ ...i.secundario, principal: false }))
  const bloco = `<!-- botoes:inicio (gerado por scripts/botoes.mjs) -->
<p align="center">
  <a href="${BASE}/${ARQUIVOS.instalador}"><img src="docs/botoes/${i.principal.arquivo}" alt="${i.principal.alt}" width="330"></a>
  &nbsp;&nbsp;
  <a href="${BASE}/${ARQUIVOS.portatil}"><img src="docs/botoes/${i.secundario.arquivo}" alt="${i.secundario.alt}" width="330"></a>
</p>

<p align="center">
  ${i.linha}
</p>
<!-- botoes:fim -->`
  const texto = readFileSync(i.readme, 'utf8').replace(/\r\n/g, '\n')
  const marca = /<!-- botoes:inicio[\s\S]*?<!-- botoes:fim -->/
  if (!marca.test(texto)) throw new Error(`${i.readme} não tem os marcadores dos botões`)
  writeFileSync(i.readme, texto.replace(marca, () => bloco))
}
console.log(`botões da v${VERSAO} gerados`)
