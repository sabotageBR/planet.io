// ── O `Viajante-NNNN` sorteado no cadastro de convidado ────────────────────────
// Ele é PLACA, não escolha: o servidor o sorteia em `randomGuestNick` (9000 valores) só para a conta
// nascer com algum nome. DOIS lugares precisam reconhecê-lo e nenhum pode adivinhar sozinho — a tela
// inicial, que deixa o campo VAZIO com o pedido em vez de fingir que o jogador já escolheu, e o
// cadastro, onde pré-preencher o usuário com ele daria colisão de aniversário (~50 % em ~110 contas)
// num campo que é único de verdade.
export const nickSorteado = nick => !nick || /^Viajante-\d{4}$/.test(String(nick));
