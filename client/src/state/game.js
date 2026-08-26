// Registro da instância do jogo (GameHost cria, Hud lê o hudStore).
import { createStore } from "./store.js";
export const gameRef = createStore({ game: null });
export const getGame = () => gameRef.get().game;
export const setGame = game => gameRef.set({ game });
