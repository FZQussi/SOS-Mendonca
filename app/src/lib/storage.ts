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
 * Cópia local dos contactos. A origem da verdade é o servidor — o cuidador
 * edita-os no painel e a app puxa-os com `syncContacts()`. Esta cópia existe
 * porque no momento do SOS não pode haver um `await` de rede antes da chamada
 * (princípio 2): liga-se ao que está guardado, mesmo sem rede nenhuma.
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
