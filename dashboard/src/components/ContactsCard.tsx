import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';

/** O servidor recusa mais do que isto (`contactsBodySchema`). */
const MAX_CONTACTS = 10;

interface Draft {
  name: string;
  phone: string;
}

/**
 * Onde o cuidador manda em quem o SOS liga. A prioridade não é um campo — é a
 * ordem das linhas, que é como as pessoas já pensam nisto ("primeiro a Rita,
 * depois o João"). O telemóvel do idoso só vê a lista, nunca a edita.
 */
export function ContactsCard({ deviceId }: { deviceId: number }) {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setSaved(false);
    setError(null);
    api
      .contacts(deviceId)
      .then((r) => {
        if (!cancelled) setRows(r.contacts.map((c) => ({ name: c.name, phone: c.phone })));
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os contactos.');
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  function update(index: number, patch: Partial<Draft>) {
    setSaved(false);
    setRows((prev) => prev?.map((row, i) => (i === index ? { ...row, ...patch } : row)) ?? prev);
  }

  function remove(index: number) {
    setSaved(false);
    setRows((prev) => prev?.filter((_, i) => i !== index) ?? prev);
  }

  function add() {
    setSaved(false);
    setRows((prev) => [...(prev ?? []), { name: '', phone: '' }]);
  }

  async function save() {
    if (!rows) return;
    setError(null);
    setSaving(true);
    try {
      // A prioridade sai da ordem em que estão no ecrã.
      const payload = rows.map((row, i) => ({ name: row.name.trim(), phone: row.phone.trim(), priority: i + 1 }));
      const { contacts } = await api.saveContacts(deviceId, payload);
      setRows(contacts.map((c) => ({ name: c.name, phone: c.phone })));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível guardar os contactos.');
    } finally {
      setSaving(false);
    }
  }

  // O servidor exige nome e um telefone de pelo menos 3 caracteres — o 112
  // também é um contacto legítimo, por isso não se pede um número de 9 dígitos.
  const valid = rows?.every((r) => r.name.trim().length > 0 && r.phone.trim().length >= 3) ?? false;

  return (
    <div className="card contacts-card">
      <div className="card__header">
        <span className="card__title">Quem ligar</span>
        {rows && rows.length > 0 && <span className="alert-meta">{rows.length} de {MAX_CONTACTS}</span>}
      </div>

      {rows === null ? (
        <p className="alerts-empty">A carregar…</p>
      ) : (
        <div className="contacts-body">
          {rows.length === 0 ? (
            <p className="contacts-empty">
              Ainda ninguém. Sem contactos, o botão SOS avisa a família mas não liga a ninguém.
            </p>
          ) : (
            <ol className="contacts-list">
              {rows.map((row, i) => (
                <li key={i} className="contact-row">
                  <span className="contact-order" aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    aria-label={`Nome do contacto ${i + 1}`}
                    placeholder="Nome"
                    value={row.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                  <input
                    aria-label={`Telefone do contacto ${i + 1}`}
                    placeholder="912 345 678"
                    inputMode="tel"
                    className="mono"
                    value={row.phone}
                    onChange={(e) => update(i, { phone: e.target.value })}
                  />
                  <button
                    className="link-button"
                    aria-label={`Remover ${row.name || `contacto ${i + 1}`}`}
                    onClick={() => remove(i)}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ol>
          )}

          <p className="contacts-hint">
            O primeiro da lista é quem o SOS liga. O telemóvel guarda a última lista que recebeu, por isso
            apagar todos não o deixa sem ninguém — muda-os em vez de os apagar.
          </p>

          {error && <p className="error-text">{error}</p>}
          {saved && <p className="contacts-saved">Guardado. O telemóvel recebe a lista nova dentro de 15 minutos.</p>}

          <div className="contacts-actions">
            <button className="button button--ghost" onClick={add} disabled={rows.length >= MAX_CONTACTS}>
              Adicionar
            </button>
            <button className="button button--primary" onClick={save} disabled={saving || !valid}>
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
