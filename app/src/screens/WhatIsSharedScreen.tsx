import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, space, touch, type as t } from '../theme';

/**
 * Cuidado consentido, não vigilância (Context.md §11). A app é visível de
 * propósito — este ecrã é a parte "não é escondida" disso.
 */
export function WhatIsSharedScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>O que é partilhado</Text>

        <Item title="A sua localização" body="A família vê onde está, para poder ajudar se precisar." />
        <Item
          title="O botão SOS"
          body="Quando o carrega, a família recebe um aviso imediato com a sua localização."
        />
        <Item title="A bateria do telemóvel" body="A família vê se o telemóvel está com pouca bateria." />
        <Item
          title="Se o telemóvel ficar em silêncio"
          body="Se não houver sinal do telemóvel durante um tempo, a família é avisada."
        />

        <Text style={styles.footer}>Não partilhamos mensagens, chamadas nem o que faz no telemóvel.</Text>
      </ScrollView>

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{title}</Text>
      <Text style={styles.itemBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parede },
  scroll: { padding: space.lg },
  title: { fontSize: t.titulo, fontWeight: '700', color: colors.tinta, marginBottom: space.lg, textAlign: 'center' },
  item: { backgroundColor: colors.louca, borderRadius: 14, padding: space.md, marginBottom: space.sm },
  itemTitle: { fontSize: t.base, fontWeight: '700', color: colors.tinta },
  itemBody: { fontSize: t.base * 0.85, color: colors.tintaSuave, marginTop: 6, lineHeight: 26 },
  footer: { fontSize: t.base * 0.8, color: colors.tintaSuave, textAlign: 'center', marginTop: space.lg },
  backButton: {
    minHeight: touch.minimo,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  backButtonText: { fontSize: t.botao, color: colors.azulejo },
});
