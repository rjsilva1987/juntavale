// src/components/AchievementsCard.tsx
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ACHIEVEMENTS } from '@/constants/achievements';
import { theme } from '@/constants/theme';
import { useAchievements } from '@/hooks/useAchievements';

// S127 — Marcos e selos: card "Conquistas", só no próprio perfil (renderizado
// pela ProfileScreen sob a mesma condição `!editing && !isAdmin` das seções
// vizinhas). Mesmo padrão visual de título de seção + conteúdo condicional
// dos cards de Enquete/Prompt da semana já existentes ali. Lista as 3
// conquistas do catálogo estático (src/constants/achievements.ts),
// destacando as já desbloqueadas (unlockedIds, via useAchievements) das
// ainda bloqueadas — nenhum cálculo de desbloqueio acontece aqui, só leitura.
export function AchievementsCard() {
  const { unlockedIds, loading } = useAchievements();

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Conquistas</Text>
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        ACHIEVEMENTS.map((achievement) => {
          const unlocked = unlockedIds.includes(achievement.id);
          return (
            <View key={achievement.id} style={styles.row}>
              <View
                style={[
                  styles.iconWrap,
                  unlocked ? styles.iconWrapUnlocked : styles.iconWrapLocked,
                ]}
              >
                <Ionicons
                  name={achievement.icon}
                  size={20}
                  color={unlocked ? theme.colors.primary : theme.colors.textLight}
                />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.title, !unlocked && styles.titleLocked]}>
                  {achievement.title}
                </Text>
                <Text style={styles.description} numberOfLines={2}>
                  {achievement.description}
                </Text>
              </View>
              {unlocked && (
                <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnlocked: {
    backgroundColor: theme.colors.primaryLight,
  },
  iconWrapLocked: {
    backgroundColor: theme.colors.border,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  titleLocked: {
    color: theme.colors.textSecondary,
  },
  description: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
