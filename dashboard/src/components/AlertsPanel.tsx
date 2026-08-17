import { useState } from 'react';
import { api, ApiError } from '../api';
import { clockTime, timeAgo } from '../format';
import { ALERT_LABEL, type Alert } from '../types';

interface AlertsPanelProps {
  open: Alert[];
  history: Alert[];
  historyLoaded: boolean;
  onLoadHistory: () => void;
  onAcked: (id: number) => void;
}

export function AlertsPanel({ open, history, historyLoaded, onLoadHistory, onAcked }: AlertsPanelProps) {
  const [tab, setTab] = useState<'abertos' | 'historico'>('abertos');
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectHistory() {
    setTab('historico');
    if (!historyLoaded) onLoadHistory();
  }

  async function ack(id: number) {
    setError(null);
    setAckingId(id);
    try {
      await api.ackAlert(id);
      onAcked(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar o alerta.');
    } finally {
      setAckingId(null);
    }
  }

  const list = tab === 'abertos' ? open : history;

  return (
    <div className="card alerts-card">
      <div className="card__header">
        <span className="card__title">Alertas</span>
        {open.length > 0 && tab !== 'abertos' && (
          <span className="alert-meta">{open.length} em aberto</span>
        )}
      </div>

      <div className="alerts-tabs" role="tablist">
        <button role="tab" aria-current={tab === 'abertos'} onClick={() => setTab('abertos')}>
          Abertos{open.length > 0 ? ` (${open.length})` : ''}
        </button>
        <button role="tab" aria-current={tab === 'historico'} onClick={selectHistory}>
          Histórico
        </button>
      </div>

      {error && <p className="error-text" style={{ margin: '12px 24px 0' }}>{error}</p>}

      {list.length === 0 ? (
        <p className="alerts-empty">
          {tab === 'abertos' ? 'Sem alertas por confirmar.' : 'Ainda sem histórico.'}
        </p>
      ) : (
        <ul className="alerts-list">
          {list.map((alert) => (
            <li key={alert.id} className={`alert-row ${alert.acked_at ? '' : 'alert-row--open'}`}>
              <span className="alert-dot" />
              <div className="alert-body">
                <div className="alert-type">{ALERT_LABEL[alert.type]}</div>
                <div className="alert-meta">
                  {alert.device_name} · {timeAgo(alert.recorded_at)} · <span className="mono">{clockTime(alert.recorded_at)}</span>
                </div>
                {alert.acked_at ? (
                  <div className="alert-ack">Confirmado {timeAgo(alert.acked_at)}</div>
                ) : (
                  <button
                    className="button button--ghost"
                    style={{ marginTop: 8, padding: '6px 14px', fontSize: '0.85rem' }}
                    disabled={ackingId === alert.id}
                    onClick={() => ack(alert.id)}
                  >
                    {ackingId === alert.id ? 'A confirmar…' : 'Confirmar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
