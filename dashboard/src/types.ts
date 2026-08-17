export type AlertType = 'sos' | 'fall' | 'low_battery' | 'device_offline' | 'geofence';

export interface Device {
  id: number;
  name: string;
  battery_pct: number | null;
  last_seen_at: number | null;
  created_at: number;
  paired: boolean;
  pairing_code: string | null;
  last_lat: number | null;
  last_lon: number | null;
  last_recorded_at: number | null;
}

export interface LocationPoint {
  lat: number;
  lon: number;
  accuracy_m: number | null;
  battery_pct: number | null;
  recorded_at: number;
}

export interface Alert {
  id: number;
  device_id: number;
  device_name: string;
  type: AlertType;
  lat: number | null;
  lon: number | null;
  note: string | null;
  recorded_at: number;
  received_at: number;
  acked_by: number | null;
  acked_at: number | null;
}

export const ALERT_LABEL: Record<AlertType, string> = {
  sos: 'SOS',
  fall: 'Queda detetada',
  low_battery: 'Bateria fraca',
  device_offline: 'Sem sinal',
  geofence: 'Saiu da zona',
};
