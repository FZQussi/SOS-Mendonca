import Constants from 'expo-constants';
import { getDeviceToken } from './storage';

/**
 * Vai em todos os pedidos (Context.md §9) para o painel poder mostrar que
 * versão cada telemóvel corre. Lê-se do `app.json`, que viaja no bundle JS —
 * portanto muda com cada OTA, que é exatamente o que interessa saber quando
 * uma OTA parte alguma coisa num telemóvel e noutro não.
 */
const APP_VERSION = Constants.expoConfig?.version ?? 'desconhecida';

/**
 * No Pi, isto é o domínio do túnel Cloudflare (https://...). Em desenvolvimento,
 * `10.0.2.2` é como o emulador Android vê o `localhost` da máquina que o corre —
 * num telemóvel a sério na mesma rede, usa o IP da máquina (ex.: 192.168.1.25).
 */
export const API_URL = 'http://10.0.2.2:3100';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getDeviceToken();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-SOS-App-Version': APP_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'Não consegui ligar-me ao servidor.');
  return body as T;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  priority?: number;
}

export interface LocationPoint {
  lat: number;
  lon: number;
  accuracy_m?: number;
  battery_pct?: number;
  recorded_at: number;
}

export type AlertType = 'sos' | 'fall' | 'low_battery' | 'device_offline' | 'geofence';

export const deviceApi = {
  pair: (code: string) =>
    request<{ token: string; device: { id: number; name: string } }>('/device/pair', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  sendLocations: (points: LocationPoint | LocationPoint[]) =>
    request<{ saved: number }>('/device/locations', { method: 'POST', body: JSON.stringify(points) }),

  // `recorded_at` importa quando o alerta sai da fila offline horas depois: o
  // cuidador quer a hora em que aconteceu, não a de chegada (Context.md §6).
  sendAlert: (type: AlertType, extra?: { lat?: number; lon?: number; note?: string; recorded_at?: number }) =>
    request<{ id: number } | { suppressed: true }>('/device/alerts', {
      method: 'POST',
      body: JSON.stringify({ type, ...extra }),
    }),

  heartbeat: (batteryPct: number) =>
    request<{ ok: true }>('/device/heartbeat', { method: 'POST', body: JSON.stringify({ battery_pct: batteryPct }) }),

  getContacts: () => request<{ contacts: EmergencyContact[] }>('/device/contacts'),

  setContacts: (contacts: EmergencyContact[]) =>
    request<{ contacts: EmergencyContact[] }>('/device/contacts', { method: 'PUT', body: JSON.stringify(contacts) }),
};
