# delulu · cartas na mesa — revista 3D

## Trocar pela revista final
Substitua o arquivo `revista.pdf` por o seu PDF, com **o mesmo nome** (`revista.pdf`).
O site lê o número de páginas e a proporção sozinho. O que está aqui agora é um PDF de teste com 18 páginas.

Outros arquivos que dá pra trocar:
- `assets/tampa-caixa.jpg` — a capa sem a chave, usada na tampa da caixa;
- `assets/cartas/*.png` — as 6 cartas que flutuam na mesa.

## Testar no computador
O PDF não abre se você der dois cliques no `index.html` (o navegador bloqueia). Rode um servidor na pasta:

    python -m http.server 8000

e abra http://localhost:8000

## Publicar no GitHub Pages
1. Crie um repositório público no GitHub (ex.: `delulu-revista`).
2. Clique em **Add file → Upload files** e arraste **todo o conteúdo desta pasta** (index.html, app.js, style.css, revista.pdf e a pasta assets). Clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em *Branch*, escolha `main` e a pasta `/ (root)`. Salve.
4. Espere 1–2 minutos. O link aparece no topo da página: `https://SEU-USUARIO.github.io/delulu-revista/`.

Para atualizar: suba o novo `revista.pdf` com o mesmo nome no repositório.

## Publicar na Netlify (mais rápido)
1. Entre em https://app.netlify.com/drop
2. Arraste **a pasta inteira** para a página.
3. Pronto: ela gera um link na hora. Em *Site settings → Change site name* você troca o endereço.

## Como usar
- Toque na chave (ou na caixa) para abrir. O botão "pular" vai direto para a revista.
- Virar página: clicar perto de um canto, arrastar o canto, setas do teclado, ou os botões ‹ ›.
- Zoom: roda do mouse ou pinça no celular. Girar a câmera: botão direito do mouse.
