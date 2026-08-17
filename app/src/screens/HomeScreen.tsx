import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';
import { Animated, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { triggerSos } from '../lib/sos';
import { createFallDetector, magnitude, SAMPLE_INTERVAL_MS } from '../lib/fallDetection';
import { colors, space, touch, type as t } from '../theme';
import type { StoredContact } from '../lib/storage';

type Phase = 'normal' | 'contagem' | 'queda' | 'confirmado';
const COUNTDOWN_MS = 3000;
/** Uma queda dá muito mais tempo do que o botão: quem carregou quis carregar. */
const FALL_GRACE_S = 30;

export function HomeScreen({
  contact,
  onOpenContacts,
  onOpenWhatIsShared,
}: {
  contact: StoredContact | null;
  onOpenContacts: () => void;
  onOpenWhatIsShared: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('normal');
  const [secondsLeft, setSecondsLeft] = useState(3);
  const fill = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown() {
    setPhase('contagem');
    setSecondsLeft(3);
    fill.setValue(0);
    Animated.timing(fill, { toValue: 1, duration: COUNTDOWN_MS, useNativeDriver: false }).start();

    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearCountdown();
          void triggerSos(contact?.phone ?? null);
          setPhase('confirmado');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function clearCountdown() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  function cancel() {
    clearCountdown();
    fill.stopAnimation();
    setPhase('normal');
  }

  useEffect(() => () => clearCountdown(), []);

  // Só se ouve o acelerómetro no ecrã inicial e fora de uma contagem já a
  // decorrer — a pessoa a carregar no SOS abana o telemóvel, e isso não é uma
  // queda. Ver o aviso em `fallDetection.ts`: em segundo plano isto não corre.
  useEffect(() => {
    if (phase !== 'normal') return;

    const detector = createFallDetector();
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      if (!detector.push(magnitude(x, y, z), Date.now())) return;
      // Três canais, porque um deles pode estar indisponível (Context.md §10).
      Vibration.vibrate([0, 400, 200, 400]);
      setSecondsLeft(FALL_GRACE_S);
      setPhase('queda');
    });
    return () => subscription.remove();
  }, [phase]);

  // Conta os 30 segundos da queda. Se ninguém disser "estou bem", pede ajuda.
  useEffect(() => {
    if (phase !== 'queda') return;

    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          void triggerSos(contact?.phone ?? null, 'fall');
          setPhase('confirmado');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [phase, contact]);

  if (phase === 'confirmado') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.confirmTitle}>Ajuda a caminho.</Text>
        <Text style={styles.confirmBody}>
          {contact ? `A ligar para ${contact.name}.` : 'A avisar a família.'}
        </Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setPhase('normal')}>
          <Text style={styles.secondaryButtonText}>Voltar ao início</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'queda') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.fallTitle}>Caiu?</Text>
        <Text style={styles.fallBody}>
          Se não responder, vamos pedir ajuda dentro de {secondsLeft} segundos.
        </Text>
        <TouchableOpacity style={styles.fallOkButton} onPress={() => setPhase('normal')}>
          <Text style={styles.fallOkButtonText}>Estou bem</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fallHelpButton}
          onPress={() => {
            void triggerSos(contact?.phone ?? null, 'fall');
            setPhase('confirmado');
          }}
        >
          <Text style={styles.fallHelpButtonText}>Preciso de ajuda agora</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'contagem') {
    const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.countdownNumber}>{secondsLeft}</Text>
        <Text style={styles.countdownLabel}>A pedir ajuda…</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width }]} />
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <TouchableOpacity style={styles.sosButton} onPress={startCountdown}>
          <Text style={styles.sosButtonText}>SOS</Text>
        </TouchableOpacity>
        {contact && <Text style={styles.contactHint}>Vai ligar para {contact.name}</Text>}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.linkButton} onPress={onOpenContacts}>
          <Text style={styles.linkButtonText}>Contactos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={onOpenWhatIsShared}>
          <Text style={styles.linkButtonText}>O que é partilhado</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parede },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sosButton: {
    width: touch.sos,
    height: touch.sos,
    borderRadius: touch.sos / 2,
    backgroundColor: colors.alarme,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  sosButtonText: { color: colors.louca, fontSize: t.sos, fontWeight: '800', letterSpacing: 2 },
  contactHint: { marginTop: space.lg, fontSize: t.base * 0.8, color: colors.tintaSuave },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.md,
    paddingBottom: space.xl,
  },
  linkButton: { minHeight: touch.minimo, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  linkButtonText: { fontSize: t.base * 0.75, color: colors.azulejo, textDecorationLine: 'underline' },
  countdownNumber: { fontSize: 96, fontWeight: '800', color: colors.alarme },
  countdownLabel: { fontSize: t.titulo, color: colors.tinta, marginTop: space.sm },
  progressTrack: {
    width: '70%',
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.areia,
    marginTop: space.xl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.alarme },
  cancelButton: {
    marginTop: space.xl,
    minHeight: touch.minimo,
    minWidth: 220,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.tintaSuave,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  cancelButtonText: { fontSize: t.botao, color: colors.tinta, fontWeight: '700' },
  fallTitle: { fontSize: t.titulo * 1.3, fontWeight: '800', color: colors.tinta, textAlign: 'center' },
  fallBody: {
    fontSize: t.base,
    color: colors.tinta,
    textAlign: 'center',
    marginTop: space.md,
    paddingHorizontal: space.lg,
  },
  // "Estou bem" é a resposta esperada e leva o peso visual todo: quem está
  // bem tem de conseguir dizê-lo sem procurar (uma ação por ecrã, §10).
  fallOkButton: {
    marginTop: space.xl,
    minHeight: touch.sos * 0.7,
    minWidth: 260,
    borderRadius: 20,
    backgroundColor: colors.musgo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    elevation: 4,
  },
  fallOkButtonText: { fontSize: t.botao, color: colors.louca, fontWeight: '800' },
  fallHelpButton: { marginTop: space.lg, minHeight: touch.minimo, justifyContent: 'center' },
  fallHelpButtonText: { fontSize: t.base, color: colors.alarme, fontWeight: '700' },
  confirmTitle: { fontSize: t.titulo, fontWeight: '700', color: colors.musgo, textAlign: 'center' },
  confirmBody: { fontSize: t.base, color: colors.tintaSuave, marginTop: space.md, textAlign: 'center' },
  secondaryButton: { marginTop: space.xl, minHeight: touch.minimo, justifyContent: 'center' },
  secondaryButtonText: { fontSize: t.base, color: colors.azulejo },
});
