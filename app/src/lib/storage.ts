import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'sos-mendonca-device-token';
const DEVICE_NAME_KEY = 'sos-mendonca-device-name';
const ONBOARDED_KEY = 'sos-mendonca-onboarded';
const CONTACTS_KEY = 'sos-mendonca-contacts';

export interface StoredContact {
  name: string;
  phone: string;
  priority: number;
}

/**
 * Cópia local dos contactos. O servidor só tem `PUT /device/contacts` (o
 * dispositivo envia), não um `GET` de volta — se o cuidador os vier a editar
 * no painel, esta app não saberá ainda (falta no ROADMAP.md §2.3/§3). Até lá,
 * a app é a origem da verdade dos seus próprios contactos.
 */
export async function getContacts(): Promise<StoredContact[]> {
  const raw = await AsyncStorage.getItem(CONTACTS_KEY);
  return raw ? (JSON.parse(raw) as StoredContact[]) : [];
}

export async function setContacts(contacts: StoredContact[]): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export async function getDeviceToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setDeviceSession(token: string, deviceName: string): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [DEVICE_NAME_KEY, deviceName],
  ]);
}

export async function getDeviceName(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_NAME_KEY);
}

export async function isOnboarded(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true';
}

export async function setOnboarded(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}
