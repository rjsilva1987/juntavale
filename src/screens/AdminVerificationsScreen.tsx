// src/screens/AdminVerificationsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import { getPendingVerifications, PendingVerification } from '@/services/verificationService';
import { getDisplayAge } from '@/utils/birthDate';

interface PendingEntry {
  uid: string;
  verification: PendingVerification;
  profile?: UserProfile;
}

export default function AdminVerificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const pending = await getPendingVerifications();
    const enriched = await Promise.all(
      pending.map(async (verification) => ({
        uid: verification.uid,
        verification,
        profile: (await getUserProfile(verification.uid)) ?? undefined,
      })),
    );
    setEntries(enriched);
    setLoading(false);
  }, []);

  // S94-B2 — useFocusEffect em vez de useEffect de montagem: a tela virou
  // Tab.Screen (S95) e fica montada pra sempre, então um useEffect só
  // rodaria uma vez e a lista congelaria enquanto o badge do admin
  // (AdminAlertContext) atualiza ao vivo. Recarrega sempre que a aba ganha
  // foco, sem duplicar a busca a cada render: `load` é useCallback com deps
  // vazio (linha acima), então o `useCallback` aqui também tem identidade
  // estável — o efeito só dispara quando a tela FOCA, não a cada render.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.canGoBack() && navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Verificações pendentes</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : entries.length === 0 ? (
          <EmptyState icon="shield-checkmark-outline" title="Nenhuma verificação pendente" />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            onRefresh={load}
            refreshing={loading}
            renderItem={({ item }) => {
              // S76-B2 — idade derivada de birthDate, ver getDisplayAge.
              const displayAge = getDisplayAge(item.profile);
              return (
                <AnimatedPressable
                  style={styles.card}
                  onPress={() =>
                    navigation.navigate('AdminVerificationDetail', { uid: item.uid })
                  }
                >
                  {item.profile?.photoURL ? (
                    <Image
                      source={{ uri: item.profile.photoURL }}
                      style={styles.avatar}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                      transition={200}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={{ fontSize: 24 }}>😊</Text>
                    </View>
                  )}
                  <View style={styles.info}>
                    <View style={styles.nameAgeGroup}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.profile?.name ?? 'Usuário'}
                      </Text>
                      {displayAge != null && <Text style={styles.nameAge}>, {displayAge}</Text>}
                    </View>
                    <Text style={styles.subLabel}>Pendente de revisão</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
                </AnimatedPressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 12,
    ...theme.shadows.medium,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  name: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text, flexShrink: 1 },
  subLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
  // S134 — nome e idade em Text separados: só o nome trunca (numberOfLines
  // no Text do nome), a idade nunca encolhe/corta.
  nameAgeGroup: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  nameAge: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
});
