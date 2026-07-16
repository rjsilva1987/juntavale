// src/screens/SupportThreadScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ADMIN_UID } from '@/config/admin';
import { SUPPORT_CATEGORY_LABELS } from '@/constants/supportCategories';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  sendSupportMessage,
  subscribeSupportMessages,
  subscribeSupportTicket,
  SupportMessage,
  SupportTicket,
} from '@/services/supportService';

type SupportThreadScreenProps = NativeStackScreenProps<RootStackParamList, 'SupportThread'>;

// Categoria pode ter sido gravada com um valor fora do catálogo atual — cai
// pro texto cru (mesmo padrão de AdminSupportScreen/MyTicketsScreen).
function categoryLabel(category: string): string {
  return (SUPPORT_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

export default function SupportThreadScreen({ route, navigation }: SupportThreadScreenProps) {
  const { ticketId } = route.params;
  const { user } = useAuth();
  const isAdminViewer = user?.uid === ADMIN_UID;

  // undefined = ainda carregando o primeiro snapshot, null = não
  // encontrado/sem permissão (ticket apagado, por exemplo).
  const [ticket, setTicket] = useState<SupportTicket | null | undefined>(undefined);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = subscribeSupportTicket(ticketId, setTicket);
    return unsub;
  }, [ticketId]);

  useEffect(() => {
    const unsub = subscribeSupportMessages(ticketId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [ticketId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || sending) return;
    setSending(true);
    try {
      await sendSupportMessage(ticketId, user.uid, trimmed);
      setText('');
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível enviar sua mensagem. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: SupportMessage }) => {
    const isMe = item.senderId === user?.uid;
    const isFromAdmin = item.senderId === ADMIN_UID;
    const now = dayjs();
    const createdAt = item.createdAt ? dayjs(item.createdAt.toDate()) : null;
    const timeLabel = createdAt
      ? createdAt.isSame(now, 'day')
        ? createdAt.format('HH:mm')
        : createdAt.format('DD/MM HH:mm')
      : '';

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        <View style={isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther}>
          {!isMe && isFromAdmin && (
            <View style={styles.adminLabelRow}>
              <Ionicons name="shield-checkmark" size={12} color={theme.colors.primary} />
              <Text style={styles.adminLabelText}>Equipe JuntaVale</Text>
            </View>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{timeLabel}</Text>
          </View>
        </View>
      </View>
    );
  };

  const canSend = !!text.trim() && !sending;
  const showResolvedBanner = ticket?.status === 'resolved';

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      {/* Sem `edges` restrito: igual ChatScreen, precisa do inset de baixo
          (barra de gestos/botões do Android) pra não encobrir o input fixo
          no rodapé — telas de lista (BlockedUsers, MyTickets etc.) usam
          edges={['top']} de propósito porque não têm nada ancorado embaixo. */}
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {ticket ? categoryLabel(ticket.category) : 'Chamado'}
            </Text>
            {ticket && (
              <View
                style={[
                  styles.badge,
                  ticket.status === 'open' ? styles.badgeOpen : styles.badgeResolved,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    ticket.status === 'open' ? styles.badgeTextOpen : styles.badgeTextResolved,
                  ]}
                >
                  {ticket.status === 'open' ? 'Aberto' : 'Resolvido'}
                </Text>
              </View>
            )}
          </View>
          {isAdminViewer ? (
            <AnimatedPressable
              onPress={() => navigation.navigate('AdminSupportDetail', { ticketId })}
            >
              <Text style={styles.detailsLink}>Detalhes</Text>
            </AnimatedPressable>
          ) : (
            <View style={styles.backBtn} />
          )}
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {ticket === undefined ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : ticket === null ? (
            <View style={styles.center}>
              <Text style={styles.notFound}>Chamado não encontrado.</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              renderItem={renderMessage}
            />
          )}

          {showResolvedBanner && (
            <View style={styles.resolvedBanner}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.text} />
              <Text style={styles.resolvedBannerText}>
                {isAdminViewer
                  ? 'Chamado resolvido.'
                  : 'Este chamado foi resolvido. Responder irá reabri-lo.'}
              </Text>
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Escreva sua mensagem..."
              placeholderTextColor={theme.colors.textLight}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              editable={!sending}
            />
            <AnimatedPressable
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!canSend}
            >
              {sending ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Ionicons
                  name="send"
                  size={18}
                  color={canSend ? theme.colors.white : theme.colors.textLight}
                />
              )}
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  backBtn: { padding: 4, width: 34 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  detailsLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },

  badge: { borderRadius: theme.borderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOpen: { backgroundColor: theme.colors.secondary },
  badgeResolved: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeText: { fontSize: theme.fontSize.xs, fontWeight: '700' },
  badgeTextOpen: { color: theme.colors.onSecondary },
  badgeTextResolved: { color: theme.colors.textSecondary },

  messagesList: { padding: theme.spacing.md, gap: 10, flexGrow: 1 },

  msgRow: { flexDirection: 'row' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  bubbleWrapMe: { maxWidth: '75%', alignItems: 'flex-end' },
  bubbleWrapOther: { maxWidth: '75%', alignItems: 'flex-start' },

  adminLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    marginLeft: 4,
  },
  adminLabelText: { fontSize: theme.fontSize.xs, fontWeight: '700', color: theme.colors.primary },

  bubble: {
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleMe: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 20 },
  bubbleTextMe: { color: theme.colors.white },
  bubbleTime: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, alignSelf: 'flex-end' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },

  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.secondaryLight,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
  },
  resolvedBannerText: { fontSize: theme.fontSize.sm, color: theme.colors.text, flexShrink: 1 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    paddingHorizontal: 12,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.surface },
});
