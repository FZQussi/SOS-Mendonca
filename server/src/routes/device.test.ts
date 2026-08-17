import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Isolamento: process.env tem de estar definido *antes* de importar index.js,
// que importa db.js, cujo singleton `db` é aberto com estes valores.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET ??= 'segredo-de-teste-não-usar-em-produção';

const { createApp } = await import('../index.js');
const { db, now } = await import('../db.js');
const { events } = await import('../broadcast.js');
const { PAIR_MAX_FAILURES, resetFailures } = await import('../auth.js');

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

/** Cria um dispositivo diretamente na BD e devolve o código de emparelhamento. */
function seedDevice(name = 'Telemóvel da Maria'): string {
  const code = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  db.prepare(
    `INSERT INTO devices (name, pairing_code, pairing_expires_at, created_at) VALUES (?,?,?,?)`,
  ).run(name, code, now() + 900_000, now());
  return code;
}

async function pairedDevice() {
  const code = seedDevice();
  const { body } = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code }) });
  return body as { token: string; device: { id: number; name: string } };
}

// --- emparelhamento --------------------------------------------------------------

test('pair: código inexistente → 401', async () => {
  const { status, body } = await json('/api/v1/device/pair', {
    method: 'POST',
    body: JSON.stringify({ code: '999999' }),
  });
  assert.equal(status, 401);
  assert.ok((body as { error: string }).error);
});

test('pair: força bruta bate no 429, e um código certo volta a ser aceite depois', async (t) => {
  // Os contadores são globais ao processo — limpar antes e depois para não
  // envenenar os outros testes de emparelhamento.
  resetFailures();
  t.after(() => resetFailures());

  for (let i = 0; i < PAIR_MAX_FAILURES; i++) {
    const { status } = await json('/api/v1/device/pair', {
      method: 'POST',
      body: JSON.stringify({ code: '000001' }),
    });
    assert.equal(status, 401, `tentativa ${i + 1} devia ainda passar pelo travão`);
  }

  const blocked = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code: '000001' }) });
  assert.equal(blocked.status, 429);

  // Um código válido também é recusado enquanto o travão está ativo: é o
  // preço de não conseguir distinguir quem ataca de quem tenta emparelhar.
  const code = seedDevice();
  const duranteOTravao = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(duranteOTravao.status, 429);

  resetFailures();
  const depois = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(depois.status, 200);
});

test('pair: código com formato errado → 400 (Zod)', async () => {
  const { status } = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code: 'abc' }) });
  assert.equal(status, 400);
});

test('pair: código válido → token de 64 hex, e o código não serve segunda vez', async () => {
  const code = seedDevice();
  const first = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(first.status, 200);
  const { token, device } = first.body as { token: string; device: { name: string } };
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(device.name, 'Telemóvel da Maria');

  const second = await json('/api/v1/device/pair', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(second.status, 401, 'código reutilizado devia falhar');
});

// --- rotas protegidas por requireDevice -------------------------------------------

test('rota de dispositivo sem token → 401', async () => {
  const { status } = await json('/api/v1/device/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ battery_pct: 50 }),
  });
  assert.equal(status, 401);
});

test('heartbeat: atualiza bateria e last_seen_at', async () => {
  const { token, device } = await pairedDevice();
  const { status, body } = await json('/api/v1/device/heartbeat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ battery_pct: 42 }),
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });

  const row = db.prepare(`SELECT battery_pct, last_seen_at FROM devices WHERE id = ?`).get(device.id) as {
    battery_pct: number;
    last_seen_at: number;
  };
  assert.equal(row.battery_pct, 42);
  assert.ok(row.last_seen_at > 0);
});

test('locations: aceita um ponto único ou um lote', async () => {
  const { token, device } = await pairedDevice();
  const t = now();

  const single = await json('/api/v1/device/locations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lat: 38.7, lon: -9.1, recorded_at: t }),
  });
  assert.deepEqual(single.body, { saved: 1 });

  const batch = await json('/api/v1/device/locations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify([
      { lat: 38.71, lon: -9.11, recorded_at: t + 1000 },
      { lat: 38.72, lon: -9.12, recorded_at: t + 2000 },
    ]),
  });
  assert.deepEqual(batch.body, { saved: 2 });

  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM locations WHERE device_id = ?`).get(device.id) as {
    n: number;
  };
  assert.equal(n, 3);
});

test('locations: difunde só o último ponto do lote, não o lote inteiro', async () => {
  const { token, device } = await pairedDevice();
  const t = now();

  const received: unknown[] = [];
  const onMessage = (msg: unknown) => received.push(msg);
  events.on('message', onMessage);

  try {
    await json('/api/v1/device/locations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        { lat: 38.71, lon: -9.11, recorded_at: t + 1000 },
        { lat: 38.72, lon: -9.12, recorded_at: t + 2000 },
      ]),
    });
  } finally {
    events.off('message', onMessage);
  }

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    event: 'location',
    data: { device_id: device.id, lat: 38.72, lon: -9.12, recorded_at: t + 2000 },
  });
});

test('alerts: sos cria alerta e nunca é suprimido por anti-spam', async () => {
  const { token } = await pairedDevice();
  const first = await json('/api/v1/device/alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'sos', lat: 38.7, lon: -9.1 }),
  });
  assert.equal(first.status, 200);
  assert.ok((first.body as { id: number }).id);

  // Um segundo SOS imediatamente a seguir tem de criar outro alerta — é o
  // único tipo que a §5 da Context.md proíbe suprimir.
  const second = await json('/api/v1/device/alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'sos' }),
  });
  assert.equal(second.status, 200);
  assert.notEqual((second.body as { id: number }).id, (first.body as { id: number }).id);
});

test('alerts: low_battery repetido dentro de 1h é suprimido pelo anti-spam', async () => {
  const { token } = await pairedDevice();
  const first = await json('/api/v1/device/alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'low_battery' }),
  });
  assert.ok((first.body as { id: number }).id);

  const second = await json('/api/v1/device/alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'low_battery' }),
  });
  assert.deepEqual(second.body, { suppressed: true });
});

test('contacts: PUT substitui a lista completa', async () => {
  const { token, device } = await pairedDevice();
  const { status, body } = await json('/api/v1/device/contacts', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify([
      { name: 'Filho', phone: '910000000', priority: 1 },
      { name: 'Vizinha', phone: '920000000' },
    ]),
  });
  assert.equal(status, 200);
  assert.equal((body as { contacts: unknown[] }).contacts.length, 2);

  const { n } = db
    .prepare(`SELECT COUNT(*) AS n FROM emergency_contacts WHERE device_id = ?`)
    .get(device.id) as { n: number };
  assert.equal(n, 2);
});

test('contacts: GET devolve por prioridade — o primeiro é quem o SOS liga', async () => {
  const { token, device } = await pairedDevice();
  // Inseridos fora de ordem de propósito: quem manda é a prioridade, não o INSERT.
  const insert = db.prepare(
    `INSERT INTO emergency_contacts (device_id, name, phone, priority) VALUES (?,?,?,?)`,
  );
  insert.run(device.id, 'Vizinha', '920000000', 2);
  insert.run(device.id, 'Filha', '910000000', 1);

  const { status, body } = await json('/api/v1/device/contacts', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(status, 200);
  const { contacts } = body as { contacts: { name: string; priority: number }[] };
  assert.deepEqual(
    contacts.map((c) => c.name),
    ['Filha', 'Vizinha'],
  );
});

test('versão da app: guarda o cabeçalho, ignora lixo, e sem ele continua a servir', async () => {
  const { token, device } = await pairedDevice();
  const version = () =>
    (db.prepare(`SELECT app_version FROM devices WHERE id = ?`).get(device.id) as { app_version: string | null })
      .app_version;

  const beat = (headers: Record<string, string>) =>
    json('/api/v1/device/heartbeat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify({ battery_pct: 80 }),
    });

  await beat({ 'X-SOS-App-Version': '1.4.2' });
  assert.equal(version(), '1.4.2');

  // Lixo do cliente não entra na BD nem apaga o que já se sabia.
  await beat({ 'X-SOS-App-Version': '1.0 <script>' });
  assert.equal(version(), '1.4.2');

  // App antiga, que ainda não envia o cabeçalho: o pedido tem de funcionar na
  // mesma (compatibilidade só para a frente, Context.md §9).
  const semCabecalho = await beat({});
  assert.equal(semCabecalho.status, 200);
  assert.equal(version(), '1.4.2');

  await beat({ 'X-SOS-App-Version': '1.5.0' });
  assert.equal(version(), '1.5.0');
});

test('contacts: GET sem token → 401, não a lista de outro dispositivo', async () => {
  const { status } = await json('/api/v1/device/contacts');
  assert.equal(status, 401);
});
