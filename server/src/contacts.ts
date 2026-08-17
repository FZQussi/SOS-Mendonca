import { db } from './db.js';

export interface Contact {
  name: string;
  phone: string;
  priority: number;
}

export interface ContactRow extends Contact {
  id: number;
}

/**
 * Único caminho para escrever contactos, pelo mesmo motivo de `alerts.ts`:
 * escreve-se a partir de dois mundos — o onboarding da app (`PUT
 * /device/contacts`) e o painel do cuidador (`PUT /devices/:id/contacts`) —
 * e a regra "substitui a lista toda" não pode viver em duas rotas.
 *
 * Substituir em vez de fazer merge é deliberado: a lista é curta e ordenada
 * por prioridade, e um merge por nome tornaria impossível apagar alguém.
 */
export function replaceContacts(deviceId: number, contacts: Contact[]): void {
  const replace = db.transaction((rows: Contact[]) => {
    db.prepare(`DELETE FROM emergency_contacts WHERE device_id = ?`).run(deviceId);
    const insert = db.prepare(
      `INSERT INTO emergency_contacts (device_id, name, phone, priority) VALUES (?,?,?,?)`,
    );
    for (const c of rows) insert.run(deviceId, c.name, c.phone, c.priority);
  });
  replace(contacts);
}

/** Ordenados por prioridade — o primeiro é quem o SOS liga (Context.md §3). */
export function listContacts(deviceId: number): ContactRow[] {
  return db
    .prepare(`SELECT id, name, phone, priority FROM emergency_contacts WHERE device_id = ? ORDER BY priority`)
    .all(deviceId) as ContactRow[];
}
