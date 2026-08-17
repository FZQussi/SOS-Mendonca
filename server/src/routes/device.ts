import { Router } from 'express';
import { db, now, type AlertType } from '../db.js';
import { generateDeviceToken, hashToken, requireDevice } from '../auth.js';
import { createAlert } from '../alerts.js';
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

deviceRoutes.post('/pair', validateBody(pairSchema), (req, res) => {
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
    res.status(401).json({ error: 'código inválido ou expirado' });
    return;
  }
  // O token em claro existe só aqui — nunca mais é recuperável (Context.md §7).
  res.json({ token, device: paired });
});

deviceRoutes.post('/locations', requireDevice, validateBody(locationsBodySchema), (req, res) => {
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

deviceRoutes.post('/alerts', requireDevice, validateBody(alertBodySchema), (req, res) => {
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

deviceRoutes.post('/heartbeat', requireDevice, validateBody(heartbeatBodySchema), (req, res) => {
  const device = req.device!;
  const { battery_pct } = req.body as { battery_pct: number };
  db.prepare(`UPDATE devices SET battery_pct = ?, last_seen_at = ? WHERE id = ?`).run(battery_pct, now(), device.id);
  res.json({ ok: true });
});

deviceRoutes.put('/contacts', requireDevice, validateBody(contactsBodySchema), (req, res) => {
  const device = req.device!;
  const contacts = req.body as { name: string; phone: string; priority: number }[];

  const replace = db.transaction((rows: typeof contacts) => {
    db.prepare(`DELETE FROM emergency_contacts WHERE device_id = ?`).run(device.id);
    const insert = db.prepare(
      `INSERT INTO emergency_contacts (device_id, name, phone, priority) VALUES (?,?,?,?)`,
    );
    for (const c of rows) insert.run(device.id, c.name, c.phone, c.priority);
  });
  replace(contacts);

  res.json({ contacts });
});
