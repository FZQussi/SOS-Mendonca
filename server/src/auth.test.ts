import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { DB } from './db.js';

// auth.ts importa `db` de './db.js' ao nível do módulo — abrir o ficheiro real
// exigiria uma BD em disco só para testes. DB_PATH tem de estar definido
// *antes* do import, para que openDatabase() (chamada sem argumentos em
// db.ts) apanhe ':memory:' como valor por omissão.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET ??= 'segredo-de-teste-não-usar-em-produção';

const { db: testDb, now } = await import('./db.js');
const {
  generateDeviceToken,
  hashToken,
  generatePairingCode,
  pairingExpiresAt,
  hashPassword,
  verifyPassword,
  signCaregiverToken,
  requireDevice,
  requireCaregiver,
} = await import('./auth.js');

function insertDevice(db: DB, tokenHash: string | null): number {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO devices (name, token_hash, created_at) VALUES (?, ?, ?)`)
    .run('Telemóvel da Maria', tokenHash, now());
  return Number(lastInsertRowid);
}

let caregiverSeq = 0;

/** Email único por chamada — os testes partilham uma só BD em memória. */
function insertCaregiver(db: DB): { id: number; email: string } {
  const email = `cuidador-${++caregiverSeq}@exemplo.pt`;
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO caregivers (email, password_hash, name, created_at) VALUES (?,?,?,?)`)
    .run(email, hashPassword('correcta'), 'Eu', now());
  return { id: Number(lastInsertRowid), email };
}

/** req/res mínimos para exercitar middleware sem correr um servidor a sério. */
function mockReqRes(authHeader?: string) {
  const req = { headers: { authorization: authHeader } } as unknown as Request;
  let statusCode: number | undefined;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, result: () => ({ statusCode, body, nextCalled }) };
}

// --- token de dispositivo ------------------------------------------------------

test('token de dispositivo tem 64 hex e nunca se repete', () => {
  const a = generateDeviceToken();
  const b = generateDeviceToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test('hashToken é determinístico e não reversível à vista', () => {
  const token = generateDeviceToken();
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
});

test('código de emparelhamento tem sempre 6 dígitos, com zeros à esquerda', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generatePairingCode(), /^\d{6}$/);
  }
});

test('validade do código de emparelhamento é no futuro', () => {
  assert.ok(pairingExpiresAt() > now());
});

// --- password de cuidador -------------------------------------------------------

test('hashPassword nunca guarda a password em claro, verifyPassword confirma-a', () => {
  const hash = hashPassword('correcta');
  assert.notEqual(hash, 'correcta');
  assert.ok(verifyPassword('correcta', hash));
  assert.ok(!verifyPassword('errada', hash));
});

// --- requireDevice ---------------------------------------------------------------

test('requireDevice: sem cabeçalho Authorization → 401', () => {
  const { req, res, next, result } = mockReqRes(undefined);
  requireDevice(req, res, next);
  assert.equal(result().statusCode, 401);
  assert.equal(result().nextCalled, false);
});

test('requireDevice: token que não bate com nenhum hash → 401', () => {
  const { req, res, next, result } = mockReqRes(`Bearer ${generateDeviceToken()}`);
  requireDevice(req, res, next);
  assert.equal(result().statusCode, 401);
});

test('requireDevice: token correto → passa e identifica o dispositivo', () => {
  const token = generateDeviceToken();
  const deviceId = insertDevice(testDb, hashToken(token));

  const { req, res, next, result } = mockReqRes(`Bearer ${token}`);
  requireDevice(req, res, next);

  assert.equal(result().nextCalled, true);
  assert.equal(req.device?.id, deviceId);
  assert.equal(req.device?.name, 'Telemóvel da Maria');
});

test('requireDevice: dispositivo por emparelhar (token_hash NULL) não autentica com nada', () => {
  insertDevice(testDb, null);
  const { req, res, next } = mockReqRes(`Bearer ${generateDeviceToken()}`);
  requireDevice(req, res, next);
  assert.equal(req.device, undefined);
});

// --- requireCaregiver --------------------------------------------------------------

test('requireCaregiver: sem cabeçalho → 401', () => {
  const { req, res, next, result } = mockReqRes(undefined);
  requireCaregiver(req, res, next);
  assert.equal(result().statusCode, 401);
});

test('requireCaregiver: JWT válido de cuidador que já não existe → 401', () => {
  const fakeId = 999999;
  const token = signCaregiverToken(fakeId);
  const { req, res, next, result } = mockReqRes(`Bearer ${token}`);
  requireCaregiver(req, res, next);
  assert.equal(result().statusCode, 401);
});

test('requireCaregiver: token adulterado → 401', () => {
  const { id } = insertCaregiver(testDb);
  const token = signCaregiverToken(id);
  const adulterado = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
  const { req, res, next, result } = mockReqRes(`Bearer ${adulterado}`);
  requireCaregiver(req, res, next);
  assert.equal(result().statusCode, 401);
});

test('requireCaregiver: token correto → passa e identifica o cuidador', () => {
  const { id, email } = insertCaregiver(testDb);
  const token = signCaregiverToken(id);

  const { req, res, next, result } = mockReqRes(`Bearer ${token}`);
  requireCaregiver(req, res, next);

  assert.equal(result().nextCalled, true);
  assert.equal(req.caregiver?.id, id);
  assert.equal(req.caregiver?.email, email);
});
