import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET ??= 'segredo-de-teste-não-usar-em-produção';

const { createApp } = await import('../index.js');
const { db, now } = await import('../db.js');
const { hashPassword, signCaregiverToken } = await import('../auth.js');

const app = createApp();
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, resolve));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

test.after(() => server.close());

async function json(path: string, init?: RequestInit) {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return { status: res.status, body: await res.json() };
}

function auth(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Cria um cuidador diretamente na BD (password sempre 'correcta123') e devolve
 * o token JWT. `/auth/register` só aceita o primeiro cuidador de sempre nesta
 * BD partilhada por todo o ficheiro — usar o endpoint aqui esgotaria essa
 * única vaga já no segundo teste. Os testes de registo em si continuam a
 * chamar o endpoint real.
 */
function seedCaregiver(email = 'eu@exemplo.pt'): string {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO caregivers (email, password_hash, name, created_at) VALUES (?,?,?,?)`)
    .run(email, hashPassword('correcta123'), 'Eu', now());
  return signCaregiverToken(Number(lastInsertRowid));
}

// --- registo e login ---------------------------------------------------------------

test('register: primeiro cuidador → 201, segundo → 403 (registo fecha)', async () => {
  const first = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'a@exemplo.pt', password: 'correcta123', name: 'A' }),
  });
  assert.equal(first.status, 201);
  assert.ok((first.body as { token: string }).token);

  const second = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'b@exemplo.pt', password: 'correcta123', name: 'B' }),
  });
  assert.equal(second.status, 403);
});

test('register: password curta → 400 (Zod), não chega a tocar na BD', async () => {
  const { status } = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'c@exemplo.pt', password: '123', name: 'C' }),
  });
  assert.equal(status, 400);
});

test('login: password errada e email inexistente devolvem o mesmo erro', async () => {
  seedCaregiver('login1@exemplo.pt');

  const wrongPassword = await json('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'login1@exemplo.pt', password: 'errada' }),
  });
  const unknownEmail = await json('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ninguem@exemplo.pt', password: 'qualquer123' }),
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
});

test('login: credenciais corretas → token', async () => {
  seedCaregiver('login2@exemplo.pt');
  const { status, body } = await json('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'login2@exemplo.pt', password: 'correcta123' }),
  });
  assert.equal(status, 200);
  assert.ok((body as { token: string }).token);
});

// --- dispositivos, vistos pelo cuidador -------------------------------------------

test('devices: criar e listar, com pairing_code e paired=false antes do emparelhamento', async () => {
  const token = seedCaregiver('devices1@exemplo.pt');

  const created = await json('/api/v1/devices', {
    method: 'POST',
    ...auth(token),
    body: JSON.stringify({ name: 'Telemóvel do Avô' }),
  });
  assert.equal(created.status, 201);
  const { pairing_code } = created.body as { pairing_code: string };
  assert.match(pairing_code, /^\d{6}$/);

  const list = await json('/api/v1/devices', auth(token));
  const devices = (list.body as { devices: { name: string; paired: boolean; pairing_code: string }[] }).devices;
  const found = devices.find((d) => d.name === 'Telemóvel do Avô');
  assert.ok(found);
  assert.equal(found.paired, false);
  assert.equal(found.pairing_code, pairing_code);
});

test('devices: rota exige requireCaregiver', async () => {
  const { status } = await json('/api/v1/devices');
  assert.equal(status, 401);
});

// --- alertas ---------------------------------------------------------------------

async function seedOpenAlert(): Promise<number> {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO devices (name, created_at) VALUES (?, ?)`)
    .run('Telemóvel', now());
  const deviceId = Number(lastInsertRowid);
  const { lastInsertRowid: alertId } = db
    .prepare(`INSERT INTO alerts (device_id, type, recorded_at, received_at) VALUES (?,?,?,?)`)
    .run(deviceId, 'sos', now(), now());
  return Number(alertId);
}

test('alerts: GET ?open=true só devolve os não confirmados', async () => {
  const token = seedCaregiver('alerts1@exemplo.pt');
  const alertId = await seedOpenAlert();

  const before = await json('/api/v1/alerts?open=true', auth(token));
  const openIds = (before.body as { alerts: { id: number }[] }).alerts.map((a) => a.id);
  assert.ok(openIds.includes(alertId));

  await json(`/api/v1/alerts/${alertId}/ack`, { method: 'POST', ...auth(token) });

  const after = await json('/api/v1/alerts?open=true', auth(token));
  const stillOpen = (after.body as { alerts: { id: number }[] }).alerts.map((a) => a.id);
  assert.ok(!stillOpen.includes(alertId));
});

test('alerts/ack: idempotente — segunda confirmação → 409; id inexistente → 404', async () => {
  const token = seedCaregiver('alerts2@exemplo.pt');
  const alertId = await seedOpenAlert();

  const first = await json(`/api/v1/alerts/${alertId}/ack`, { method: 'POST', ...auth(token) });
  assert.equal(first.status, 200);

  const second = await json(`/api/v1/alerts/${alertId}/ack`, { method: 'POST', ...auth(token) });
  assert.equal(second.status, 409);

  const missing = await json('/api/v1/alerts/999999/ack', { method: 'POST', ...auth(token) });
  assert.equal(missing.status, 404);
});

// --- fcm-token ---------------------------------------------------------------------

test('me/fcm-token: grava o token do cuidador autenticado', async () => {
  const token = seedCaregiver('fcm1@exemplo.pt');
  const { status } = await json('/api/v1/me/fcm-token', {
    method: 'PUT',
    ...auth(token),
    body: JSON.stringify({ token: 'fcm-token-de-teste' }),
  });
  assert.equal(status, 200);

  const row = db.prepare(`SELECT fcm_token FROM caregivers WHERE email = ?`).get('fcm1@exemplo.pt') as {
    fcm_token: string;
  };
  assert.equal(row.fcm_token, 'fcm-token-de-teste');
});
