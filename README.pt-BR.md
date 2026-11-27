<p align="center">
  <img src="docs/banner.png" alt="Rembg Studio: remoção de fundo no seu próprio PC" width="100%">
</p>

# Rembg Studio

Aplicativo para Windows que remove o fundo de imagens com o [rembg](https://github.com/danielgatis/rembg), com
aceleração por GPU e processamento em lote. As imagens são processadas no seu computador e não são enviadas para
lugar nenhum.

[English](README.md) · **Português (Brasil)**

[Privacidade](PRIVACY.md) · [Condições de uso](TERMS.md) · [Licenças dos modelos](MODEL_LICENSES.md) · [Política de assinatura de código](CODE_SIGNING_POLICY.md)

> **O rembg não vem junto.** Você instala uma vez, e o app o encontra e usa.

## Funcionalidades

- Arrastar arquivos ou uma pasta (só o primeiro nível), ou usar o seletor. PNG, JPEG, WebP, BMP e TIFF.
- Comparação antes/depois, zoom, arraste, ajuste à tela e fundos de prévia que não alteram o arquivo.
- Lote com miniaturas, status, tempo e resultado. Uma imagem e um modelo por vez.
- Cancelar, tentar de novo e reprocessar com outro modelo.
- Opções avançadas: alpha matting, ViTMatte, limpeza da máscara, remoção de halo e exportar só a máscara.
- Exportação em PNG transparente, mantendo o perfil de cor (ICC) de imagens RGB.
- Pasta de saída, padrão de nomes, renomear e salvar automaticamente. Nada é substituído sem perguntar.
- Histórico local (miniaturas e caminhos, sem cópias das imagens) e diagnóstico com teste real da GPU.

![Comparação antes e depois](docs/screenshots/workspace.png)

## Requisitos

- Windows 64 bits. **Testado só no Windows 11 Pro (build 26300).**
- rembg num ambiente do [uv](https://docs.astral.sh/uv/). O rembg 2.0.88 exige Python 3.11 ou mais novo; o
  testado usa 3.12.
- Para GPU: placa NVIDIA com driver recente. **Testado só numa RTX 5060 Ti de 16 GB, driver 621.x.**

## Instalação

```powershell
winget install astral-sh.uv
```

Com GPU NVIDIA (baixa mais de 1 GB de bibliotecas CUDA; são as versões testadas):

```powershell
uv tool install "rembg[gpu,cli]==2.0.88" --python 3.12 --with "onnxruntime-gpu[cuda,cudnn]==1.32.0"
```

Só CPU (essa variante do pacote não foi testada com o app):

```powershell
uv tool install "rembg[cpu,cli]==2.0.88" --python 3.12
```

Depois baixe na página de [Releases](../../releases) o instalador `RembgStudio-Setup-1.1.0.exe` (**ainda não
testado**), o `RembgStudio-1.1.0-portatil.exe` ou o `RembgStudio-1.1.0-win-x64.zip`. Os executáveis não são
assinados, então o SmartScreen pode avisar. Confira o arquivo com o `SHA256SUMS.txt`.

Se o rembg estiver em outro lugar, use **Configurações → Diagnóstico → Escolher python.exe…**. Escolha apenas um
Python em que você confia, porque o app vai executá-lo.

## GPU e CPU

No Windows, o ONNX Runtime não encontra sozinho as DLLs do CUDA instaladas pelo pip. O app adiciona essas pastas
ao `PATH` **somente do processo dele**, sem alterar seu ambiente Python. Use **Testar GPU de verdade** para ver
onde o modelo realmente rodou. Sem GPU, o app avisa e usa a CPU, mais lenta. Modelos pesados ficam muito mais
lentos quando a memória da placa está ocupada.

## Modelos

Com os extras `gpu,cli`, o app lista **16 modelos locais**; o padrão é o `isnet-general-use`. **Nos testes só
rodaram `isnet-general-use`, `birefnet-general-lite` e `bria-rmbg`.** As barras de velocidade e qualidade são
notas aproximadas. Modelos que faltam são baixados no primeiro uso, pela aba **Modelos** (esse botão não foi
testado) ou pelo terminal:

```powershell
rembg d isnet-anime
```

### Licenças dos modelos

**Nenhum modelo está incluído no projeto.** Cada um tem licença própria. ⚠️ O **`bria-rmbg` (RMBG 2.0) é somente
para uso não comercial** (CC BY-NC 4.0 na página do modelo); **uso comercial exige um contrato com a BRIA**.
Para vários outros modelos, a licença dos pesos **não é declarada** na origem, o que **não** quer dizer uso livre.
Veja a [tabela completa](README.md#model-licenses-read-before-using-results-commercially). Isto não é
aconselhamento jurídico.

## Limitações

- O **alpha matting** usa muita RAM (cerca de 4 GB a mais numa foto de 12 MP no PC de teste). O app recusa imagens
  **acima de 25 MP**, ou menos se houver pouca RAM livre.
- Imagens acima de 250 MP são recusadas. Só o primeiro quadro é processado e 16 bits vira 8 bits.
- O PNG não mantém EXIF. O perfil ICC só é mantido quando a origem é RGB.
- **Resultados não salvos são perdidos ao fechar o app:** o cache temporário é apagado na próxima abertura.
- Cancelar reinicia o processo do rembg.
- A interface existe apenas em português.

## Atualizações

Em **Sobre → Verificar atualizações**. Nada é verificado sozinho. O app considera só a versão estável publicada
mais recente, confere tamanho e SHA-256 e pede confirmação. No portátil, a nova versão é colocada **ao lado** da
atual (que não é apagada) e aberta; com o instalador, ele é aberto; no ZIP, o arquivo é salvo para você extrair.
Só o app é atualizado: Python, rembg, CUDA, drivers, modelos, configurações e histórico não são tocados. A soma
SHA-256 vem da própria release: detecta arquivo corrompido, mas não prova autoria. A versão 1.0.0 não tem
atualizador. Para remover o app instalado, use **Configurações do Windows → Aplicativos**; portátil e ZIP, basta
apagar os arquivos. Os dados ficam em `%APPDATA%\Rembg Studio` até você apagar a pasta.

## Privacidade

As imagens são processadas no seu computador. O mantenedor não recebe dados. A rede só é usada quando você pede:
verificar ou baixar atualização, e o rembg baixar um modelo escolhido. Histórico, **caminhos** e **miniaturas** ficam
sem criptografia em `%APPDATA%\Rembg Studio`. Detalhes, medições e limites na [Política de Privacidade](PRIVACY.md).

## Assinatura de código

As versões **não são assinadas** e nenhum pedido foi aprovado. Veja a [política](CODE_SIGNING_POLICY.md).

## Testes

No app empacotado, com rembg e GPU reais: 33 verificações do app e 39 do atualizador. Neste, a troca de versão do
portátil foi real (com a confirmação simulada); o servidor, as falhas e as demais janelas foram simulados. **Não
foram testados:** o instalador (inclusive a atualização de uma cópia instalada), o download de uma release
publicada de verdade, assinatura com versão assinada, o workflow do GitHub, o ViTMatte, o download de modelo pelo
app, os outros 13 modelos e outros computadores. A lista completa está no
[README em inglês](README.md#status-and-testing).

## Como compilar, licença e créditos

Veja [Build from source](README.md#build-from-source). O projeto foi desenvolvido com ajuda substancial de IA:
a maior parte do código, da documentação e da arte foi escrita pelo [Claude](https://www.anthropic.com/claude)
(Anthropic), a partir dos requisitos do mantenedor.

Código sob a [Licença MIT](LICENSE), © 2026 odavyyy. Veja os [avisos de terceiros](THIRD_PARTY_NOTICES.md).
Projeto independente, sem vínculo com o autor do rembg ou dos modelos.
