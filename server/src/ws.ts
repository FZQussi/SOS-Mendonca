import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { verifyCaregiverToken } from './auth.js';
import { events, type BroadcastEvent } from './broadcast.js';

// Ping de 30 em 30 s para atravessar o Cloudflare Tunnel — sem isto o túnel
// fecha a ligação por inatividade (Context.md §7).
const PING_INTERVAL_MS = 30_000;

/**
 * `/ws?token=<jwt>`. Só cuidadores ligam — o telemóvel do idoso fala por
 * HTTP (Context.md §7). Precisa do `http.Server` real, não do `app`
 * Express, porque a mudança de protocolo (`upgrade`) acontece antes do
 * Express ver o pedido.
 */
export function attachWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    const caregiver = token ? verifyCaregiverToken(token) : null;
    if (!caregiver) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ event: 'hello' }));

    // Deteta ligações mortas (Wi-Fi caiu sem fechar TCP) — sem isto o
    // servidor manda mensagens para o vazio indefinidamente.
    let alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    const pingTimer = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, PING_INTERVAL_MS);

    ws.on('close', () => clearInterval(pingTimer));
  });

  const forward = (payload: BroadcastEvent) => {
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(message);
    }
  };
  events.on('message', forward);

  return wss;
}
