# Som

Tudo é **sintetizado no WebAudio** (`client/src/audio/index.js`): nenhum arquivo de áudio, nenhuma licença,
nada para baixar. Cada efeito é uma receita de vozes — oscilador (`tom`) ou ruído filtrado (`ruido`) — com
envelope e glide de frequência, no mesmo espírito das texturas, que também são desenhadas e não são imagens.
Afinar um som é mexer nos números de `KIT`.

## Como funciona

- **Contexto único**, criado no primeiro gesto do jogador (política de autoplay dos navegadores): o clique em
  JOGAR já serve. Cadeia: vozes → `GainNode` (volume) → `DynamicsCompressor` (evita estouro quando várias
  explosões coincidem) → saída.
- **Espaço**: eventos com posição de mundo têm volume por distância da câmera (some além de `FAR` = 2600 px)
  e um pouco de estéreo (`PAN`). O que é meu toca em volume cheio, no centro.
- **Tamanho importa**: o `r` do evento sobe o ganho até 1,6× — a explosão de um planetão soa maior que a de um
  grão.
- **Cortes**: no máximo `VOICES` (14) vozes ao mesmo tempo e um intervalo mínimo por tipo (`GAP`) — sem isso,
  comer 20 grãos numa passada vira metralhadora. Com o ímã ligado, o `GAP` de 45 ms do `food` é o que segura.
- **Preferências** (Opções → Som, já existiam na tela): `sound` liga/desliga, `volume` 0–100, `music` liga um
  drone lento de duas vozes ao fundo (vem desligado).
- **Sincronia com o vídeo**: o som usa o mesmo atraso do efeito visual. O que acontece com terceiros espera o
  atraso de interpolação (−100 ms) para casar com o que se vê; o que é meu toca na hora.

## Mapeamento

### Eventos do fio (`EVENT.*`) — o mesmo `kind` do efeito visual vira o som

| Som | Evento | Quando | Timbre |
|---|---|---|---|
| `eat` | `EAT` | engoliu um planeta | seno 440→150 Hz + ruído curto ("nhac") |
| `pop` | `POP` | estourou num asteroide | ruído + serra despencando |
| `merge` | `MERGE` | duas partes se juntaram | seno subindo 300→520 |
| `split` | `SPLIT` | dividiu | whoosh (ruído varrendo 700→2200) |
| `boom` | `BOOM` | míssil acertou um planeta | ruído grave + sub 150→44 Hz |
| `suck` | `BH_SUCK` | **espaguetificação**: entrou no buraco negro | seno despencando 560→52 Hz em 0,55 s |
| `exit` | `EXIT` | cuspido do outro lado | seno subindo 90→680 |
| `chip` | `CHIP` | rocha lascou massa | clique seco |
| `bounce` | `BOUNCE` | trombada entre planetas | "toc" curto |
| `shoot` | `SHOOT` | asteroide-vírus atirou um filho | quadrada descendo |
| `deflect` | `DEFLECT` | míssil desviou uma rocha | quadrada subindo |
| `clash` | `CLASH` | míssil × míssil | ruído agudo + clink |
| `shieldUp` | `SHIELD_UP` | escudo subiu de nível | arpejo de 3 notas |
| `shieldHit` | `SHIELD_HIT` | escudo levou um tiro | ting metálico |
| `shieldBreak` | `SHIELD_BREAK` | escudo quebrou | vidro (ruído + queda) |
| `starBurst` | `STAR_BURST` | estilhaçou na estrela | crash |
| `starHit` | `STAR_HIT` | tiro/partícula empurrou a estrela | impacto curto |
| `starSplit` | `STAR_SPLIT` | a estrela rachou em várias | crack grave |
| `supernova` | `SUPERNOVA` | a estrela explodiu | 1,1 s: ruído + sub 200→28 Hz |
| `death` | `DEATH` | alguém morreu | queda longa de 0,8 s |

> Eventos sobre **mim** sempre chegam, mesmo fora da AOI (`Room.flushEvents`) — sem isso, quem é sugado pelo
> buraco negro não ouvia nem via a própria espaguetificação, porque a câmera já tinha saltado para a saída.

### O que o cliente descobre sozinho

| Som | De onde | Observação |
|---|---|---|
| `food` | comida/pellet sumindo encostado numa peça minha (`onVanish`) | só o que **eu** comi faz barulho, senão o mapa inteiro estala |
| `ammo` | `self.missiles` subiu | peguei munição |
| `fire` | `self.missiles` caiu (e estou vivo) | atirei — o servidor confirmou |
| `powerup` | `self.magnetT` passou de 0 | peguei o ímã (o escudo já vem por `SHIELD_UP`) |
| `join` | JSON `room` | entrei na sala |
| `countdown` | contagem dos `ROUND.WARN_S` segundos finais | um beep por segundo |
| `bigCrunch` | JSON `roundEnd` | 1,6 s de rumble: o fim do mundo |

### Ainda sem som (de propósito)

`FOOD_WARP` e `WARP` (comida e massa atravessando o buraco negro) existem no mundo mas não vão para o fio — o
jogador já vê o cacho aparecer, e cada grão que atravessa geraria evento demais. `MERGE_READY` (powerup de
fusão) usa o som de `merge` quando as partes de fato se juntam.

## Onde mexer

- **Afinar um som**: `KIT` em `client/src/audio/index.js` (frequências, duração, ganho, tipo de onda).
- **Novo som para um evento do fio**: basta a chave do `KIT` ter o mesmo nome do efeito visual (`FX_OF` em
  `client/src/game/index.js`) — o disparo é automático.
- **Trocar por arquivos**: `play()` é o único ponto de entrada; dá para trocar a síntese por `AudioBufferSourceNode`
  sem tocar em nada do jogo.
