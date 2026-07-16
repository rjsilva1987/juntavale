// src/screens/AdminSupportDetailScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { SUPPORT_CATEGORY_LABELS } from '@/constants/supportCategories';
import { theme } from '@/constants/theme';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import { getSupportTicket, updateTicketStatus, SupportTicket } from '@/services/supportService';

type AdminSupportDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'AdminSupportDetail'
>;

function categoryLabel(category: string): string {
  return (SUPPORT_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

export default function AdminSupportDetailScreen({
  route,
  navigation,
}: AdminSupportDetailScreenProps) {
  const { ticketId } = route.params;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  // undefined = ainda carregando, null = perfil não encontrado (uid órfão,
  // conta deletada) — distinto de "não carregou ainda" pra não piscar
  // "perfil não encontrado" antes da resposta chegar.
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    getSupportTicket(ticketId).then(async (t) => {
      setTicket(t);
      if (t) {
        setProfile(await getUserProfile(t.uid));
      }
      setLoading(false);
    });
  }, [ticketId]);

  const handleToggleStatus = () => {
    if (!ticket) return;
    const nextStatus = ticket.status === 'open' ? 'resolved' : 'open';
    setUpdating(true);
    updateTicketStatus(ticket.id, nextStatus)
      .then(() => setTicket({ ...ticket, status: nextStatus }))
      .catch((err) => {
        console.error(err);
        Alert.alert('Erro', 'Não foi possível atualizar o status do ticket.');
      })
      .finally(() => setUpdating(false));
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Ticket de suporte</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : !ticket ? (
          <View style={styles.center}>
            <Text style={styles.notFound}>Ticket não encontrado.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Autor</Text>
            <View style={styles.authorCard}>
              {profile?.photoURL ? (
                <Image
                  source={{ uri: profile.photoURL }}
                  style={styles.avatar}
                  contentFit="cover"
                  placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                  transition={200}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={{ fontSize: 20 }}>😊</Text>
                </View>
              )}
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>{profile?.name ?? 'Perfil não encontrado'}</Text>
                <Text style={styles.authorUid}>{ticket.uid}</Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Categoria</Text>
            <Text style={styles.category}>{categoryLabel(ticket.category)}</Text>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Mensagem</Text>
            <View style={styles.messageCard}>
              <Text style={styles.message} selectable>
                {ticket.message}
              </Text>
            </View>
            <Text style={styles.date}>
              {ticket.createdAt ? dayjs(ticket.createdAt.toDate()).format('DD/MM/YYYY HH:mm') : ''}
            </Text>

            <AnimatedPressable
              style={[
                styles.actionBtn,
                ticket.status === 'open' ? styles.resolveBtn : styles.reopenBtn,
              ]}
              onPress={handleToggleStatus}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator
                  color={ticket.status === 'open' ? theme.colors.white : theme.colors.primary}
                />
              ) : (
                <Text
                  style={ticket.status === 'open' ? styles.resolveBtnText : styles.reopenBtnText}
                >
                  {ticket.status === 'open' ? 'Marcar como resolvido' : 'Reabrir ticket'}
                </Text>
              )}
            </AnimatedPressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary },

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

  content: { padding: theme.spacing.md, paddingBottom: 40 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInfo: { flex: 1, gap: 2 },
  authorName: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
  authorUid: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },

  category: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },

  messageCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  message: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, marginTop: 8 },

  actionBtn: {
    marginTop: theme.spacing.xl,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resolveBtn: { backgroundColor: theme.colors.primary },
  resolveBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
  reopenBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  reopenBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.primary },
});
