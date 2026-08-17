import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';

const { db, now } = await import('./db.js');
const { watchdogTick } = await import('./watchdog.js');

let deviceSeq = 0;

/** Dispositivo já emparelhado, visto pela última vez há X minutos (ou nunca, se null). */
function pairedDevice(lastSeenMinutesAgo: number | null): number {
  const lastSeen = lastSeenMinutesAgo === null ? null : now() - lastSeenMinutesAgo * 60_000;
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO devices (name, token_hash, last_seen_at, created_at) VALUES (?,?,?,?)`)
    .run('Telemóvel', `hash-de-teste-${++deviceSeq}`, lastSeen, now());
  return Number(lastInsertRowid);
}

function offlineAlertCount(deviceId: number): number {
  const { n } = db
    .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE device_id = ? AND type = 'device_offline'`)
    .get(deviceId) as { n: number };
  return n;
}

test('dispositivo silencioso há mais do que o limite → alerta device_offline', () => {
  const id = pairedDevice(40);
  watchdogTick(30);
  assert.equal(offlineAlertCount(id), 1);
});

test('dispositivo com sinal recente não gera alerta', () => {
  const id = pairedDevice(5);
  watchdogTick(30);
  assert.equal(offlineAlertCount(id), 0);
});

test('dispositivo nunca visto (last_seen_at NULL) é ignorado, não rebenta', () => {
  const id = pairedDevice(null);
  assert.doesNotThrow(() => watchdogTick(30));
  assert.equal(offlineAlertCount(id), 0);
});

test('dispositivo por emparelhar (token_hash NULL) é ignorado mesmo com last_seen_at antigo', () => {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO devices (name, last_seen_at, created_at) VALUES (?,?,?)`)
    .run('Por emparelhar', now() - 60 * 60_000, now());
  const id = Number(lastInsertRowid);
  watchdogTick(30);
  assert.equal(offlineAlertCount(id), 0);
});

test('duas passagens seguidas não duplicam o alerta — o anti-spam de 6h é de alerts.ts', () => {
  const id = pairedDevice(40);
  watchdogTick(30);
  watchdogTick(30);
  assert.equal(offlineAlertCount(id), 1);
});
