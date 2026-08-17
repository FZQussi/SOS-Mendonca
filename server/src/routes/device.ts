import { Router, type NextFunction, type Request, type Response } from 'express';
import { db, now, type AlertType } from '../db.js';
import {
  forgetFailures,
  generateDeviceToken,
  hashToken,
  PAIR_MAX_FAILURES,
  recordFailure,
  requireDevice,
  tooManyFailures,
} from '../auth.js';
import { createAlert } from '../alerts.js';
import { listContacts, replaceContacts } from '../contacts.js';
import { broadcast } from '../broadcast.js';
import {
  alertBodySchema,
  contactsBodySchema,
  heartbeatBodySchema,
  locationsBodySchema,
  pairSchema,
  validateBody,
} from '../schemas.js';

/**
 * Rotas do mundo do dispositivo (Context.md §7): token opaco, nunca login.
 * Montadas em `/api/v1/device`.
 */
export const deviceRoutes = Router();

/** Aceita `1.2.3`, `1.2.3-beta.1` e pouco mais. O resto ignora-se. */
const APP_VERSION_RE = /^[\w.+-]{1,30}$/;

/**
 * Guarda a versão da app que fez o pedido (`X-SOS-App-Version`, Context.md
 * §9). Sem isto, uma OTA que parta o seguimento num telemóvel e não noutro é
 * impossível de diagnosticar à distância.
 *
 * Corre a seguir ao `requireDevice`, que é quem põe `req.device`. Um cabeçalho
 * em falta ou estranho não é erro: a app antiga fica semanas no telemóvel e
 * não pode deixar de funcionar por causa disto (compatibilidade só para a
 * frente). Só escreve quando muda — são pedidos a toda a hora e o cartão SD
 * do Pi agradece.
 */
export function recordAppVersion(req: Request, _res: Response, next: NextFunction): void {
  const version = req.headers['x-sos-app-version'];
  if (typeof version === 'string' && APP_VERSION_RE.test(version) && req.device) {
    db.prepare(
      `UPDATE devices SET app_version = ?
       WHERE id = ? AND (app_version IS NULL OR app_version != ?)`,
    ).run(version, req.device.id, version);
  }
  next();
}

deviceRoutes.post('/pair', validateBody(pairSchema), (req, res) => {
  // Chave global, não por código: quem ataca varia o código a cada tentativa,
  // por isso contá-los em separado não travava nada. Emparelhar é um gesto
  // raro — uma pessoa a escrever um código não chega perto de 20 falhas.
  const PAIR_KEY = 'pair';
  if (tooManyFailures(PAIR_KEY, PAIR_MAX_FAILURES)) {
    res.status(429).json({ error: 'Demasiadas tentativas. Espere um pouco e tente outra vez.' });
    return;
  }

  const { code } = req.body as { code: string };
  const token = generateDeviceToken();
  const tokenHash = hashToken(token);

  // Ler o código e gravar o token na mesma transação: duas chamadas
  // concorrentes com o mesmo código não podem emparelhar os dois.
  const paired = db.transaction(() => {
    const device = db
      .prepare(`SELECT id, name FROM devices WHERE pairing_code = ? AND pairing_expires_at > ?`)
      .get(code, now()) as { id: number; name: string } | undefined;
    if (!device) return null;

    db.prepare(
      `UPDATE devices SET token_hash = ?, pairing_code = NULL, pairing_expires_at = NULL WHERE id = ?`,
    ).run(tokenHash, device.id);
    return device;
  })();

  if (!paired) {
    recordFailure(PAIR_KEY);
    res.status(401).json({ error: 'código inválido ou expirado' });
    return;
  }

  forgetFailures(PAIR_KEY);
  // O token em claro existe só aqui — nunca mais é recuperável (Context.md §7).
  res.json({ token, device: paired });
});

deviceRoutes.post('/locations', requireDevice, recordAppVersion, validateBody(locationsBodySchema), (req, res) => {
  const device = req.device!;
  const points = Array.isArray(req.body) ? req.body : [req.body];
  const receivedAt = now();

  const insert = db.prepare(
    `INSERT INTO locations (device_id, lat, lon, accuracy_m, battery_pct, recorded_at, received_at)
     VALUES (?,?,?,?,?,?,?)`,
  );
  const insertAll = db.transaction((rows: typeof points) => {
    for (const p of rows) {
      insert.run(device.id, p.lat, p.lon, p.accuracy_m ?? null, p.battery_pct ?? null, p.recorded_at, receivedAt);
    }
  });
  insertAll(points);

  db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(receivedAt, device.id);

  // Só o último ponto — o painel quer saber "onde está agora", não reproduzir
  // o lote inteiro que a fila offline possa ter reenviado (Context.md §7).
  const latest = points[points.length - 1];
  broadcast({
    event: 'location',
    data: { device_id: device.id, lat: latest.lat, lon: latest.lon, recorded_at: latest.recorded_at },
  });

  res.json({ saved: points.length });
});

deviceRoutes.post('/alerts', requireDevice, recordAppVersion, validateBody(alertBodySchema), (req, res) => {
  const device = req.device!;
  const body = req.body as { type: AlertType; lat?: number; lon?: number; note?: string; recorded_at?: number };

  const alert = createAlert({
    deviceId: device.id,
    type: body.type,
    lat: body.lat,
    lon: body.lon,
    note: body.note,
    recordedAt: body.recorded_at,
  });

  db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(now(), device.id);

  if (!alert) {
    // Suprimido pelo anti-spam. Não é erro — o dispositivo não deve repetir.
    res.json({ suppressed: true });
    return;
  }
  res.json({ id: alert.id });
});

deviceRoutes.post('/heartbeat', requireDevice, recordAppVersion, validateBody(heartbeatBodySchema), (req, res) => {
  const device = req.device!;
  const { battery_pct } = req.body as { battery_pct: number };
  db.prepare(`UPDATE devices SET battery_pct = ?, last_seen_at = ? WHERE id = ?`).run(battery_pct, now(), device.id);
  res.json({ ok: true });
});

/**
 * O servidor é a origem da verdade dos contactos, não o telemóvel: quem os
 * edita é o cuidador, no painel (ROADMAP §1.1 — a app vê, não edita). A app
 * lê isto de tempo a tempo e guarda uma cópia local, porque no momento do SOS
 * não pode depender de haver rede (princípio 2).
 */
deviceRoutes.get('/contacts', requireDevice, recordAppVersion, (req, res) => {
  res.json({ contacts: listContacts(req.device!.id) });
});

/**
 * Continua a existir só para o onboarding: a app escreve aqui o primeiro
 * contacto, antes de o cuidador ter aberto o painel. A partir daí o sentido é
 * o contrário — o `GET` acima.
 */
deviceRoutes.put('/contacts', requireDevice, recordAppVersion, validateBody(contactsBodySchema), (req, res) => {
  const device = req.device!;
  replaceContacts(device.id, req.body as { name: string; phone: string; priority: number }[]);
  res.json({ contacts: listContacts(device.id) });
});
