import { EventEmitter } from 'node:events';

/**
 * Ponto de encontro entre as rotas e o WebSocket (`ws.ts` subscreve este
 * emissor). Convenção do Context.md §7: todo o alerta novo chama `broadcast()`
 * a seguir ao INSERT. Sem ninguém à escuta, emitir é inofensivo.
 */
export const events = new EventEmitter();

export type BroadcastEvent =
  | { event: 'alert'; data: unknown }
  | { event: 'location'; data: unknown };

export function broadcast(payload: BroadcastEvent): void {
  events.emit('message', payload);
}
