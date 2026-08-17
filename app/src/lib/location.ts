import * as ExpoLocation from 'expo-location';
import { isExpoGo } from './call';

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

/**
 * Seguimento contínuo com o SDK da Transistor. Só existe num development
 * build — ver o aviso em `call.ts`. Chamar isto no Expo Go não faz nada, só
 * avisa; nunca deve rebentar a app.
 */
export function startBackgroundTracking(onLocation: (point: { lat: number; lon: number; recorded_at: number }) => void): void {
  if (isExpoGo()) {
    console.warn('[location] Seguimento em segundo plano não funciona no Expo Go — precisa de um development build.');
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BackgroundGeolocation = require('react-native-background-geolocation').default;
  BackgroundGeolocation.onLocation((location: { coords: { latitude: number; longitude: number } }) => {
    onLocation({ lat: location.coords.latitude, lon: location.coords.longitude, recorded_at: Date.now() });
  });
  BackgroundGeolocation.ready({
    desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter: 30,
    stopOnTerminate: false,
    startOnBoot: true,
    foregroundService: true,
    notification: {
      title: 'SOS Mendonça',
      text: 'A partilhar localização com a família.',
    },
  });
  BackgroundGeolocation.start();
}
