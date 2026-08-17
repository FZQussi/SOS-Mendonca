import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PairingScreen } from './src/screens/PairingScreen';
import { PermissionsScreen } from './src/screens/PermissionsScreen';
import { PrimaryContactScreen } from './src/screens/PrimaryContactScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { WhatIsSharedScreen } from './src/screens/WhatIsSharedScreen';
import { getContacts, getDeviceToken, isOnboarded, setOnboarded, type StoredContact } from './src/lib/storage';
import { colors } from './src/theme';

type Route = 'carregando' | 'emparelhar' | 'permissoes' | 'contacto' | 'inicio' | 'contactos' | 'partilhado';

export default function App() {
  const [route, setRoute] = useState<Route>('carregando');
  const [contacts, setContactsState] = useState<StoredContact[]>([]);

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    const token = await getDeviceToken();
    if (!token) {
      setRoute('emparelhar');
      return;
    }
    if (!(await isOnboarded())) {
      setRoute('permissoes');
      return;
    }
    setContactsState(await getContacts());
    setRoute('inicio');
  }

  async function afterOnboarding() {
    await setOnboarded();
    setContactsState(await getContacts());
    setRoute('inicio');
  }

  if (route === 'carregando') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.tinta} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (route === 'emparelhar') {
    return (
      <>
        <PairingScreen onPaired={() => setRoute('permissoes')} />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route === 'permissoes') {
    return (
      <>
        <PermissionsScreen onDone={() => setRoute('contacto')} />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route === 'contacto') {
    return (
      <>
        <PrimaryContactScreen onDone={afterOnboarding} />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route === 'contactos') {
    return (
      <>
        <ContactsScreen contacts={contacts} onBack={() => setRoute('inicio')} />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route === 'partilhado') {
    return (
      <>
        <WhatIsSharedScreen onBack={() => setRoute('inicio')} />
        <StatusBar style="dark" />
      </>
    );
  }

  return (
    <>
      <HomeScreen
        contact={contacts[0] ?? null}
        onOpenContacts={() => setRoute('contactos')}
        onOpenWhatIsShared={() => setRoute('partilhado')}
      />
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parede },
});
