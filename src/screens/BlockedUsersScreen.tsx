// src/screens/BlockedUsersScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getBlockedUsers, unblockUser } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';

type BlockedUsersScreenProps = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

interface BlockedEntry {
  uid: string;
  profile?: UserProfile;
}

export default function BlockedUsersScreen({ navigation }: BlockedUsersScreenProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BlockedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const blockedUids = await getBlockedUsers(user.uid);
    const enriched = await Promise.all(
      blockedUids.map(async (uid) => ({ uid, profile: (await getUserProfile(uid)) ?? undefined })),
    );
    setEntries(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnblock = (uid: string, name: string) => {
    if (!user) return;
    Alert.alert('Desbloquear usuário?', `${name} voltará a aparecer para você.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: async () => {
          setUnblockingUid(uid);
          try {
            await unblockUser(user.uid, uid);
            setEntries((prev) => prev.filter((e) => e.uid !== uid));
          } finally {
            setUnblockingUid(null);
          }
        },
      },
    ]);
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Usuários bloqueados</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : entries.length === 0 ? (
          <EmptyState icon="ban-outline" title="Nenhum usuário bloqueado" />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}
            renderItem={({ item }) => (
              <View style={styles.card}>
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
                <Text style={styles.name} numberOfLines={1}>
                  {item.profile?.name ?? 'Usuário'}
                </Text>
                <AnimatedPressable
                  style={styles.unblockBtn}
                  onPress={() => handleUnblock(item.uid, item.profile?.name ?? 'Usuário')}
                  disabled={unblockingUid === item.uid}
                >
                  {unblockingUid === item.uid ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Text style={styles.unblockBtnText}>Desbloquear</Text>
                  )}
                </AnimatedPressable>
              </View>
            )}
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
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
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
  name: { flex: 1, fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
  unblockBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  unblockBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '700' },
});
