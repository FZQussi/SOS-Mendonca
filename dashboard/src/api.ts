import type { Alert, Device, LocationPoint } from './types';

const TOKEN_KEY = 'sos-mendonca-token';
const NAME_KEY = 'sos-mendonca-name';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCaregiverName(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function setSession(token: string, name: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, name);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && token) {
    // A sessão expirou ou foi revogada — não há como recuperar sem novo login.
    clearSession();
    window.location.reload();
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'Não foi possível ligar ao servidor.');
  return body as T;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request<{ token: string; name: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; name: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  devices: () => request<{ devices: Device[] }>('/devices'),

  createDevice: (name: string) =>
    request<{ pairing_code: string }>('/devices', { method: 'POST', body: JSON.stringify({ name }) }),

  locations: (deviceId: number, hours = 24) =>
    request<{ locations: LocationPoint[] }>(`/devices/${deviceId}/locations?hours=${hours}`),

  alerts: (open: boolean) => request<{ alerts: Alert[] }>(`/alerts${open ? '?open=true' : ''}`),

  ackAlert: (id: number) => request<{ ok: true }>(`/alerts/${id}/ack`, { method: 'POST' }),
};
