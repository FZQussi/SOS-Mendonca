import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StoredContact } from '../lib/storage';
import { colors, space, touch, type as t } from '../theme';

/** Só para ver — editar contactos faz-se no painel do cuidador (ROADMAP.md §1.1). */
export function ContactsScreen({ contacts, onBack }: { contacts: StoredContact[]; onBack: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contactos de emergência</Text>

      <FlatList
        data={contacts}
        keyExtractor={(c) => c.phone}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Ainda não há contactos guardados.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.phone}>{item.phone}</Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parede, padding: space.lg },
  title: { fontSize: t.titulo, fontWeight: '700', color: colors.tinta, marginBottom: space.lg, textAlign: 'center' },
  list: { gap: space.sm },
  empty: { fontSize: t.base, color: colors.tintaSuave, textAlign: 'center', marginTop: space.xl },
  card: { backgroundColor: colors.louca, borderRadius: 14, padding: space.md },
  name: { fontSize: t.base, fontWeight: '700', color: colors.tinta },
  phone: { fontSize: t.base * 0.85, color: colors.tintaSuave, marginTop: 4 },
  backButton: { minHeight: touch.minimo, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  backButtonText: { fontSize: t.botao, color: colors.azulejo },
});
