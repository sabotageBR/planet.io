# Temas por horário (decisão de 2026-08-26)

Três temas aprovados, todos da linha Cartoon (mockups/v2): o layout muda com a hora local do jogador.

| tema | id | mockup | horário local | estrutura |
|---|---|---|---|---|
| Cartoon Amanhecer | `dawn` | `theme.toon-dawn.js` | 05:00–15:59 | gaveta lateral (desktop) / folhas (retrato); placar em cima, pódio embaixo |
| Cartoon Crepúsculo | `sunset` | `theme.toon-sunset.js` | 16:00–19:59 | idem Amanhecer, paleta quente |
| Cartoon Anoitecer | `dusk` | `theme.toon-dusk.js` | 20:00–04:59 | folhas de baixo (Cósmico); pódio em cima, placar embaixo |

- Preferência `theme: 'auto' | 'dawn' | 'sunset' | 'dusk'` (padrão `auto`). Em `auto` o cliente reavalia a cada minuto e na
  volta do foco; a troca aplica tokens CSS + classe `data-theme` no `<html>` e invalida o cache de texturas do Pixi.
- Cada tema em `client/src/theme/<id>/`: `index.js` (tokens, textures, effects, layout), `tokens.css`, `hud.css`, `screens.css`.
- Sem sol em nenhum deles (pedido explícito).
