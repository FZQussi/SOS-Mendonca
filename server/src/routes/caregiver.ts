import { Router } from 'express';
import { db, now } from '../db.js';
import { generatePairingCode, hashPassword, pairingExpiresAt, requireCaregiver, signCaregiverToken, verifyPassword } from '../auth.js';
import { broadcast } from '../broadcast.js';
import {
  createDeviceBodySchema,
  fcmTokenBodySchema,
  loginBodySchema,
  registerBodySchema,
  validateBody,
} from '../schemas.js';

/**
 * Rotas do mundo do cuidador (Context.md §7): email/password + JWT.
 * Montadas em `/api/v1`.
 */
export const caregiverRoutes = Router();

// --- conta -------------------------------------------------------------------

caregiverRoutes.post('/auth/register', validateBody(registerBodySchema), (req, res) => {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM caregivers`).get() as { count: number };
  if (count > 0) {
    res.status(403).json({ error: 'o registo já está fechado' });
    return;
  }

  const { email, password, name } = req.body as { email: string; password: string; name: string };
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO caregivers (email, password_hash, name, created_at) VALUES (?,?,?,?)`)
    .run(email, hashPassword(password), name, now());

  // Auto-login: obrigar a um segundo pedido logo a seguir ao registo não
  // protegeria nada, só atrasaria quem acabou de criar a única conta que existe.
  res.status(201).json({ token: signCaregiverToken(Number(lastInsertRowid)), name });
});

caregiverRoutes.post('/auth/login', validateBody(loginBodySchema), (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const row = db.prepare(`SELECT id, password_hash, name FROM caregivers WHERE email = ?`).get(email) as
    | { id: number; password_hash: string; name: string }
    | undefined;

  // Mensagem igual para email desconhecido ou password errada — não dizer
  // qual das duas falhou evita confirmar a um atacante que o email existe.
  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'credenciais inválidas' });
    return;
  }
  res.json({ token: signCaregiverToken(row.id), name: row.name });
});

caregiverRoutes.put('/me/fcm-token', requireCaregiver, validateBody(fcmTokenBodySchema), (req, res) => {
  const caregiver = req.caregiver!;
  const { token } = req.body as { token: string };
  db.prepare(`UPDATE caregivers SET fcm_token = ? WHERE id = ?`).run(token, caregiver.id);
  res.json({ ok: true });
});

// --- dispositivos --------------------------------------------------------------

caregiverRoutes.post('/devices', requireCaregiver, validateBody(createDeviceBodySchema), (req, res) => {
  const { name } = req.body as { name: string };

  // Colisão do código de 6 dígitos é rara mas o UNIQUE existe por algo —
  // tenta outra vez em vez de deixar o pedido cair com 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const pairingCode = generatePairingCode();
    try {
      db.prepare(
        `INSERT INTO devices (name, pairing_code, pairing_expires_at, created_at) VALUES (?,?,?,?)`,
      ).run(name, pairingCode, pairingExpiresAt(), now());
      res.status(201).json({ pairing_code: pairingCode });
      return;
    } catch (err) {
      const isCollision = err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
      if (!isCollision || attempt === 4) throw err;
    }
  }
});

caregiverRoutes.get('/devices', requireCaregiver, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
         d.id, d.name, d.battery_pct, d.last_seen_at, d.created_at,
         d.pairing_code,
         (d.token_hash IS NOT NULL) AS paired,
         (SELECT lat FROM locations l WHERE l.device_id = d.id ORDER BY l.recorded_at DESC LIMIT 1) AS last_lat,
         (SELECT lon FROM locations l WHERE l.device_id = d.id ORDER BY l.recorded_at DESC LIMIT 1) AS last_lon,
         (SELECT recorded_at FROM locations l WHERE l.device_id = d.id ORDER BY l.recorded_at DESC LIMIT 1) AS last_recorded_at
       FROM devices d
       ORDER BY d.name COLLATE NOCASE`,
    )
    .all() as Record<string, unknown>[];

  res.json({ devices: rows.map((r) => ({ ...r, paired: Boolean(r.paired) })) });
});

caregiverRoutes.get('/devices/:id/locations', requireCaregiver, (req, res) => {
  const deviceId = Number(req.params.id);
  if (!Number.isInteger(deviceId)) {
    res.status(400).json({ error: 'id de dispositivo inválido' });
    return;
  }

  const hoursParam = Number(req.query.hours);
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 24;
  const since = now() - hours * 3600_000;

  const rows = db
    .prepare(
      `SELECT lat, lon, accuracy_m, battery_pct, recorded_at
       FROM locations WHERE device_id = ? AND recorded_at >= ?
       ORDER BY recorded_at DESC`,
    )
    .all(deviceId, since);
  res.json({ locations: rows });
});

caregiverRoutes.get('/devices/:id/contacts', requireCaregiver, (req, res) => {
  const deviceId = Number(req.params.id);
  if (!Number.isInteger(deviceId)) {
    res.status(400).json({ error: 'id de dispositivo inválido' });
    return;
  }

  const rows = db
    .prepare(`SELECT id, name, phone, priority FROM emergency_contacts WHERE device_id = ? ORDER BY priority`)
    .all(deviceId);
  res.json({ contacts: rows });
});

// --- alertas ---------------------------------------------------------------------

caregiverRoutes.get('/alerts', requireCaregiver, (req, res) => {
  const openOnly = req.query.open === 'true';
  const rows = db
    .prepare(
      `SELECT a.id, a.device_id, d.name AS device_name, a.type, a.lat, a.lon, a.note,
              a.recorded_at, a.received_at, a.acked_by, a.acked_at
       FROM alerts a JOIN devices d ON d.id = a.device_id
       ${openOnly ? 'WHERE a.acked_at IS NULL' : ''}
       ORDER BY a.recorded_at DESC
       LIMIT 200`,
    )
    .all();
  res.json({ alerts: rows });
});

caregiverRoutes.post('/alerts/:id/ack', requireCaregiver, (req, res) => {
  const caregiver = req.caregiver!;
  const alertId = Number(req.params.id);
  if (!Number.isInteger(alertId)) {
    res.status(400).json({ error: 'id de alerta inválido' });
    return;
  }

  const existing = db.prepare(`SELECT acked_at FROM alerts WHERE id = ?`).get(alertId) as
    | { acked_at: number | null }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'alerta não encontrado' });
    return;
  }
  if (existing.acked_at !== null) {
    res.status(409).json({ error: 'alerta já confirmado' });
    return;
  }

  const ackedAt = now();
  db.prepare(`UPDATE alerts SET acked_by = ?, acked_at = ? WHERE id = ?`).run(caregiver.id, ackedAt, alertId);
  // Não é um INSERT, mas outros cuidadores a ver o painel em tempo real
  // precisam de saber que já foi tratado — reutiliza-se o mesmo evento.
  broadcast({ event: 'alert', data: { id: alertId, acked_by: caregiver.id, acked_at: ackedAt } });
  res.json({ ok: true });
});
