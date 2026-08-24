// src/components/GroupFounderTag.tsx
//
// S124-B (camada 3 — Selo de fundador do grupo). Reuso 100% VISUAL do
// vocabulário do FounderBadge.tsx (paleta secondary/onSecondary, pill full)
// — NÃO é o mesmo componente, conceito diferente (fundador de grupo !=
// fundador do app 1-100, S51). Condicionado a uid === group.creatorId pelo
// CHAMADOR (GroupDetailScreen/GroupChatScreen) — este componente não recebe
// nem checa uid, só renderiza o badge quando o chamador decide mostrá-lo.
// SEM ligação com founderNumber/ACHIEVEMENT_IDS, sem escrita nova no
// Firestore, sem trigger novo — "fundador de grupo" já está disponível em
// group.creatorId.
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

// flexShrink: 0 de propósito, mesmo motivo do FounderBadge — quem cede
// espaço pro texto ao lado (nome/apelido) é o texto, nunca o badge.
export function GroupFounderTag() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text} numberOfLines={1}>
        Criador
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexShrink: 0,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.onSecondary,
  },
});
