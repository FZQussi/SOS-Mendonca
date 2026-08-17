import * as ExpoLocation from 'expo-location';
import { isExpoGo } from './call';
import { deviceApi, type LocationPoint } from './api';
import { alertQueue, locationQueue } from './queues';
import { setContacts as setLocalContacts, type StoredContact } from './storage';

/**
 * Leitura pontual — serve para o GPS do SOS e funciona no Expo Go. Para
 * seguimento contínuo em segundo plano usa-se `react-native-background-
 * geolocation` (ver `startBackgroundTracking`), nunca `expo-location`: há um
 * defeito conhecido em que o foreground service congela depois de qualquer
 * atualização da app, incluindo OTA (Context.md §9).
 */
export async function getCurrentLocation(): Promise<{ lat: number; lon: number; accuracy_m?: number } | null> {
  const { status } = await ExpoLocation.getForegroundPermissionsAsync();
  if (status !== ExpoLocation.PermissionStatus.GRANTED) return null;

  const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? undefined };
}

/** Abaixo disto avisa-se a família. O servidor tem anti-spam de 1 h neste tipo. */
const LOW_BATTERY_PCT = 15;
/** Também é o intervalo máximo que a fila offline espera para ser esvaziada. */
const HEARTBEAT_SECONDS = 15 * 60;

interface BgLocation {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp: string;
  battery?: { level?: number };
}

/** BGGeo dá a bateria em 0..1 (e -1 quando ainda não sabe). */
function batteryPct(level?: number): number | undefined {
  return level === undefined || level < 0 ? undefined : Math.round(level * 100);
}

/**
 * Esvazia as duas filas. Alertas primeiro — um SOS que ficou por enviar vale
 * mais do que o percurso. Falhar aqui é normal (é para isso que a fila
 * existe): não se limpa nada, tenta-se outra vez no próximo sinal.
 */
export async function flushPending(): Promise<void> {
  try {
    // ponytail: reenvio em série; se falhar a meio, os já enviados repetem-se
    // no próximo flush. Um SOS duplicado é melhor do que um SOS perdido.
    await alertQueue.flush(async (items) => {
      for (const a of items) {
        await deviceApi.sendAlert(a.type, { lat: a.lat, lon: a.lon, note: a.note, recorded_at: a.recordedAt });
      }
    });
    await locationQueue.flush(async (points) => {
      await deviceApi.sendLocations(points);
    });
  } catch {
    // Sem rede. Fica tudo na fila.
  }
}

async function enqueueAndFlush(point: LocationPoint): Promise<void> {
  await locationQueue.enqueue(point);
  await flushPending();
}

let notifyContacts: ((contacts: StoredContact[]) => void) | undefined;

/**
 * O ecrã inicial fica aberto dias seguidos no telemóvel do idoso — sem isto
 * ficava agarrado à lista de contactos do arranque e o SOS ligaria ao número
 * antigo mesmo depois de a família o ter corrigido no painel.
 */
export function onContactsUpdated(fn: (contacts: StoredContact[]) => void): void {
  notifyContacts = fn;
}

/**
 * Puxa os contactos do servidor — é lá que o cuidador os edita. Falhar é
 * normal e não faz mal: fica a cópia local, que é a que o SOS usa.
 */
export async function syncContacts(): Promise<void> {
  let contacts;
  try {
    ({ contacts } = await deviceApi.getContacts());
  } catch {
    return; // Sem rede. A cópia local aguenta.
  }

  // Lista vazia não apaga a cópia local. É quase sempre "ainda não foi
  // configurado no painel", e num sistema de emergência ter um número
  // desatualizado a quem ligar é melhor do que não ter nenhum.
  if (contacts.length === 0) return;

  const stored: StoredContact[] = contacts.map((c) => ({
    name: c.name,
    phone: c.phone,
    priority: c.priority ?? 1,
  }));
  await setLocalContacts(stored);
  notifyContacts?.(stored);
}

async function beat(pct?: number): Promise<void> {
  await flushPending();
  await syncContacts();
  if (pct === undefined) return;
  try {
    await deviceApi.heartbeat(pct);
    if (pct <= LOW_BATTERY_PCT) await deviceApi.sendAlert('low_battery');
  } catch {
    // O silêncio é que é o alerta: o watchdog do servidor trata disto.
  }
}

let started = false;

/**
 * Seguimento contínuo com o SDK da Transistor. Só existe num development
 * build — ver o aviso em `call.ts`. Chamar isto no Expo Go não faz nada, só
 * avisa; nunca deve rebentar a app.
 *
 * O `heartbeatInterval` serve a dois fins: mantém o `last_seen_at` fresco no
 * servidor mesmo com o telemóvel parado em cima da mesa (sem isto o watchdog
 * dispara `device_offline` ao fim de 30 min de sofá), e é o relógio que
 * esvazia a fila offline quando a rede volta.
 */
export function startTracking(): void {
  if (started) return;
  if (isExpoGo()) {
    console.warn('[location] Seguimento em segundo plano não funciona no Expo Go — precisa de um development build.');
    return;
  }
  started = true;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BackgroundGeolocation = require('react-native-background-geolocation').default;

  BackgroundGeolocation.onLocation((l: BgLocation) => {
    void enqueueAndFlush({
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      accuracy_m: l.coords.accuracy ?? undefined,
      battery_pct: batteryPct(l.battery?.level),
      recorded_at: Date.parse(l.timestamp),
    });
  });

  BackgroundGeolocation.onHeartbeat((e: { location?: BgLocation }) => {
    void beat(batteryPct(e.location?.battery?.level));
  });

  BackgroundGeolocation.ready({
    desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter: 30,
    stopOnTerminate: false,
    startOnBoot: true,
    heartbeatInterval: HEARTBEAT_SECONDS,
    foregroundService: true,
    notification: {
      title: 'SOS Mendonça',
      text: 'A partilhar localização com a família.',
    },
  }).then(() => BackgroundGeolocation.start());
}
