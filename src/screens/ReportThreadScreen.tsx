// src/screens/ReportThreadScreen.tsx
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
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAlert } from '@/contexts/ReportAlertContext';
import { RootStackParamList } from '@/navigation';
import { REPORT_REASON_LABELS } from '@/services/blockService';
import {
  listenMyReports,
  listenReportMessages,
  sendReportMessage,
  Report,
  ReportMessage,
} from '@/services/reportService';

type ReportThreadScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportThread'>;

export default function ReportThreadScreen({ route, navigation }: ReportThreadScreenProps) {
  const { reportId } = route.params;
  const { user } = useAuth();

  // undefined = ainda carregando o primeiro snapshot, null = não
  // encontrada/sem permissão. Sem subscribeReport dedicado em
  // reportService.ts (só listenMyReports, que já lista todas as denúncias do
  // usuário) — filtra pelo id aqui em vez de acrescentar um listener novo só
  // pra isso; ganha de quebra o status reagindo em tempo real se o admin
  // resolver a denúncia enquanto esta tela está aberta, igual ao
  // subscribeSupportTicket de SupportThreadScreen.
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { showAlert, markSeen } = useReportAlert();

  // S84 — marcar como visto é REATIVO enquanto esta tela está aberta, mesmo
  // motivo do SupportThreadScreen: quem grava lastMessageAt/lastSenderId é a
  // Cloud Function onReportMessageCreated, que roda depois do envio. NADA de
  // markSeen() dentro de handleSend (lição do S84) — reagindo a showAlert o
  // carimbo sempre alcança o valor mais novo, sem acender o próprio aviso
  // quando quem escreveu foi o próprio usuário (ver ReportAlertContext).
  useEffect(() => {
    if (showAlert) markSeen();
  }, [showAlert, markSeen]);

  useEffect(() => {
    if (!user) return;
    const unsub = listenMyReports(user.uid, (reports) => {
      setReport(reports.find((r) => r.id === reportId) ?? null);
    });
    return unsub;
  }, [user, reportId]);

  useEffect(() => {
    const unsub = listenReportMessages(reportId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [reportId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || sending) return;
    setSending(true);
    try {
      await sendReportMessage(reportId, user.uid, trimmed);
      setText('');
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível enviar sua mensagem. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  // O usuário nunca vê nada sobre o denunciado (reportedId) aqui — só a
  // própria denúncia e a conversa com o admin. isMe é sempre relativo a
  // quem está vendo a tela (o denunciante), nunca ao admin.
  const renderMessage = ({ item }: { item: ReportMessage }) => {
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
  const isResolved = report?.status === 'resolved';

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
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
              {report ? REPORT_REASON_LABELS[report.reason] : 'Denúncia'}
            </Text>
            {report && (
              <View style={[styles.badge, isResolved ? styles.badgeResolved : styles.badgeOpen]}>
                <Text
                  style={[
                    styles.badgeText,
                    isResolved ? styles.badgeTextResolved : styles.badgeTextOpen,
                  ]}
                >
                  {isResolved ? 'Resolvido' : 'Aberto'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {report === undefined ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : report === null ? (
            <View style={styles.center}>
              <Text style={styles.notFound}>Denúncia não encontrada.</Text>
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

          {isResolved && (
            <View style={styles.resolvedBanner}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.text} />
              <Text style={styles.resolvedBannerText}>Esta denúncia foi resolvida.</Text>
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
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surface,
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
