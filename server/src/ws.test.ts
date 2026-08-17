import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET ??= 'segredo-de-teste-não-usar-em-produção';

const { createApp } = await import('./index.js');
const { attachWebSocket } = await import('./ws.js');
const { db, now } = await import('./db.js');
const { hashPassword, signCaregiverToken } = await import('./auth.js');
const { createAlert } = await import('./alerts.js');

const app = createApp();
const server: Server = createServer(app);
attachWebSocket(server);
await new Promise<void>((resolve) => server.listen(0, resolve));
const { port } = server.address() as AddressInfo;
const wsBase = `ws://127.0.0.1:${port}/ws`;

test.after(() => server.close());

function seedCaregiverToken(email: string): string {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO caregivers (email, password_hash, name, created_at) VALUES (?,?,?,?)`)
    .run(email, hashPassword('correcta123'), 'Eu', now());
  return signCaregiverToken(Number(lastInsertRowid));
}

/**
 * Fila de mensagens ligada desde já — nunca perde uma mensagem entre dois
 * `await` sequenciais. O `hello` do servidor pode chegar no mesmo instante
 * síncrono que o evento `open`, antes de um segundo `ws.once('message', …)`
 * ter tempo de se registar; um `once` a seguir a um `await` corre esse risco,
 * uma fila alimentada desde o início não.
 */
function messageQueue(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: ((msg: unknown) => void)[] = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });
  return {
    next: (): Promise<unknown> =>
      queue.length > 0 ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)),
  };
}

test('ligação sem token é recusada com 401, não aceite em silêncio', async () => {
  const ws = new WebSocket(wsBase);
  const outcome = await new Promise<string>((resolve) => {
    ws.on('unexpected-response', (_req, res) => resolve(`status:${res.statusCode}`));
    ws.on('open', () => resolve('abriu — não devia'));
  });
  assert.equal(outcome, 'status:401');
});

test('ligação com token de cuidador válido recebe hello', async () => {
  const token = seedCaregiverToken('ws1@exemplo.pt');
  const ws = new WebSocket(`${wsBase}?token=${token}`);
  const queue = messageQueue(ws);
  try {
    const first = (await queue.next()) as { event: string };
    assert.equal(first.event, 'hello');
  } finally {
    ws.close();
  }
});

test('um alerta novo criado no servidor chega ao cliente ligado', async () => {
  const token = seedCaregiverToken('ws2@exemplo.pt');
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO devices (name, created_at) VALUES (?, ?)`)
    .run('Telemóvel', now());
  const deviceId = Number(lastInsertRowid);

  const ws = new WebSocket(`${wsBase}?token=${token}`);
  const queue = messageQueue(ws);
  try {
    await queue.next(); // hello

    createAlert({ deviceId, type: 'sos' });

    const msg = (await queue.next()) as { event: string; data: { type: string } };
    assert.equal(msg.event, 'alert');
    assert.equal(msg.data.type, 'sos');
  } finally {
    ws.close();
  }
});
