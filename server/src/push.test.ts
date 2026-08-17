import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET ??= 'segredo-de-teste-não-usar-em-produção';
delete process.env.FCM_SERVICE_ACCOUNT;

const { accessTokenAssertion, buildMessage, forgetServiceAccount, notifyCaregivers, pushBody } = await import(
  './push.js'
);
const { db, now, ALERT_TYPES } = await import('./db.js');

test('sem FCM_SERVICE_ACCOUNT, o push é um nada silencioso — não rebenta nem apaga tokens', async () => {
  forgetServiceAccount();
  db.prepare(`INSERT INTO caregivers (email, password_hash, name, fcm_token, created_at) VALUES (?,?,?,?,?)`).run(
    'push@exemplo.pt',
    'hash',
    'Eu',
    'token-fcm',
    now(),
  );
  const { lastInsertRowid } = db.prepare(`INSERT INTO devices (name, created_at) VALUES (?,?)`).run('Maria', now());

  // Não pode lançar: isto é chamado em fire-and-forget a partir de createAlert.
  await notifyCaregivers({
    id: 1,
    device_id: Number(lastInsertRowid),
    type: 'sos',
    lat: null,
    lon: null,
    note: null,
    recorded_at: now(),
    received_at: now(),
  });

  const row = db.prepare(`SELECT fcm_token FROM caregivers WHERE email = ?`).get('push@exemplo.pt') as {
    fcm_token: string | null;
  };
  assert.equal(row.fcm_token, 'token-fcm', 'sem credenciais não se mexe nos tokens de ninguém');
});

test('todos os tipos de alerta têm uma frase — nenhum cai em undefined', () => {
  for (const type of ALERT_TYPES) {
    const body = pushBody(type, 'Maria');
    assert.ok(body.length > 0, `${type} sem frase`);
    assert.ok(body.includes('Maria'), `${type} não diz de quem se trata`);
  }
});

test('um SOS fica no ecrã até alguém lhe tocar; um aviso de bateria não', () => {
  const sos = buildMessage({ id: 7, type: 'sos' }, 'Maria', 'tok') as {
    message: { notification: { title: string }; webpush: { headers: { Urgency: string }; notification: { requireInteraction: boolean; tag: string } } };
  };
  assert.equal(sos.message.notification.title, 'SOS');
  assert.equal(sos.message.webpush.notification.requireInteraction, true);
  assert.equal(sos.message.webpush.headers.Urgency, 'high');
  assert.equal(sos.message.webpush.notification.tag, 'alerta-7');

  const bateria = buildMessage({ id: 8, type: 'low_battery' }, 'Maria', 'tok') as {
    message: { webpush: { headers: { Urgency: string }; notification: { requireInteraction: boolean } } };
  };
  assert.equal(bateria.message.webpush.notification.requireInteraction, false);
  assert.equal(bateria.message.webpush.headers.Urgency, 'normal');
});

test('a asserção para a Google é um JWT RS256 com o público certo', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const assertion = accessTokenAssertion(
    { client_email: 'robot@projeto.iam.gserviceaccount.com', private_key: privateKey, project_id: 'projeto' },
    1_700_000_000,
  );

  // Verificar com a chave pública prova que foi mesmo assinada em RS256 — um
  // HS256 acidental (o erro clássico) não passaria aqui. O `iat` é fixo para
  // o `exp` ser verificável, logo a validade tem de ser ignorada; é o próprio
  // `exp` que se confirma a seguir.
  const payload = jwt.verify(assertion, publicKey, {
    algorithms: ['RS256'],
    ignoreExpiration: true,
  }) as Record<string, unknown>;
  assert.equal(payload.iss, 'robot@projeto.iam.gserviceaccount.com');
  assert.equal(payload.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(payload.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(payload.iat, 1_700_000_000);
  assert.equal(payload.exp, 1_700_003_600);
});
