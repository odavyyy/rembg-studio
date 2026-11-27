# Licenças dos modelos / Model licenses

**Nenhum modelo é distribuído com o Rembg Studio.** O rembg baixa cada arquivo no seu computador. A licença MIT do
app e a do rembg **não** cobrem os pesos dos modelos. Consulta feita em 2026-11-27 nas páginas indicadas. Não é
parecer jurídico.

*No model is distributed with Rembg Studio. The MIT licenses of the app and of rembg do not cover model weights.
Checked on 2026-11-27. Not legal advice.*

| Modelo / Model | Origem / Upstream | Código / Code | Pesos / Weights | Atenção / Attention |
|---|---|---|---|---|
| `bria-rmbg` | [briaai/RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) | — | Card: CC BY-NC 4.0, uso não comercial / non-commercial. Etiqueta / tag: `bria-rmbg-2.0` | **Uso comercial exige contrato com a BRIA.** O texto da licença `bria-rmbg-2.0` fica atrás de login e não foi lido. O rembg baixa uma cópia hospedada no GitHub dele, sem passar pela tela de aceite da BRIA. |
| `birefnet-general`, `-dis`, `-hrsod`, `-cod`, `-massive` | [ZhengPeng7/BiRefNet](https://github.com/ZhengPeng7/BiRefNet) | MIT | Página principal no Hugging Face: MIT. Páginas específicas destas variantes não conferidas. | Dados de treino têm termos próprios (ex.: DIS5K, abaixo). |
| `birefnet-general-lite` | [BiRefNet_lite](https://huggingface.co/ZhengPeng7/BiRefNet_lite) | MIT | Etiqueta MIT | Card cita treino com DIS-TR. |
| `birefnet-portrait` | [BiRefNet-portrait](https://huggingface.co/ZhengPeng7/BiRefNet-portrait) | MIT | Etiqueta MIT | Licenças dos dados de treino não conferidas. |
| `birefnet-dynamic` | [BiRefNet_dynamic](https://huggingface.co/ZhengPeng7/BiRefNet_dynamic) | MIT | Etiqueta MIT | Card cita treino com DIS-TR. |
| `isnet-general-use` (**padrão / default**) | [xuebinqin/DIS](https://github.com/xuebinqin/DIS) | Apache-2.0 | **Não declarada / not stated** | A origem não diz com quais dados o arquivo "general use" foi treinado. Veja DIS5K abaixo. |
| `isnet-anime` | [SkyTNT/anime-segmentation](https://github.com/SkyTNT/anime-segmentation), [anime-seg](https://huggingface.co/skytnt/anime-seg) | Apache-2.0 | Etiqueta apache-2.0 no Hugging Face | Não confirmamos que o arquivo baixado pelo rembg é o mesmo dessa página. Licenças dos dados de treino não declaradas. |
| `u2net`, `u2netp`, `u2net_human_seg` | [xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net) | Apache-2.0 | Não declarada | |
| `u2net_cloth_seg` | [levindabhi/cloth-segmentation](https://github.com/levindabhi/cloth-segmentation) | MIT | Não declarada | |
| `silueta` | [link indicado pelo rembg](https://github.com/xuebinqin/U-2-Net/issues/295) | Não verificada | Não declarada / não verificada | |
| ViTMatte (refinamento opcional) | [hustvl/ViTMatte](https://github.com/hustvl/ViTMatte) | MIT | Não declarada | |

**"Não declarada" não significa uso livre.** Para uso comercial, confirme com os autores.
*"Not stated" does not mean free to use.*

## DIS5K

Os [termos do conjunto de dados DIS5K](https://github.com/xuebinqin/DIS/blob/main/DIS5K-Dataset-Terms-of-Use.pdf)
dizem que **o conjunto de dados** está disponível para uso não comercial, em pesquisa ou ensino, e que o uso
comercial dele exige permissão. Os termos falam do conjunto de dados; **não dizem nada sobre pesos de modelos**
treinados com ele nem sobre as imagens que você gera. Se isso afeta um modelo é uma questão jurídica em aberto.

*The DIS5K terms restrict the dataset to non-commercial research or educational use. They do not mention model
weights trained on it or outputs. Whether they affect a model is an open legal question.*
