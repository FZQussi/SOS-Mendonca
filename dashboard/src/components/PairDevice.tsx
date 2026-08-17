import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

export function PairDevice({ onCreated }: { onCreated: (pairingCode: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { pairing_code } = await api.createDevice(name);
      onCreated(pairing_code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o dispositivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pairing-card">
      <div className="pairing-card__title">Ainda não há nenhum telemóvel emparelhado</div>
      <p className="pairing-card__body">Dê um nome ao dispositivo — por exemplo, "Telemóvel da Maria".</p>
      <form onSubmit={submit} className="pairing-inline">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Telemóvel da…"
          required
          aria-label="Nome do dispositivo"
        />
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? 'Um momento…' : 'Criar'}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
