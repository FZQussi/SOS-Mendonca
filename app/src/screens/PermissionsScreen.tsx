import { useState } from 'react';
import { Linking, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ExpoLocation from 'expo-location';
import { colors, space, touch, type as t } from '../theme';

/**
 * A ordem importa (Context.md §8) — é a única que funciona. Pedir tudo de
 * uma vez faz o Android negar em silêncio, sem mostrar nada:
 *   1. Notificações
 *   2. Localização em primeiro plano
 *   3. Ecrã de explicação, só depois localização em segundo plano
 *   4. Chamadas
 *   5. Isenção de otimização de bateria
 */
type Step = 0 | 1 | 2 | 3 | 4;

const TOTAL_STEPS = 5;

/**
 * Uma permissão não declarada no manifesto (é o caso de `CALL_PHONE` dentro
 * do Expo Go — só um development build a declara a sério) pode nem
 * rejeitar: o pedido nativo fica pendurado para sempre, sem resolver nem
 * falhar. Sem este limite, uma pessoa idosa ficaria presa a meio do
 * onboarding sem forma de continuar.
 */
function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

export function PermissionsScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(0);

  function next() {
    setStep((s) => (s < TOTAL_STEPS - 1 ? ((s + 1) as Step) : s));
    if (step === TOTAL_STEPS - 1) onDone();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>
        Passo {step + 1} de {TOTAL_STEPS}
      </Text>

      {step === 0 && <NotificationsStep onContinue={next} />}
      {step === 1 && <ForegroundLocationStep onContinue={next} />}
      {step === 2 && <BackgroundLocationStep onContinue={next} />}
      {step === 3 && <CallStep onContinue={next} />}
      {step === 4 && <BatteryStep onContinue={onDone} />}
    </View>
  );
}

function StepShell({
  title,
  body,
  buttonLabel,
  onContinue,
}: {
  title: string;
  body: string;
  buttonLabel: string;
  onContinue: () => void;
}) {
  return (
    <View style={styles.step}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <TouchableOpacity style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function NotificationsStep({ onContinue }: { onContinue: () => void }) {
  return (
    <StepShell
      title="Avisos no telemóvel"
      body="Vamos pedir autorização para lhe mostrar avisos importantes."
      buttonLabel="Continuar"
      onContinue={async () => {
        // A permissão em si pede-se por PermissionsAndroid (core do RN, sem
        // módulo nativo próprio). A biblioteca de push a sério (FCM, por
        // Context.md §4) só entra quando o `TODO` do push existir de facto
        // — ver ROADMAP.md §3. `expo-notifications` fica de fora por agora:
        // a sua própria auto-ligação rebenta o Expo Go só por estar
        // instalada, mesmo sem nunca ser chamada.
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          await withTimeout(PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)).catch(
            () => {},
          );
        }
        onContinue();
      }}
    />
  );
}

function ForegroundLocationStep({ onContinue }: { onContinue: () => void }) {
  return (
    <StepShell
      title="A sua localização"
      body={'A seguir vai aparecer uma pergunta do telemóvel.\nEscolha "Enquanto usa a app".'}
      buttonLabel="Continuar"
      onContinue={async () => {
        await withTimeout(ExpoLocation.requestForegroundPermissionsAsync()).catch(() => {});
        onContinue();
      }}
    />
  );
}

function BackgroundLocationStep({ onContinue }: { onContinue: () => void }) {
  return (
    <StepShell
      title="Também com o ecrã desligado"
      body={
        'Para a família saber onde está mesmo com a app fechada, precisamos de mais uma autorização.\n\n' +
        'Na próxima pergunta, escolha "Permitir sempre".'
      }
      buttonLabel="Continuar"
      onContinue={async () => {
        await withTimeout(ExpoLocation.requestBackgroundPermissionsAsync()).catch(() => {});
        onContinue();
      }}
    />
  );
}

function CallStep({ onContinue }: { onContinue: () => void }) {
  return (
    <StepShell
      title="Chamadas de emergência"
      body="Para o botão SOS poder ligar de imediato à sua família, precisamos de autorização para fazer chamadas."
      buttonLabel="Continuar"
      onContinue={async () => {
        if (Platform.OS === 'android') {
          // Segue em frente de qualquer forma — o Expo Go não tem esta
          // permissão declarada, só um development build a tem, e um pedido
          // sobre uma permissão não declarada pode nem chegar a responder.
          await withTimeout(PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE)).catch(() => {});
        }
        onContinue();
      }}
    />
  );
}

function BatteryStep({ onContinue }: { onContinue: () => void }) {
  return (
    <StepShell
      title="Uma última coisa"
      body={
        'Alguns telemóveis desligam a app sozinhos para poupar bateria.\n\n' +
        'Na próxima pergunta, escolha para a poupança de bateria não se aplicar a esta app.'
      }
      buttonLabel="Concluir"
      onContinue={async () => {
        if (Platform.OS === 'android') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const IntentLauncher = require('expo-intent-launcher');
            await IntentLauncher.startActivityAsync(
              IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
            );
          } catch {
            await Linking.openSettings();
          }
        }
        onContinue();
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parede, padding: space.lg, justifyContent: 'center' },
  progress: {
    position: 'absolute',
    top: space.xl,
    alignSelf: 'center',
    fontSize: t.base * 0.7,
    color: colors.tintaSuave,
  },
  step: { alignItems: 'center' },
  title: { fontSize: t.titulo, fontWeight: '700', color: colors.tinta, marginBottom: space.md, textAlign: 'center' },
  body: { fontSize: t.base, color: colors.tintaSuave, textAlign: 'center', marginBottom: space.xl, lineHeight: 30 },
  button: {
    backgroundColor: colors.tinta,
    borderRadius: 16,
    minHeight: touch.minimo,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { color: colors.louca, fontSize: t.botao, fontWeight: '700' },
});
