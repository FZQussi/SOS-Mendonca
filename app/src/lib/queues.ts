import AsyncStorage from '@react-native-async-storage/async-storage';
import { createQueue } from './offlineQueue';
import type { AlertType, LocationPoint } from './api';

export interface PendingAlert {
  type: AlertType;
  lat?: number;
  lon?: number;
  note?: string;
  recordedAt: number;
}

export const locationQueue = createQueue<LocationPoint>('sos-mendonca-pending-locations', AsyncStorage);
export const alertQueue = createQueue<PendingAlert>('sos-mendonca-pending-alerts', AsyncStorage);
