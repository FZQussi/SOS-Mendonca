import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ApiError, deviceApi } from '../lib/api';
import { setDeviceSession } from '../lib/storage';
import { colors, space, touch, type as t } from '../theme';

export function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const { token, device } = await deviceApi.pair(code);
      await setDeviceSession(token, device.name);
      onPaired();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Não consegui ligar-me. Verifique o código e tente outra vez.'
          : 'Não consegui ligar-me. Vou tentar outra vez.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Introduza o código</Text>
      <Text style={styles.body}>O código foi mostrado no computador de quem vai cuidar de si.</Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor={colors.tintaSuave}
        autoFocus
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, code.length !== 6 && styles.buttonDisabled]}
        onPress={submit}
        disabled={code.length !== 6 || busy}
      >
        {busy ? <ActivityIndicator color={colors.louca} /> : <Text style={styles.buttonText}>Continuar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parede, padding: space.lg, justifyContent: 'center' },
  title: { fontSize: t.titulo, fontWeight: '700', color: colors.tinta, marginBottom: space.sm, textAlign: 'center' },
  body: { fontSize: t.base, color: colors.tintaSuave, textAlign: 'center', marginBottom: space.xl },
  input: {
    backgroundColor: colors.louca,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.areia,
    fontSize: 44,
    fontFamily: 'monospace',
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: space.md,
    color: colors.tinta,
    marginBottom: space.lg,
  },
  error: { fontSize: t.base, color: colors.alarme, textAlign: 'center', marginBottom: space.md },
  button: {
    backgroundColor: colors.tinta,
    borderRadius: 16,
    minHeight: touch.minimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.louca, fontSize: t.botao, fontWeight: '700' },
});
