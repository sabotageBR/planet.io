-- 0013: todo mundo volta a receber o aviso de "Battle Royale começando".
--
-- O pedido foi "todos os usuários parametrizados para exibir a notificação de BR". A pref `brInvite` nasce
-- LIGADA (`PREF_DEFAULTS` em client/src/state/app.js), então quem nunca a tocou já está certo; o que existe
-- para corrigir é quem GRAVOU `false` — pelas Opções ou pelo menu do Esc.
--
-- ⚠️ APAGA A CHAVE, NUNCA GRAVA `true`. O padrão mora num lugar só (`PREF_DEFAULTS`) e `normalizePrefs`
-- trata ausência como padrão: gravar `true` criaria uma SEGUNDA verdade, que sobreviveria à próxima mudança
-- de padrão e teria de ser desfeita à mão. Apagando, a conta volta a seguir o padrão — qualquer que ele seja
-- daqui em diante.
--
-- ⚠️ É UMA CORREÇÃO DE UMA VEZ, não uma regra. Quem desligar de novo depois disto continua desligado, e é
-- assim que tem que ser: os portais pedem por escrito que o jogador consiga se proteger do que o incomoda.
-- Quem quiser tirar a escolha da mão dele de vez tem que tirar a linha das Opções — que é outra decisão, e
-- não uma migração repetida.
--
-- ⚠️ O operador `-` de jsonb existe desde o PG 9.5; este banco é 9.6. `?` também. O WHERE evita reescrever
-- linha de quem já está certo (a tabela é grande e o UPDATE é o custo real aqui).
UPDATE users SET prefs = prefs - 'brInvite'
 WHERE prefs ? 'brInvite' AND (prefs->>'brInvite') = 'false';
