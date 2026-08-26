// Registro da instância do jogo (GameHost cria, Hud lê o hudStore).
import { createStore } from "./store.js";
export const gameRef = createStore({ game: null });
export const getGame = () => gameRef.get().game;
export const setGame = game => gameRef.set({ game });
// Relógio do espaço da rodada (o motor escreve, o relógio de tema lê): hora 0..24 ou null fora da partida.
export const clockRef = createStore({ hour: null });
export const setRoundHour = hour => { if (clockRef.get().hour !== hour) clockRef.set({ hour }); };
