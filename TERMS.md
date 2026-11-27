# Condições de uso e avisos / Usage notes

Rembg Studio 1.1.0 · 2026-11-27

[Português](#português) · [English](#english)

## Português

### Licença

O código do Rembg Studio é distribuído sob a [Licença MIT](LICENSE). **Este texto não acrescenta restrições à
licença MIT** nem muda o que ela permite. Ele explica como o programa funciona e o que vem de terceiros. Se houver
conflito sobre o código do app, vale a Licença MIT.

### Suas imagens e direitos de terceiros

- O app não adquire nenhum direito sobre as suas imagens nem sobre os resultados.
- Use imagens que você tem o direito de editar e publicar. Remover o fundo não muda direitos autorais nem os
  direitos de imagem de quem aparece nelas (no Brasil, veja a Lei nº 9.610/1998 e o art. 20 do Código Civil).

### O que esperar

- Os resultados dependem de modelos de IA e podem ter erros: partes removidas ou fundo sobrando. Confira antes de
  usar.
- Guarde os originais. O app foi feito para não gravar por cima deles, mas nenhum programa substitui uma cópia de
  segurança.
- Resultados não salvos são perdidos ao fechar o app, inclusive ao instalar uma atualização.
- Processar pode usar muita memória, placa de vídeo e energia. Modelos pesados e o alpha matting podem ficar lentos.
- O funcionamento depende de programas que você instala (Python, rembg, bibliotecas, drivers) e foi testado em um
  único computador.

### Modelos e componentes de terceiros

Cada modelo tem a própria licença, que não é alterada pela licença do app. O **BRIA RMBG 2.0 (`bria-rmbg`) é liberado
somente para uso não comercial**; uso comercial exige um contrato com a BRIA. Veja
[MODEL_LICENSES.md](MODEL_LICENSES.md) antes de um uso comercial com qualquer modelo.

### Downloads e atualizações

Baixe apenas das [Releases oficiais](https://github.com/odavyyy/rembg-studio/releases). As versões ainda **não têm
assinatura digital**. O atualizador confere tamanho e SHA-256 publicados na própria release; isso detecta arquivo
incompleto ou corrompido, mas **não prova a autoria** caso a conta ou o repositório sejam comprometidos.

### Garantia e responsabilidade

O software é fornecido sem garantia, nos termos da Licença MIT. Nada aqui exclui direitos ou responsabilidades que
a lei não permita excluir.

### Gratuidade

O projeto não vende nada, não tem assinaturas, pagamentos, anúncios nem coleta de dados para monetização. Por isso
não há política de reembolso ou cancelamento.

### Nomes e marcas

Projeto independente, **sem vínculo, patrocínio ou endosso** do rembg, dos autores dos modelos, da BRIA, da NVIDIA,
da Microsoft, do GitHub ou da SignPath. Nomes de produtos pertencem aos seus donos e aparecem apenas para
identificação. "Rembg" no nome indica que o app é uma interface para a biblioteca rembg.

### Suporte

[Issues do projeto](https://github.com/odavyyy/rembg-studio/issues), sem prazo de resposta garantido.

## English

The app's code is under the [MIT License](LICENSE). **These notes add no restrictions to it.** The app claims no
rights over your images or results; use only images you have the right to edit and publish. AI results can be wrong,
so keep your originals and check outputs. Unsaved results are lost when the app closes, including for an update.
Processing may use a lot of memory and GPU, and depends on software you install; it was tested on one computer.
Each model has its own license (see [MODEL_LICENSES.md](MODEL_LICENSES.md)); `bria-rmbg` is for non-commercial use
only unless you have an agreement with BRIA. Download only from the official releases. Builds are not code-signed
yet: the updater's SHA-256 check detects damaged files but does not prove authorship. The software comes without
warranty as stated in the MIT License; nothing here excludes rights or liabilities that cannot be excluded by law.
It is free of charge, with no sales, subscriptions or ads. This is an independent project, not affiliated with or
endorsed by rembg, the model authors, BRIA, NVIDIA, Microsoft, GitHub or SignPath.
