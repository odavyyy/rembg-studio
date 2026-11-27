# Política de Privacidade / Privacy Policy

Rembg Studio 1.1.0 · última atualização / last updated: 2026-11-27

[Português](#português) · [English](#english)

## Português

O Rembg Studio é um programa gratuito, de código aberto, mantido por `odavyyy`. Ele não tem contas, anúncios,
análise de uso nem servidor próprio. **O mantenedor não recebe nenhum dado seu pelo aplicativo.**

### Suas imagens

A remoção de fundo roda neste computador, pelo rembg instalado por você. O código do aplicativo não envia imagens,
nomes de arquivo nem caminhos para a internet.

### Quando há acesso à internet

| Quando | Para onde | O que segue na requisição |
|---|---|---|
| Você clica em **Verificar atualizações** | `api.github.com` | Seu endereço IP, a identificação `RembgStudio/<versão>`, o **idioma do sistema** (por exemplo, `pt-BR`) e cabeçalhos técnicos padrão do Chromium, o motor do app (formatos e compressões aceitos, prioridade e tipo da requisição). Sem token, conta ou cookie. |
| Você clica em **Baixar atualização** | `github.com` e servidores `*.githubusercontent.com` | O mesmo |
| Você usa pela primeira vez um modelo que ainda não está no computador, ou clica em baixá-lo (inclui o ViTMatte) | Os endereços definidos pelo rembg (hoje, arquivos no GitHub) | O pedido do arquivo feito pelo rembg, com seu IP e a identificação da biblioteca de download |
| Você clica em um link da tela **Sobre** | O site aberto no **seu navegador** | O que o navegador enviar |

Não há verificação automática de atualização. O GitHub trata os dados dessas requisições conforme a
[declaração de privacidade dele](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
Outros sites seguem as políticas próprias.

### Componentes de terceiros

- **ONNX Runtime** (motor de IA usado pelo rembg). O arquivo `Privacy.md` que acompanha o pacote diz que as versões
  oficiais podem coletar telemetria e enviá-la à Microsoft. Na versão 1.32.0 que inspecionamos no Windows, não
  encontramos o componente de envio por HTTPS nem importação de bibliotecas de rede; há um provedor de eventos do
  Windows (ETW). O Rembg Studio pede a desativação da telemetria **no processo que ele abre**
  (`ORT_DISABLE_TELEMETRY=1` e a função de desativação da biblioteca). Não podemos garantir o comportamento de
  outras versões. O Windows pode coletar eventos conforme as suas configurações de diagnóstico, e usar o rembg
  fora deste app não é afetado por esse ajuste.
- **Windows, SmartScreen e antivírus** podem consultar a reputação de arquivos por conta própria.
- **Python, rembg e CUDA** são instalados por você e têm termos próprios.

### Verificação que fizemos

Em um único computador, numa sessão de cerca de um minuto e meio processando imagens com um modelo já baixado e
abrindo as telas, o registro de rede do Chromium não mostrou nenhuma URL, e a amostragem das conexões dos processos
do aplicativo (a cada segundo ou mais) não observou conexões externas; o Python do rembg não tentou se conectar.
Com a verificação de atualização acionada, o registro mostrou somente a consulta a `api.github.com`. Isso não
substitui uma captura completa de pacotes e não cobre todos os modelos nem todas as versões dos componentes.

### O que fica guardado no seu computador

Em `%APPDATA%\Rembg Studio`:

- configurações (inclui pastas escolhidas e, se você definir, o caminho do `python.exe`);
- histórico: nomes e **caminhos** das imagens, caminhos dos resultados salvos, modelo, data e tempo;
- **miniaturas dos resultados** do histórico, que podem mostrar pessoas ou informações das suas imagens;
- tempos médios por modelo;
- cache temporário de resultados (apagado na próxima abertura);
- pasta temporária de atualização (apagada ao abrir o app, ao verificar de novo ou após falha/cancelamento);
- arquivos internos do Electron/Chromium.

O app não cifra esses arquivos. Quem tiver acesso à sua conta do Windows pode lê-los. Os modelos ficam à parte, em
`%USERPROFILE%\.rembg\models`.

**Para apagar:** *Recentes → Limpar histórico* remove registros e miniaturas. Para remover tudo, feche o app e apague
`%APPDATA%\Rembg Studio`. Isso não apaga suas imagens nem os resultados que você salvou. Desinstalar o app não
apaga essa pasta.

### Cookies

O aplicativo não usa cookies nem tecnologias de rastreamento. Na sessão medida, nenhum cookie foi criado.

### LGPD (Lei nº 13.709/2018)

Como o mantenedor não coleta nem recebe dados pelo aplicativo, não há, até onde entendemos, tratamento feito por ele
por meio do app. O que o programa grava fica sob o seu controle. Esta é uma interpretação, não um parecer jurídico.
Se você falar com o mantenedor pelo GitHub, o conteúdo é público e tratado pela plataforma. Não publique dados
pessoais nem imagens privadas. Se você usar o app para tratar imagens de outras pessoas, avalie as suas próprias
obrigações.

### Contato

Dúvidas e pedidos: [Issues do projeto](https://github.com/odavyyy/rembg-studio/issues) (públicas).
**Pendente:** ainda não há um canal privado de contato.

### Mudanças

Alterações nesta política aparecem no histórico do repositório e acompanham as novas versões.

## English

Rembg Studio is a free, open-source program maintained by `odavyyy`. It has no accounts, ads, analytics or server of
its own. **The maintainer receives no data from you through the app.**

This program will not transfer any information to other networked systems unless specifically requested by the user
or the person installing or operating it.

Requests happen when **you** ask for them:

| When | Destination | What the request carries |
|---|---|---|
| You click **Verificar atualizações** (check for updates) | `api.github.com` | Your IP address, `RembgStudio/<version>`, your **system language** (for example `pt-BR`) and standard technical headers of Chromium, the app's engine (accepted formats and compression, request priority and type). No token, account or cookie. |
| You click download for an update | `github.com` and `*.githubusercontent.com` | The same |
| You first use a model that is not on your computer, or click to download it (including ViTMatte) | URLs defined by rembg (currently files on GitHub) | rembg's file request, with your IP and its download library's identification |
| You click a link on the About page | The site, in **your browser** | Whatever your browser sends |

There is no automatic update check. See
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

**Images** are processed on your computer by your rembg installation. The app's code does not send images, file names
or paths anywhere.

**Third-party components.** ONNX Runtime, used by rembg, ships a `Privacy.md` stating that official builds may collect
telemetry and send it to Microsoft. In the 1.32.0 Windows build we inspected we found no HTTPS uploader and no
networking library imports, only a Windows event (ETW) provider. The app asks ONNX Runtime to disable telemetry in
the process it starts. We cannot guarantee other versions; Windows may collect events according to your diagnostic
data settings, and rembg used outside this app is not affected. Windows, SmartScreen and antivirus software may do
their own reputation lookups.

**What we measured** (one computer, about 90 seconds of processing with an already downloaded model): no URL in
Chromium's network log, no external connection observed by sampling the app's processes, no connection attempt by
rembg's Python code. With the update check triggered, only the `api.github.com` request appeared. This is not a full
packet capture and does not cover every model or component version.

**Stored locally** in `%APPDATA%\Rembg Studio`, unencrypted: settings, history (image names and paths), thumbnails of
results, per-model timings, temporary results and update files, and Electron's own files. Clear the history in the
app or delete the folder. Uninstalling does not delete it. No cookies or tracking.

**Contact:** [GitHub Issues](https://github.com/odavyyy/rembg-studio/issues) (public). A private contact channel is
not available yet.
