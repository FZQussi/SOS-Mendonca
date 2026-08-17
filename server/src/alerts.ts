import { db, now, type AlertType } from './db.js';
import { broadcast } from './broadcast.js';
import { notifyCaregivers } from './push.js';

/**
 * Janelas de anti-spam por tipo (Context.md §5, princípio 4: "alertar de mais
 * é falhar"). Tipos fora deste mapa — `sos`, `fall`, `geofence` — nunca são
 * suprimidos. `device_offline` só é criado pelo watchdog (ainda por fazer),
 * mas a janela já fica reservada aqui para não ficar por decidir mais tarde.
 */
const ANTI_SPAM_WINDOW_MS: Partial<Record<AlertType, number>> = {
  low_battery: 60 * 60_000,
  device_offline: 6 * 60 * 60_000,
};

export interface NewAlert {
  deviceId: number;
  type: AlertType;
  lat?: number | null;
  lon?: number | null;
  note?: string | null;
  recordedAt?: number;
}

export interface AlertRow {
  id: number;
  device_id: number;
  type: AlertType;
  lat: number | null;
  lon: number | null;
  note: string | null;
  recorded_at: number;
  received_at: number;
}

/**
 * Único caminho para criar um alerta. Devolve `null` sem gravar nada quando o
 * anti-spam suprime — usar sempre esta função em vez de um INSERT direto nas
 * rotas, para a regra "SOS nunca é suprimido" viver num só sítio e não se
 * poder esquecer numa rota nova.
 */
export function createAlert(input: NewAlert): AlertRow | null {
  const window = ANTI_SPAM_WINDOW_MS[input.type];
  if (window !== undefined) {
    const since = now() - window;
    const recent = db
      .prepare(`SELECT 1 FROM alerts WHERE device_id = ? AND type = ? AND recorded_at >= ? LIMIT 1`)
      .get(input.deviceId, input.type, since);
    if (recent) return null;
  }

  const recordedAt = input.recordedAt ?? now();
  const receivedAt = now();
  const lat = input.lat ?? null;
  const lon = input.lon ?? null;
  const note = input.note ?? null;

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO alerts (device_id, type, lat, lon, note, recorded_at, received_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(input.deviceId, input.type, lat, lon, note, recordedAt, receivedAt);

  const row: AlertRow = {
    id: Number(lastInsertRowid),
    device_id: input.deviceId,
    type: input.type,
    lat,
    lon,
    note,
    recorded_at: recordedAt,
    received_at: receivedAt,
  };
  broadcast({ event: 'alert', data: row });
  // Fire-and-forget: o push passa pela rede até à Google e o SOS não pode
  // esperar por isso. `notifyCaregivers` não deixa escapar nenhum erro.
  void notifyCaregivers(row);
  return row;
}
