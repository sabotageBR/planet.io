// ── O `Viajante-NNNN` sorteado no cadastro de convidado ────────────────────────
// Ele é PLACA, não escolha: o servidor o sorteia em `randomGuestNick` (9000 valores) só para a conta
// nascer com algum nome. Quem precisa reconhecê-lo é a tela inicial, que deixa o campo VAZIO com o
// pedido em vez de fingir que o jogador já escolheu. (O cadastro por senha também o usava, para não
// sugerir uma placa sorteada como nome de login; a aba saiu, o motivo fica registrado aqui.)
export const nickSorteado = nick => !nick || /^Viajante-\d{4}$/.test(String(nick));
