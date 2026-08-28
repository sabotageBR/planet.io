# Temas por horário (decisão de 2026-08-26)

Três temas aprovados, todos da linha Cartoon (mockups/v2): o layout muda com a hora local do jogador.

| tema | id | mockup | horário local | estrutura |
|---|---|---|---|---|
| Cartoon Amanhecer | `dawn` | `theme.toon-dawn.js` | 05:00–15:59 | gaveta lateral (desktop) / folhas (retrato); placar em cima, pódio embaixo |
| Cartoon Crepúsculo | `sunset` | `theme.toon-sunset.js` | 16:00–19:59 | idem Amanhecer, paleta quente |
| Cartoon Anoitecer | `dusk` | `theme.toon-dusk.js` | 20:00–04:59 | folhas de baixo (Cósmico); pódio em cima, placar embaixo |

- Preferência `theme: 'auto' | 'dawn' | 'sunset' | 'dusk'` (padrão `auto`). Em `auto` o cliente reavalia a cada segundo e na
  volta do foco; a troca aplica tokens CSS + classe `data-theme` no `<html>` e invalida o cache de texturas do Pixi.
- **Dentro da partida a hora é a da rodada**: a sala de 1 h vale `ROUND.DAYS` (4) dias do relógio do espaço — um dia a cada
  15 min, ou seja 12 trocas de céu por sala (Amanhecer ~6,9 min · Crepúsculo ~2,5 min · Anoitecer ~5,6 min por dia).
- **A troca faz um crossfade SÓ do céu** (`client/src/game/renderer/layers/Background.js`, `ROUND.FADE_MS`): o tema entra na hora
  (CSS troca os tokens, o Pixi rebaka as texturas) e o fundo velho fica num sprite por cima que dissolve em FADE_MS, com as
  estrelas do parallax aparecendo junto. HUD, telas e o jogo **não** piscam — antes um overlay cobria a tela inteira, o que
  apagava tudo e voltava. Os tokens de cor do HUD/telas acompanham com uma `transition` curta (`client/src/styles/ui.css`).
- Cada tema em `client/src/theme/<id>/`: `index.js` (tokens, textures, effects, layout), `tokens.css`, `hud.css`, `screens.css`.
- Sem sol em nenhum deles (pedido explícito).
