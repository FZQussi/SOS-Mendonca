import { getToken } from './api';

export interface WsMessage {
  event: 'hello' | 'alert' | 'location';
  data?: unknown;
}

const MAX_BACKOFF_MS = 30_000; // Context.md §7: espera crescente até 30 s

/** Liga ao `/ws`, religando sozinho se cair. Devolve a função para desligar. */
export function connectWebSocket(onMessage: (msg: WsMessage) => void): () => void {
  let socket: WebSocket | null = null;
  let backoff = 1000;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    const token = getToken();
    if (!token || stopped) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      backoff = 1000;
    };
    socket.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        // mensagem malformada — ignora, não vale a pena rebentar a ligação por isto
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      retryTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    socket?.close();
  };
}
