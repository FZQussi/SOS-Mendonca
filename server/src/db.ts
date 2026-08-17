import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

/**
 * Tempos são INTEGER com milissegundos desde a época (`Date.now()`). O SQLite
 * não tem tipo de data; inteiros ordenam corretamente, não têm fuso horário e
 * chegam do JavaScript sem conversão.
 */
export const now = () => Date.now();

export const ALERT_TYPES = ['sos', 'fall', 'low_battery', 'device_offline', 'geofence'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS caregivers (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  fcm_token     TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id                 INTEGER PRIMARY KEY,
  name               TEXT    NOT NULL,
  -- Só o hash SHA-256 do token opaco. O token em claro existe uma única vez,
  -- na resposta ao emparelhamento, e nunca mais (Context.md §7).
  token_hash         TEXT    UNIQUE,
  pairing_code       TEXT    UNIQUE,
  pairing_expires_at INTEGER,
  battery_pct        INTEGER,
  last_seen_at       INTEGER,
  created_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY,
  device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  lat         REAL    NOT NULL,
  lon         REAL    NOT NULL,
  accuracy_m  REAL,
  battery_pct INTEGER,
  -- recorded_at = hora no telemóvel, received_at = hora de chegada ao servidor.
  -- Divergem quando a fila offline reenvia um lote (Context.md §6).
  recorded_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY,
  device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('sos','fall','low_battery','device_offline','geofence')),
  lat         REAL,
  lon         REAL,
  note        TEXT,
  recorded_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  acked_by    INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  acked_at    INTEGER,
  -- Confirmado é quem confirmou e quando, em conjunto. Um sem o outro seria um
  -- alerta tratado por ninguém, ou por alguém em momento nenhum.
  CHECK ((acked_by IS NULL) = (acked_at IS NULL))
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id        INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  phone     TEXT    NOT NULL,
  priority  INTEGER NOT NULL DEFAULT 1
);

-- O percurso lê-se sempre por recorded_at DESC; ordenar por received_at
-- mostra-o trocado quando a fila offline reenvia (Context.md §6).
CREATE INDEX IF NOT EXISTS idx_locations_device_time
  ON locations (device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_device_time
  ON alerts (device_id, recorded_at DESC);

-- Anti-spam: "houve alerta deste tipo neste dispositivo na última hora?"
CREATE INDEX IF NOT EXISTS idx_alerts_device_type_time
  ON alerts (device_id, type, recorded_at DESC);

-- O painel abre sempre em GET /alerts?open=true. Índice parcial: só as linhas
-- por confirmar, que são poucas mesmo quando a tabela cresce.
CREATE INDEX IF NOT EXISTS idx_alerts_open
  ON alerts (recorded_at DESC) WHERE acked_at IS NULL;

-- O watchdog varre dispositivos por last_seen_at.
CREATE INDEX IF NOT EXISTS idx_devices_last_seen
  ON devices (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_contacts_device
  ON emergency_contacts (device_id, priority);
`;

/**
 * Acrescenta uma coluna a uma tabela que já existe.
 *
 * O `CREATE TABLE IF NOT EXISTS` acima não altera tabelas criadas antes — uma
 * coluna nova só aparece numa base de dados já em uso se for adicionada aqui
 * (Context.md §6). No Pi há dados a sério; apagar o ficheiro não é opção.
 */
export function addColumn(db: DB, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrate(db: DB): void {
  db.exec(SCHEMA);
  // Migrações futuras entram aqui, com addColumn(). Exemplo:
  //   addColumn(db, 'devices', 'app_version', 'TEXT');
}

export function openDatabase(file = process.env.DB_PATH ?? 'data/sos.db'): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  // WAL: leitores não bloqueiam o escritor. Num Pi com cartão SD também reduz
  // as escritas, que é o que gasta o cartão.
  db.pragma('journal_mode = WAL');
  // O SQLite tem as chaves estrangeiras desligadas por omissão, e é por ligação.
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export const db = openDatabase();
