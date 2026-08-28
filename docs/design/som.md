# Som

Tudo é **sintetizado no WebAudio** (`client/src/audio/`): nenhum arquivo de áudio, nenhuma licença, nada para
baixar. Cada efeito é uma receita de vozes — oscilador (`tom`) ou ruído filtrado (`ruido`) — com envelope e glide
de frequência, no mesmo espírito das texturas, que também são desenhadas e não são imagens. Afinar um som é mexer
nos números de `KIT`, em `client/src/audio/kit.js`.

## Os três princípios

1. **Ataque + corpo + cauda.** Um transiente curto que dá o "toque", um tom que dá o corpo e uma cauda que dá o
   tamanho. Som de uma voz só soa fino, e era isso que faltava: a média subiu de ~1,5 para 2,4 vozes por receita.
2. **A altura codifica o TAMANHO.** Tudo que é meu sai afinado por `pitch = 1/(1+massK·1,1)` — 1,0 no
   recém-nascido, ~0,48 no gigante. É o maior ganho de sensação por linha de código do pacote: dá para ouvir o
   quanto você cresceu.
3. **Progressão.** Comer em sequência sobe uma escala pentatônica (`ESCADA`) e reseta depois de 900 ms parado.

## Arquitetura

- **Contexto único**, criado no primeiro gesto do jogador (política de autoplay dos navegadores): o clique em
  JOGAR já serve. Uma instância só para o jogo e para as telas React (`getAudio()` / `sfx()`).
- **Três barramentos** antes do master: `sfx` (efeitos de partida), `amb` (contínuos) e `ui` (telas). Cada um é um
  `GainNode`, e é o que permite o alerta *duckar* os efeitos. Cadeia: vozes → barramento → `master` (volume) →
  `DynamicsCompressor` (evita estouro quando várias explosões coincidem) → saída.
- **Prioridade de vozes** (`PRIO`): no teto de `VOICES` (24) o som novo **rouba** a voz de menor prioridade em vez
  de ser descartado. Antes o `play()` simplesmente desistia — então o alerta de míssil e a própria morte sumiam
  exatamente na hora em que a tela estava mais cheia, que é quando eles mais importam.
- **Espaço**: eventos com posição de mundo têm volume por distância da câmera (some além de `FAR` = 2600 px) e um
  pouco de estéreo (`PAN`). O que é meu toca em volume cheio, no centro.
- **Tamanho importa**: o `r` do evento sobe o ganho até 1,6× — a explosão de um planetão soa maior que a de um grão.
- **Cortes**: um intervalo mínimo por tipo (`GAP`) — sem isso, comer 20 grãos numa passada vira metralhadora. Com
  o ímã ligado, o `GAP` de 45 ms do `food` é o que segura.
- **Sincronia com o vídeo**: o som usa o mesmo atraso do efeito visual. O que acontece com terceiros espera o
  atraso de interpolação (−100 ms) para casar com o que se vê; o que é meu toca na hora.

## Contínuos

O motor só sabia tocar one-shots: `play()` agendava início **e** fim na hora e não devolvia nada, então não havia
como manter um som e mexer nele — um bipe que acelera conforme o míssil chega não era expressável. Agora
`startLoop(nome,o)` / `setLoop(nome,o)` / `stopLoop(nome)` mantêm um punhado de nós de pé no barramento `amb`,
fora do teto de vozes.

| Loop | O que é | O que o `set()` controla |
|---|---|---|
| `alert` | **míssil teleguiado vindo em mim**: bipe de dois tons cortado por um LFO quadrado | `k` (0..1) = cadência (2→13 Hz), altura e volume; `pan` = de que lado ele vem. Enquanto toca, os efeitos ficam a `DUCK` |
| `magnet` | brilho contínuo enquanto o ímã está ativo (o efeito visual já existia; o som não) | `k` = volume |
| `aimCharge` | zumbido da mira carregada; sobe quando há alvo travado | `k` = altura e filtro |
| `ambience` | a cama de fundo, em três camadas | `mass`, `danger`, `urgency` |

**Ambiência** (`setLoop("ambience",{mass,danger,urgency})`, reajustada 5×/s):

- **pad** — a fundamental DESCE conforme você vira um gigante (55 Hz → 27,5 Hz). Segue a preferência **Música**.
- **danger** — um batimento dissonante de 4 Hz que sobe ao entrar no halo da estrela mais próxima.
- **round** — pulso lento que acelera no último minuto e trava no `countdown` nos segundos finais.

`danger` e `round` seguem a preferência nova **Ambiência** (ligada por padrão): são pistas de *informação*, não de
gosto musical — dizem que tem uma estrela do lado e que a rodada está acabando. A **Música** (o pad) continua vindo
desligada, porque essa é escolha de gosto.

## Mapeamento

### Eventos do fio (`EVENT.*`) — o mesmo `kind` do efeito visual vira o som

`eat` `pop` `merge` `split` `suck` `death` `chip` `bounce` `boom` `exit` `shoot` `shieldBreak` `clash` `deflect`
`shieldHit` `shieldUp` `starBurst` `supernova` `starHit` `starSplit` `smash` — a chave da receita é a mesma do
`FX_OF` em `client/src/game/index.js`, então **evento novo com efeito já sai com áudio**.

Dois carregam significado novo: `starBurst` ganhou uma camada de **chamuscado** (ruído varrendo para baixo) — é o
som dos `STAR.BURN` 30% de massa queimando ao encostar na estrela; e `shieldUp` sobe de altura com o **nível** do
escudo.

> Eventos sobre **mim** sempre chegam, mesmo fora da AOI (`Room.flushEvents`).

### O que o cliente descobre sozinho (som de ESTADO, em `somDoSelf`)

| Som | De onde |
|---|---|
| `food` | comida/pellet sumindo encostado numa peça minha (`onVanish`) — só o que **eu** comi, e a fila sobe a escada |
| `ammo` / `fire` | `self.missiles` subiu / caiu |
| `powerup` | `self.magnetT` passou de 0 (e liga o loop `magnet`) |
| `ready` | `self.fireCd` chegou a 0 com munição: a carência de spawn acabou |
| `grow` | cruzei um marco de massa (a cada fator `MASS_STEP` = 1,6) |
| `hurt` | minha massa caiu mais de 12% de uma vez: queimadura de estrela, míssil, lasca |
| `respawn` / `deadScreen` | voltei a viver / a tela de KABOOM (o `death` é o do mundo, lá atrás) |
| `alert` | `self.threat` > 0 — o loop, com `k` e `pan` do míssil que vem |
| `join` / `countdown` / `bigCrunch` / `podium` | entrei na sala / segundos finais / fim do mundo / pódio |

### Sons de gesto (não passam pelo fio)

| Som | Quando |
|---|---|
| `eject` | cuspir (W ou botão sem munição). **Não há evento no fio** — seriam ~9 por segundo por jogador só para um "pft" —, então o som sai do gesto local, na mesma cadência do servidor (`EJECT.HOLD_TICKS`), e a **altura sobe com a rampa de força**: dá para ouvir a cusparada indo mais longe |
| `lock` | o anel de mira trocou de bolinha — é o que faz a mira nova sentir viva |
| `cancel` | ESPAÇO cancelou o tiro carregado |

### Telas

`uiHover` `uiClick` `uiOpen` `uiClose` `buy` `equip` `error` `toast` — não existia nenhum. O clique e o hover
entram por **delegação**, num listener só em `App.jsx` (em vez de espalhar `sfx()` por dez componentes); o canvas
do jogo fica de fora, porque lá quem manda é o som da partida.

## Mesa de som (`?sfx`)

`http://localhost:5173/?sfx` abre a **mesa de som**: todo o `KIT` com um botão por receita, os contínuos com
controle de intensidade (dá para ouvir o alerta acelerar), os três eixos da ambiência e os dois controles que mais
mudam a sensação — `pitch` e a escada da sequência. É por onde o pacote é aprovado de ouvido; o que ficar bom
volta como números em `kit.js`.

## Onde mexer

- **Afinar um som**: `KIT` em `client/src/audio/kit.js` (frequências, duração, ganho, tipo de onda, e o `at` de
  cada voz, que é o que dá o ataque + corpo + cauda).
- **Novo som para um evento do fio**: basta a chave do `KIT` ter o mesmo nome do efeito visual (`FX_OF` em
  `client/src/game/index.js`) — o disparo é automático.
- **Novo contínuo**: um `if(name==="...")` em `build()` de `client/src/audio/index.js`, no molde dos outros.
- **Trocar por arquivos**: `voz()` é o único ponto que cria fonte de áudio; dá para trocar a síntese por
  `AudioBufferSourceNode` sem tocar em nada do jogo.
