import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearSession, getCaregiverName, getToken } from './api';
import { connectWebSocket, type WsMessage } from './ws';
import { clockTime, timeAgo } from './format';
import { Pulse, type PulseState } from './components/Pulse';
import { DeviceMap } from './components/DeviceMap';
import { AlertsPanel } from './components/AlertsPanel';
import { ContactsCard } from './components/ContactsCard';
import { PairDevice } from './components/PairDevice';
import { PairingCode } from './components/PairingCode';
import { Login } from './components/Login';
import type { Alert, Device, LocationPoint } from './types';

// Quanto tempo sem sinal ainda conta como "está bem" no ecrã, antes do pulso
// apagar. É só o critério visual do painel — o alerta device_offline a sério
// só dispara aos WATCHDOG_MINUTES do servidor (30 por omissão).
const FRESH_WINDOW_MS = 3 * 60_000;

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!getToken());

  if (!loggedIn) {
    return <Login onLoggedIn={() => setLoggedIn(true)} />;
  }
  return <Dashboard onLoggedOut={() => setLoggedIn(false)} />;
}

function Dashboard({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [openAlerts, setOpenAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<Alert[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [signalTick, setSignalTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const { devices: list } = await api.devices();
    setDevices(list);
    setSelectedId((current) => current ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadDevices();
    api.alerts(true).then((r) => setOpenAlerts(r.alerts));
  }, [loadDevices]);

  useEffect(() => {
    if (selectedId == null) {
      setLocations([]);
      return;
    }
    api.locations(selectedId, 24).then((r) => setLocations(r.locations));
  }, [selectedId]);

  // O relógio local do "há X min" tem de avançar mesmo sem eventos novos —
  // senão "há 2 min" fica parado no ecrã enquanto o tempo passa a sério.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // O handler lê `selectedId` e `devices` através de refs, não das variáveis de
  // estado diretamente — o efeito liga-se uma única vez. Se dependesse delas,
  // trocar de dispositivo ou uma atualização de localização (que troca a
  // referência de `devices`) reabriria a ligação sem necessidade.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const devicesRef = useRef(devices);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    return connectWebSocket((msg: WsMessage) => {
      if (msg.event === 'alert') {
        // O broadcast de um alerta novo é a linha completa (alerts.ts); o de
        // uma confirmação é só {id, acked_by, acked_at} (routes/caregiver.ts)
        // — em qualquer dos casos falta o device_name, que só o JOIN de
        // GET /alerts inclui. Procura-se localmente pelos dispositivos já
        // carregados.
        const incoming = msg.data as Partial<Alert> & { id: number; acked_at: number | null };
        setOpenAlerts((prev) => {
          if (incoming.acked_at) return prev.filter((a) => a.id !== incoming.id);
          if (prev.some((a) => a.id === incoming.id)) return prev;
          const deviceName = devicesRef.current?.find((d) => d.id === incoming.device_id)?.name ?? '';
          return [{ ...incoming, device_name: deviceName } as Alert, ...prev];
        });
        // Só atualiza entradas já presentes no histórico (ex: confirmação de
        // um alerta antigo) — sintetizar uma linha nova sem device_name
        // mostraria "undefined" até o histórico ser recarregado a sério.
        setHistory((prev) => prev.map((a) => (a.id === incoming.id ? { ...a, ...incoming } : a)));
        if (incoming.device_id === selectedIdRef.current) setSignalTick((t) => t + 1);
      }
      if (msg.event === 'location') {
        const point = msg.data as { device_id: number; lat: number; lon: number; recorded_at: number };
        setDevices((prev) =>
          prev?.map((d) =>
            d.id === point.device_id
              ? { ...d, last_seen_at: point.recorded_at, last_lat: point.lat, last_lon: point.lon, last_recorded_at: point.recorded_at }
              : d,
          ) ?? prev,
        );
        if (point.device_id === selectedIdRef.current) {
          setLocations((prev) => [
            { lat: point.lat, lon: point.lon, accuracy_m: null, battery_pct: null, recorded_at: point.recorded_at },
            ...prev,
          ]);
          setSignalTick((t) => t + 1);
        }
      }
    });
  }, []);

  const loadHistory = useCallback(() => {
    api.alerts(false).then((r) => {
      setHistory(r.alerts);
      setHistoryLoaded(true);
    });
  }, []);

  function ackLocally(id: number) {
    setOpenAlerts((prev) => prev.filter((a) => a.id !== id));
    setHistory((prev) => prev.map((a) => (a.id === id ? { ...a, acked_at: Date.now() } : a)));
  }

  function logout() {
    clearSession();
    onLoggedOut();
  }

  /**
   * Sair fecha só esta janela. Isto fecha todas — é o que se faz quando o
   * telemóvel com o painel aberto se perde, e a única forma de matar um JWT
   * antes dos 30 dias.
   */
  async function revokeSessions() {
    if (!window.confirm('Terminar a sessão em todos os dispositivos? Terá de entrar outra vez em cada um.')) return;
    await api.revokeSessions().catch(() => undefined);
    logout();
  }

  const current = useMemo(() => devices?.find((d) => d.id === selectedId) ?? null, [devices, selectedId]);
  const currentOpenAlerts = useMemo(
    () => openAlerts.filter((a) => a.device_id === selectedId),
    [openAlerts, selectedId],
  );

  if (devices === null) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          SOS Mend<em>o</em>nça
        </div>

        {devices.length > 0 && (
          <nav className="topbar__devices" aria-label="Dispositivos">
            {devices.map((d) => (
              <button
                key={d.id}
                className="device-pill"
                aria-current={d.id === selectedId}
                onClick={() => setSelectedId(d.id)}
              >
                {d.name}
              </button>
            ))}
          </nav>
        )}

        <div className="topbar__account">
          <span>{getCaregiverName()}</span>
          <button className="link-button" onClick={logout}>
            Sair
          </button>
          <button className="link-button link-button--quiet" onClick={revokeSessions}>
            Sair em todo o lado
          </button>
        </div>
      </header>

      <main className="main">
        {pendingCode ? (
          <PairingCode
            code={pendingCode}
            onDone={() => {
              setPendingCode(null);
              loadDevices();
            }}
          />
        ) : devices.length === 0 || !current ? (
          <PairDevice
            onCreated={(code) => {
              setPendingCode(code);
              loadDevices(); // já mostra o dispositivo (por emparelhar) na barra de topo
            }}
          />
        ) : (
          <>
            <Overview device={current} openAlerts={currentOpenAlerts} signalTick={signalTick} now={now} />

            <div className="grid">
              <div className="card map-card">
                <div className="card__header">
                  <span className="card__title">Onde está</span>
                </div>
                <DeviceMap points={locations} />
              </div>

              <AlertsPanel
                open={openAlerts}
                history={history}
                historyLoaded={historyLoaded}
                onLoadHistory={loadHistory}
                onAcked={ackLocally}
              />

              <ContactsCard deviceId={current.id} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Overview({
  device,
  openAlerts,
  signalTick,
  now,
}: {
  device: Device;
  openAlerts: Alert[];
  signalTick: number;
  now: number;
}) {
  const urgentAlert = openAlerts.find((a) => a.type === 'sos' || a.type === 'fall');
  const fresh = device.last_seen_at != null && now - device.last_seen_at <= FRESH_WINDOW_MS;

  let state: PulseState = 'ok';
  let phrase = `${device.name} está bem.`;
  if (urgentAlert) {
    state = 'alarme';
    phrase = `${device.name} precisa de ajuda.`;
  } else if (device.last_seen_at == null) {
    state = 'silencio';
    phrase = `Ainda sem sinal de ${device.name}.`;
  } else if (!fresh) {
    state = 'silencio';
    phrase = `Sem sinal desde as ${clockTime(device.last_seen_at)}.`;
  }

  return (
    <div className="hero">
      <Pulse state={state} signalKey={signalTick} />
      <div>
        <h1 className={`hero__phrase ${state === 'alarme' ? 'hero__phrase--alarme' : ''}`}>{phrase}</h1>
        <p className="hero__meta">
          {[
            device.battery_pct != null && `Bateria ${device.battery_pct}%`,
            device.last_seen_at != null && `Último sinal ${timeAgo(device.last_seen_at, now)}`,
            // Depois de uma OTA, é aqui que se confirma quem já a apanhou
            // — e quem ficou para trás (Context.md §9).
            device.app_version != null && `App ${device.app_version}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  );
}
