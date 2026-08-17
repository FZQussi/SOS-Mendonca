import { EventEmitter } from 'node:events';

/**
 * Ponto de encontro entre as rotas e o WebSocket. Ainda não há WebSocket
 * (é o próximo passo do roadmap) — as rotas já chamam `broadcast()`, como a
 * convenção do Context.md §7 exige, e o servidor WS há de subscrever este
 * emissor quando existir. Até lá, os eventos emitem-se e ninguém ouve, o que
 * é inofensivo.
 */
export const events = new EventEmitter();

export type BroadcastEvent =
  | { event: 'alert'; data: unknown }
  | { event: 'location'; data: unknown };

export function broadcast(payload: BroadcastEvent): void {
  events.emit('message', payload);
}
