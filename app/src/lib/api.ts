import { getDeviceToken } from './storage';

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

  sendAlert: (type: AlertType, extra?: { lat?: number; lon?: number; note?: string }) =>
    request<{ id: number } | { suppressed: true }>('/device/alerts', {
      method: 'POST',
      body: JSON.stringify({ type, ...extra }),
    }),

  heartbeat: (batteryPct: number) =>
    request<{ ok: true }>('/device/heartbeat', { method: 'POST', body: JSON.stringify({ battery_pct: batteryPct }) }),

  setContacts: (contacts: EmergencyContact[]) =>
    request<{ contacts: EmergencyContact[] }>('/device/contacts', { method: 'PUT', body: JSON.stringify(contacts) }),
};
