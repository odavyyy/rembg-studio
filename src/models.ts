// Textos explicativos dos modelos. A LISTA do que aparece vem da instalacao real
// (worker.py consulta o rembg); aqui ficam so as descricoes.
// Velocidade e qualidade sao classificacoes aproximadas; o tempo medido no PC
// aparece separado, a partir dos seus processamentos.

export type Category = 'geral' | 'pessoas' | 'objetos' | 'animais' | 'anime' | 'roupas'

export interface ModelMeta {
  label: string
  use: string
  speed: 1 | 2 | 3 | 4 | 5
  quality: 1 | 2 | 3 | 4 | 5
  categories: Category[]
  heavy?: boolean
  note?: string
}

export const MODEL_META: Record<string, ModelMeta> = {
  'isnet-general-use': { label: 'ISNet Geral', use: 'Dia a dia: rápido e bom para a maioria das fotos.', speed: 5, quality: 3, categories: ['geral', 'objetos', 'pessoas', 'animais'] },
  u2net: { label: 'U²-Net', use: 'Modelo geral clássico.', speed: 4, quality: 3, categories: ['geral', 'objetos'] },
  u2netp: { label: 'U²-Net Leve', use: 'Versão minúscula, para prévias ou PC sem placa de vídeo.', speed: 5, quality: 2, categories: ['geral'] },
  silueta: { label: 'Silueta', use: 'U²-Net compactado: leve e razoável.', speed: 5, quality: 2, categories: ['geral'] },
  u2net_human_seg: { label: 'U²-Net Pessoas', use: 'Silhuetas de pessoas.', speed: 4, quality: 3, categories: ['pessoas'] },
  u2net_cloth_seg: { label: 'Roupas', use: 'Separa peças de roupa em fotos de pessoas.', speed: 4, quality: 3, categories: ['roupas'], note: 'O resultado tem três recortes empilhados: parte de cima, parte de baixo e peça inteira.' },
  'isnet-anime': { label: 'ISNet Anime', use: 'Personagens de anime e desenhos.', speed: 4, quality: 4, categories: ['anime'] },
  'birefnet-general-lite': { label: 'BiRefNet Lite', use: 'Bordas melhores que os leves, mais pesado.', speed: 2, quality: 4, categories: ['geral', 'objetos', 'pessoas', 'animais'], heavy: true },
  'birefnet-general': { label: 'BiRefNet Geral', use: 'Alta qualidade para uso geral.', speed: 1, quality: 5, categories: ['geral', 'objetos', 'pessoas', 'animais'], heavy: true },
  'birefnet-general-fp16': { label: 'BiRefNet FP16', use: 'BiRefNet Geral convertido para meia precisão.', speed: 2, quality: 5, categories: ['geral'], heavy: true },
  'birefnet-portrait': { label: 'BiRefNet Retrato', use: 'Retratos e cabelo.', speed: 1, quality: 5, categories: ['pessoas'], heavy: true },
  'birefnet-dis': { label: 'BiRefNet DIS', use: 'Objetos com detalhes finos (segmentação dicotômica).', speed: 1, quality: 4, categories: ['objetos'], heavy: true },
  'birefnet-hrsod': { label: 'BiRefNet HRSOD', use: 'Objeto em destaque em fotos de alta resolução.', speed: 1, quality: 4, categories: ['geral', 'objetos'], heavy: true },
  'birefnet-cod': { label: 'BiRefNet Camuflados', use: 'Objetos ou animais que se confundem com o fundo.', speed: 1, quality: 4, categories: ['animais', 'objetos'], heavy: true },
  'birefnet-massive': { label: 'BiRefNet Massive', use: 'Treinado com um conjunto grande e variado.', speed: 1, quality: 5, categories: ['geral'], heavy: true },
  'birefnet-dynamic': { label: 'BiRefNet Dynamic', use: 'Variante de uso geral para tamanhos variados.', speed: 1, quality: 5, categories: ['geral'], heavy: true },
  'bria-rmbg': { label: 'BRIA RMBG 2.0', use: 'Alta qualidade para fotos de produtos e pessoas.', speed: 1, quality: 5, categories: ['geral', 'objetos', 'pessoas'], heavy: true, note: 'Somente uso não comercial. Uso comercial exige um contrato com a BRIA.' },
}

export const modelMeta = (name: string): ModelMeta =>
  MODEL_META[name] ?? { label: name, use: 'Modelo disponível na sua instalação do rembg.', speed: 3, quality: 3, categories: ['geral'] }

/** Usada ate o diagnostico responder: so os que sabidamente estao baixados nao sao presumidos. */
export const FALLBACK_MODELS = ['isnet-general-use']
