import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deviceApi } from '../lib/api';
import { setContacts } from '../lib/storage';
import { colors, space, touch, type as t } from '../theme';

/**
 * Um contacto, à mão, para já — é o mínimo que o botão SOS precisa para
 * ligar (princípio 2). Escolher vários a partir da agenda do telemóvel
 * (`READ_CONTACTS`) fica para o `ROADMAP.md` §1.1.
 */
export function PrimaryContactScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const contact = { name: name.trim(), phone: phone.trim(), priority: 1 };
      await setContacts([contact]);
      await deviceApi.setContacts([contact]);
      onDone();
    } catch {
      // Guarda-se localmente mesmo que o envio falhe agora — a app tenta de
      // novo mais tarde (a mesma ideia da fila offline, aqui sem fila porque
      // isto só acontece uma vez, no onboarding).
      setError('Guardado no telemóvel. Vou enviar para a família assim que houver rede.');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const valid = name.trim().length > 0 && phone.trim().length >= 9;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quem ligamos em caso de SOS?</Text>
      <Text style={styles.body}>Escreva o nome e o telefone da pessoa a contactar primeiro.</Text>

      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Rita" autoFocus />

      <Text style={styles.label}>Telefone</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/[^0-9+]/g, ''))}
        placeholder="912 345 678"
        keyboardType="phone-pad"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.button, !valid && styles.buttonDisabled]} onPress={submit} disabled={!valid || busy}>
        {busy ? <ActivityIndicator color={colors.louca} /> : <Text style={styles.buttonText}>Concluir</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parede, padding: space.lg, justifyContent: 'center' },
  title: { fontSize: t.titulo, fontWeight: '700', color: colors.tinta, marginBottom: space.sm, textAlign: 'center' },
  body: { fontSize: t.base, color: colors.tintaSuave, textAlign: 'center', marginBottom: space.lg },
  label: { fontSize: t.base * 0.8, color: colors.tintaSuave, marginBottom: 6, marginTop: space.sm },
  input: {
    backgroundColor: colors.louca,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.areia,
    fontSize: t.base,
    paddingVertical: 14,
    paddingHorizontal: space.sm,
    color: colors.tinta,
    minHeight: touch.minimo,
  },
  error: { fontSize: t.base * 0.85, color: colors.musgo, textAlign: 'center', marginTop: space.md },
  button: {
    backgroundColor: colors.tinta,
    borderRadius: 16,
    minHeight: touch.minimo,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.louca, fontSize: t.botao, fontWeight: '700' },
});
