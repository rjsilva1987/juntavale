// src/screens/AdminSupportDetailScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { MAX_NAME_LENGTH, MAX_NICKNAME_LENGTH } from '@/screens/ProfileScreen';
import {
  getUserProfile,
  getLegalName,
  adminUpdateUserNickname,
  adminUpdateUserLegalName,
  LegalName,
  UserProfile,
} from '@/services/firestoreService';
import { getSupportTicket, updateTicketStatus, SupportTicket } from '@/services/supportService';
import { getDisplayName } from '@/utils/profile';

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
  // S138 — nome real do autor do ticket. EXCEÇÃO NOVA E ESTREITA à regra da
  // S135 ("nunca mostrar legalName fora de AdminVerificationsScreen/
  // AdminVerificationDetailScreen", comentário logo abaixo em authorName):
  // aqui o admin precisa enxergar E editar o nome completo pra atender um
  // chamado de suporte de correção de nome/apelido — é a única outra tela
  // do app com esse acesso.
  const [legalName, setLegalName] = useState<LegalName | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [editingNames, setEditingNames] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [legalNameInput, setLegalNameInput] = useState('');
  const [savingNames, setSavingNames] = useState(false);

  useEffect(() => {
    getSupportTicket(ticketId).then(async (t) => {
      setTicket(t);
      if (t) {
        const [p, ln] = await Promise.all([getUserProfile(t.uid), getLegalName(t.uid)]);
        setProfile(p);
        setLegalName(ln);
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

  // S138 — abre o formulário de correção de nome/apelido, único ponto do
  // app (fora do próprio cadastro) que ainda grava nickname/legalName,
  // depois que a S138 travou os dois pro dono em firestore.rules.
  const handleOpenEditNames = () => {
    setNicknameInput(profile?.nickname ?? '');
    setLegalNameInput(legalName?.name ?? '');
    setEditingNames(true);
  };

  const handleSaveNames = () => {
    if (!ticket || !profile) return;
    const trimmedNickname = nicknameInput.trim();
    const trimmedLegalName = legalNameInput.trim();
    if (!trimmedNickname || trimmedNickname.length > MAX_NICKNAME_LENGTH) {
      Alert.alert('Apelido inválido', `Use até ${MAX_NICKNAME_LENGTH} caracteres.`);
      return;
    }
    if (!trimmedLegalName || trimmedLegalName.length > MAX_NAME_LENGTH) {
      Alert.alert('Nome completo inválido', `Use até ${MAX_NAME_LENGTH} caracteres.`);
      return;
    }
    setSavingNames(true);
    Promise.all([
      adminUpdateUserNickname(ticket.uid, trimmedNickname),
      adminUpdateUserLegalName(ticket.uid, trimmedLegalName),
    ])
      .then(() => {
        setProfile({ ...profile, nickname: trimmedNickname });
        setLegalName({ name: trimmedLegalName, createdAt: legalName?.createdAt });
        setEditingNames(false);
      })
      .catch((err) => {
        console.error(err);
        Alert.alert('Erro', 'Não foi possível salvar nome/apelido.');
      })
      .finally(() => setSavingNames(false));
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
                <Text style={styles.authorName}>
                  {/* S135 — fora de escopo mostrar o nome real aqui: getDisplayName
                      (nickname), NUNCA legalName. */}
                  {profile ? getDisplayName(profile) : 'Perfil não encontrado'}
                </Text>
                <Text style={styles.authorUid}>{ticket.uid}</Text>
              </View>
            </View>

            {/* S138 — EXCEÇÃO NOVA E ESTREITA à regra da S135 (comentário
                acima, em authorName: "nunca mostrar legalName fora de
                AdminVerificationsScreen/AdminVerificationDetailScreen"): o
                admin precisa ver e corrigir o nome real do autor aqui pra
                atender um chamado de suporte sobre nome/apelido incorretos
                — nickname/legalName ficaram imutáveis pro dono na S138, e
                esta tela é a única outra com esse acesso. */}
            {editingNames ? (
              <View style={styles.editNamesCard}>
                <Text style={styles.namesFieldLabel}>Apelido</Text>
                <TextInput
                  style={styles.namesInput}
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  maxLength={MAX_NICKNAME_LENGTH}
                  placeholder="Como quer ser chamado"
                  placeholderTextColor={theme.colors.textLight}
                />
                <Text style={styles.namesFieldLabel}>Nome completo</Text>
                <TextInput
                  style={styles.namesInput}
                  value={legalNameInput}
                  onChangeText={setLegalNameInput}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="Nome completo"
                  placeholderTextColor={theme.colors.textLight}
                />
                <View style={styles.editNamesActions}>
                  <AnimatedPressable
                    style={styles.cancelNamesBtn}
                    onPress={() => setEditingNames(false)}
                    disabled={savingNames}
                  >
                    <Text style={styles.cancelNamesBtnText}>Cancelar</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.saveNamesBtn}
                    onPress={handleSaveNames}
                    disabled={savingNames}
                  >
                    {savingNames ? (
                      <ActivityIndicator color={theme.colors.white} />
                    ) : (
                      <Text style={styles.saveNamesBtnText}>Salvar</Text>
                    )}
                  </AnimatedPressable>
                </View>
              </View>
            ) : (
              <AnimatedPressable style={styles.editNamesBtn} onPress={handleOpenEditNames}>
                <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.editNamesBtnText}>Editar nome/apelido</Text>
              </AnimatedPressable>
            )}

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
              style={styles.viewConversationBtn}
              onPress={() => navigation.navigate('SupportThread', { ticketId: ticket.id })}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.viewConversationBtnText}>Ver conversa</Text>
            </AnimatedPressable>

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
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surface,
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

  // S138 — mesmo padrão visual de viewConversationBtn/actionBtn acima
  // (borda arredondada, outline), só que compacto (sem marginTop.xl) por
  // ficar logo abaixo do authorCard, não no fim da tela.
  editNamesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 12,
  },
  editNamesBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.primary },
  editNamesCard: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  namesFieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
    marginTop: theme.spacing.sm,
  },
  namesInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  editNamesActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: theme.spacing.md,
  },
  cancelNamesBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 12,
  },
  cancelNamesBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  saveNamesBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 12,
  },
  saveNamesBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },

  category: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },

  messageCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  message: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, marginTop: 8 },

  viewConversationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 12,
  },
  viewConversationBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.primary,
  },

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
