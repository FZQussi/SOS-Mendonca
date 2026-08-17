import test from 'node:test';
import assert from 'node:assert/strict';
import type { DB } from './db.js'; // type-only: apagado na compilação, sem efeito de módulo

// db.ts abre `export const db = openDatabase()` como efeito de módulo, ao
// nível de topo — mesmo só se usando `openDatabase` diretamente, esse
// singleton corre à mesma. Sem isto, tentaria abrir o ficheiro real
// (data/sos.db), que o servidor de dev pode ter aberto ao mesmo tempo.
process.env.DB_PATH = ':memory:';

const { openDatabase, addColumn, ALERT_TYPES, now } = await import('./db.js');

/** Base de dados nova em memória, com um dispositivo já criado. */
function fresh(): { db: DB; deviceId: number } {
  const db = openDatabase(':memory:');
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO devices (name, created_at) VALUES (?, ?)`)
    .run('Telemóvel da Maria', now());
  return { db, deviceId: Number(lastInsertRowid) };
}

test('cria as cinco tabelas', () => {
  const { db } = fresh();
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  assert.deepEqual(
    tables.map((t) => t.name).sort(),
    ['alerts', 'caregivers', 'devices', 'emergency_contacts', 'locations'],
  );
});

test('migrar duas vezes não estoira', () => {
  const db = openDatabase(':memory:');
  assert.doesNotThrow(() => openDatabase(':memory:'));
  db.close();
});

test('chaves estrangeiras estão ligadas', () => {
  // Desligadas por omissão no SQLite. Se este teste falhar, um alerta pode
  // ficar agarrado a um dispositivo que já não existe.
  const { db } = fresh();
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.throws(
    () =>
      db
        .prepare(`INSERT INTO alerts (device_id, type, recorded_at, received_at) VALUES (?,?,?,?)`)
        .run(9999, 'sos', now(), now()),
    /FOREIGN KEY/,
  );
});

test('apagar um dispositivo leva os filhos atrás', () => {
  const { db, deviceId } = fresh();
  const t = now();
  db.prepare(`INSERT INTO locations (device_id, lat, lon, recorded_at, received_at) VALUES (?,?,?,?,?)`)
    .run(deviceId, 38.7, -9.1, t, t);
  db.prepare(`INSERT INTO alerts (device_id, type, recorded_at, received_at) VALUES (?,?,?,?)`)
    .run(deviceId, 'sos', t, t);
  db.prepare(`INSERT INTO emergency_contacts (device_id, name, phone) VALUES (?,?,?)`)
    .run(deviceId, 'Filho', '910000000');

  db.prepare(`DELETE FROM devices WHERE id = ?`).run(deviceId);

  for (const table of ['locations', 'alerts', 'emergency_contacts']) {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    assert.equal(n, 0, `${table} ficou com órfãos`);
  }
});

test('aceita os cinco tipos de alerta e recusa os outros', () => {
  const { db, deviceId } = fresh();
  const insert = db.prepare(`INSERT INTO alerts (device_id, type, recorded_at, received_at) VALUES (?,?,?,?)`);
  for (const type of ALERT_TYPES) {
    assert.doesNotThrow(() => insert.run(deviceId, type, now(), now()), type);
  }
  assert.throws(() => insert.run(deviceId, 'panico', now(), now()), /CHECK/);
});

test('confirmação de alerta é quem e quando, ou nenhum dos dois', () => {
  const { db, deviceId } = fresh();
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO alerts (device_id, type, recorded_at, received_at) VALUES (?,?,?,?)`)
    .run(deviceId, 'sos', now(), now());

  // Metade confirmado não passa: um alerta tratado por ninguém em momento nenhum.
  assert.throws(
    () => db.prepare(`UPDATE alerts SET acked_by = 1 WHERE id = ?`).run(lastInsertRowid),
    /CHECK/,
  );

  const caregiver = db
    .prepare(`INSERT INTO caregivers (email, password_hash, name, created_at) VALUES (?,?,?,?)`)
    .run('eu@exemplo.pt', 'hash', 'Eu', now());
  assert.doesNotThrow(() =>
    db
      .prepare(`UPDATE alerts SET acked_by = ?, acked_at = ? WHERE id = ?`)
      .run(caregiver.lastInsertRowid, now(), lastInsertRowid),
  );
});

test('o percurso lê-se por recorded_at, não por received_at', () => {
  // É o erro que a §6 avisa: a fila offline reenvia em lote, por isso os pontos
  // chegam por ordem diferente daquela em que foram registados.
  const { db, deviceId } = fresh();
  const insert = db.prepare(
    `INSERT INTO locations (device_id, lat, lon, recorded_at, received_at) VALUES (?,?,?,?,?)`,
  );
  insert.run(deviceId, 1, 1, 1000, 9000); // registado primeiro, chegou depois
  insert.run(deviceId, 2, 2, 2000, 8000);
  insert.run(deviceId, 3, 3, 3000, 7000);

  const porRegisto = db
    .prepare(`SELECT lat FROM locations WHERE device_id = ? ORDER BY recorded_at DESC`)
    .all(deviceId) as { lat: number }[];
  assert.deepEqual(porRegisto.map((r) => r.lat), [3, 2, 1]);

  const porChegada = db
    .prepare(`SELECT lat FROM locations WHERE device_id = ? ORDER BY received_at DESC`)
    .all(deviceId) as { lat: number }[];
  assert.deepEqual(porChegada.map((r) => r.lat), [1, 2, 3], 'ordem trocada, como esperado');
});

test('email do cuidador é único e ignora maiúsculas', () => {
  const { db } = fresh();
  const insert = db.prepare(`INSERT INTO caregivers (email, password_hash, name, created_at) VALUES (?,?,?,?)`);
  insert.run('eu@exemplo.pt', 'hash', 'Eu', now());
  assert.throws(() => insert.run('EU@Exemplo.PT', 'hash', 'Outro', now()), /UNIQUE/);
});

test('dois dispositivos não partilham token nem código de emparelhamento', () => {
  const { db } = fresh();
  const insert = db.prepare(`INSERT INTO devices (name, token_hash, pairing_code, created_at) VALUES (?,?,?,?)`);
  insert.run('A', 'hash-a', '123456', now());
  assert.throws(() => insert.run('B', 'hash-a', '654321', now()), /UNIQUE/);
  assert.throws(() => insert.run('C', 'hash-c', '123456', now()), /UNIQUE/);
  // Mas por emparelhar (ambos NULL) pode haver vários: no SQLite NULL não
  // colide com NULL num índice único.
  assert.doesNotThrow(() => {
    insert.run('D', null, null, now());
    insert.run('E', null, null, now());
  });
});

test('addColumn é idempotente e preserva as linhas', () => {
  const { db, deviceId } = fresh();
  addColumn(db, 'devices', 'app_version', 'TEXT');
  addColumn(db, 'devices', 'app_version', 'TEXT'); // segunda vez não faz nada
  db.prepare(`UPDATE devices SET app_version = ? WHERE id = ?`).run('1.2.3', deviceId);
  const row = db.prepare(`SELECT app_version FROM devices WHERE id = ?`).get(deviceId) as {
    app_version: string;
  };
  assert.equal(row.app_version, '1.2.3');
});
