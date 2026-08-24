// src/screens/AdminReportDetailScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import { isAdminUid } from '@/config/admin';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { REPORT_REASON_LABELS } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  getReport,
  listenReportMessages,
  sendReportMessage,
  setReportStatus,
  uploadReportImage,
  Report,
  ReportMessage,
} from '@/services/reportService';
import { getDisplayName } from '@/utils/profile';

type AdminReportDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminReportDetail'>;

// Conta denunciada/denunciante pode não existir mais — a function de apagar
// conta não apaga `reports` de propósito (ver reportService.ts). null ==
// perfil não encontrado, cai pro uid como fallback em vez de travar a tela.
//
// S135 — fora de escopo mostrar o nome real aqui: usa getDisplayName
// (nickname), NUNCA legalName — só a tela de verificação (Admin
// Verificações) mostra o nome real, decisão de produto explícita da sprint.
function partyLabel(uid: string, profile: UserProfile | null | undefined): string {
  if (profile === null) return 'Conta removida';
  return profile ? getDisplayName(profile) : uid;
}

export default function AdminReportDetailScreen({
  route,
  navigation,
}: AdminReportDetailScreenProps) {
  const { reportId } = route.params;
  const { user } = useAuth();
  // undefined = ainda carregando, null = denúncia não encontrada.
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [reporterProfile, setReporterProfile] = useState<UserProfile | null | undefined>(undefined);
  const [reportedProfile, setReportedProfile] = useState<UserProfile | null | undefined>(undefined);
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    getReport(reportId).then(async (r) => {
      setReport(r);
      if (r) {
        const [reporter, reported] = await Promise.all([
          getUserProfile(r.reporterId),
          getUserProfile(r.reportedId),
        ]);
        setReporterProfile(reporter);
        setReportedProfile(reported);
      }
    });
  }, [reportId]);

  useEffect(() => {
    const unsub = listenReportMessages(reportId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [reportId]);

  const isPending = report ? report.status === undefined || report.status === 'open' : false;

  const handleToggleStatus = () => {
    if (!report) return;
    const nextStatus = isPending ? 'resolved' : 'open';
    setUpdating(true);
    setReportStatus(report.id, nextStatus)
      .then(() => setReport({ ...report, status: nextStatus }))
      .catch((err) => {
        console.error(err);
        Alert.alert('Erro', 'Não foi possível atualizar o status da denúncia.');
      })
      .finally(() => setUpdating(false));
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !report || !user || sending) return;
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

  // S113 — mesmo padrão de handleSendImage do ChatScreen: sobe a foto,
  // manda a mensagem com texto vazio + imageUrl.
  const handleSendImage = async (uri: string) => {
    if (!report || !user) return;
    setUploadProgress(0);
    try {
      const imageUrl = await uploadReportImage(reportId, uri, setUploadProgress);
      await sendReportMessage(reportId, user.uid, '', imageUrl);
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      Alert.alert('Erro', 'Não foi possível enviar a imagem.');
    } finally {
      setUploadProgress(null);
    }
  };

  // Esta tela não tem Modal (sem attach sheet como o do ChatScreen) — o
  // Alert.alert nativo abaixo não corre o mesmo risco de picker travado no
  // iOS que o Modal do ChatScreen corre, então a proteção
  // pendingAttachActionRef/onDismiss não se aplica aqui (ver conclusão da
  // sprint S113).
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    handleSendImage(result.assets[0].uri);
  };

  const handlePickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    handleSendImage(result.assets[0].uri);
  };

  const handleAttachPhoto = () => {
    Alert.alert('Anexar foto', undefined, [
      { text: 'Tirar foto', onPress: handleTakePhoto },
      { text: 'Escolher da galeria', onPress: handlePickFromLibrary },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  // Thread é só entre quem denunciou e o admin — o denunciado nunca lê nem
  // escreve aqui (firestore.rules, reports/{reportId}/messages). isMe é
  // sempre relativo ao admin, que é quem sempre vê esta tela.
  const renderMessage = ({ item }: { item: ReportMessage }) => {
    const isMe = isAdminUid(item.senderId);
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
          <View
            style={[
              item.imageUrl ? styles.bubbleImageWrap : styles.bubble,
              isMe ? styles.bubbleMe : styles.bubbleOther,
            ]}
          >
            {item.imageUrl ? (
              <>
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.bubbleImage}
                  contentFit="cover"
                  placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                  transition={200}
                />
                <Text style={[styles.bubbleTime, styles.bubbleTimeImage]}>{timeLabel}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
                <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{timeLabel}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    );
  };

  const canSend = !!text.trim() && !sending && !!report;

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
          <Text style={styles.headerTitle}>Denúncia</Text>
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
              ListHeaderComponent={
                <View style={styles.detailCard}>
                  <View style={styles.detailTopRow}>
                    <Text style={styles.reason}>{REPORT_REASON_LABELS[report.reason]}</Text>
                    <View
                      style={[styles.badge, isPending ? styles.badgeOpen : styles.badgeResolved]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          isPending ? styles.badgeTextOpen : styles.badgeTextResolved,
                        ]}
                      >
                        {isPending ? 'Pendente' : 'Resolvida'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.date}>
                    {report.createdAt
                      ? dayjs(report.createdAt.toDate()).format('DD/MM/YYYY HH:mm')
                      : ''}
                  </Text>

                  {!!report.details && (
                    <>
                      <Text style={styles.fieldLabel}>Detalhes</Text>
                      <Text style={styles.fieldValue} selectable>
                        {report.details}
                      </Text>
                    </>
                  )}

                  <Text style={styles.fieldLabel}>Quem denunciou</Text>
                  <Text style={styles.fieldValue}>
                    {partyLabel(report.reporterId, reporterProfile)}
                  </Text>

                  <Text style={styles.fieldLabel}>Quem foi denunciado</Text>
                  <Text style={styles.fieldValue}>
                    {partyLabel(report.reportedId, reportedProfile)}
                  </Text>

                  {/* S102-C — presente só quando a denúncia partiu de uma
                      mensagem específica do chat (ChatScreen). messageText é
                      uma cópia truncada, não referência viva. */}
                  {!!report.messageId && (
                    <>
                      <Text style={styles.fieldLabel}>Mensagem denunciada</Text>
                      {!!report.messageText && (
                        <Text style={styles.fieldValue} selectable>
                          {report.messageText}
                        </Text>
                      )}
                      {!!report.messageImageUrl && (
                        <Image
                          source={{ uri: report.messageImageUrl }}
                          style={styles.reportedMessageImage}
                          contentFit="cover"
                          placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                        />
                      )}
                    </>
                  )}

                  {/* S121 — presente só quando a denúncia partiu de um
                      momento (story de 24h). momentoText é uma cópia
                      truncada, não referência viva — o momento pode ter
                      expirado ou sido apagado depois. */}
                  {!!report.momentoId && (
                    <>
                      <Text style={styles.fieldLabel}>Momento denunciado</Text>
                      {!!report.momentoText && (
                        <Text style={styles.fieldValue} selectable>
                          {report.momentoText}
                        </Text>
                      )}
                      {!!report.momentoPhotoUrl && (
                        <Image
                          source={{ uri: report.momentoPhotoUrl }}
                          style={styles.reportedMessageImage}
                          contentFit="cover"
                          placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                        />
                      )}
                    </>
                  )}

                  {/* S124-A — presente só quando a denúncia partiu de um
                      grupo (GroupDetailScreen/GroupChatScreen). groupName é
                      uma cópia truncada, não referência viva — o grupo pode
                      ter expirado ou sido apagado depois. Sem foto: grupo não
                      tem. */}
                  {!!report.groupId && (
                    <>
                      <Text style={styles.fieldLabel}>Grupo denunciado</Text>
                      {!!report.groupName && (
                        <Text style={styles.fieldValue} selectable>
                          {report.groupName}
                        </Text>
                      )}
                    </>
                  )}

                  {/* S125 — presente só quando a denúncia partiu de um
                      evento (EventDetailScreen). eventName é uma cópia
                      truncada, não referência viva — o evento pode ter
                      sido apagado depois (purge ~30 dias). Sem foto: evento
                      não tem. */}
                  {!!report.eventId && (
                    <>
                      <Text style={styles.fieldLabel}>Evento denunciado</Text>
                      {!!report.eventName && (
                        <Text style={styles.fieldValue} selectable>
                          {report.eventName}
                        </Text>
                      )}
                    </>
                  )}

                  <AnimatedPressable
                    style={[styles.actionBtn, isPending ? styles.resolveBtn : styles.reopenBtn]}
                    onPress={handleToggleStatus}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator
                        color={isPending ? theme.colors.white : theme.colors.primary}
                      />
                    ) : (
                      <Text style={isPending ? styles.resolveBtnText : styles.reopenBtnText}>
                        {isPending ? 'Marcar como resolvida' : 'Reabrir denúncia'}
                      </Text>
                    )}
                  </AnimatedPressable>

                  <Text style={styles.sectionTitle}>Conversa</Text>
                </View>
              }
            />
          )}

          {uploadProgress !== null && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}%</Text>
            </View>
          )}

          <View style={styles.inputRow}>
            <AnimatedPressable
              style={styles.attachBtn}
              onPress={handleAttachPhoto}
              disabled={!report}
            >
              <Ionicons name="camera-outline" size={22} color={theme.colors.textSecondary} />
            </AnimatedPressable>
            <TextInput
              style={styles.input}
              placeholder="Escreva sua mensagem..."
              placeholderTextColor={theme.colors.textLight}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              editable={!sending && !!report}
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
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  messagesList: { padding: theme.spacing.md, gap: 10, flexGrow: 1 },

  detailCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: 4,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.medium,
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reason: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  date: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, marginBottom: 4 },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  fieldValue: { fontSize: theme.fontSize.sm, color: theme.colors.text, lineHeight: 20 },
  // S102-C — thumbnail da mensagem denunciada (report.messageImageUrl).
  reportedMessageImage: {
    width: 160,
    height: 160,
    borderRadius: theme.borderRadius.md,
    marginTop: 4,
  },

  badge: { borderRadius: theme.borderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOpen: { backgroundColor: theme.colors.secondary },
  badgeResolved: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeText: { fontSize: theme.fontSize.xs, fontWeight: '700' },
  badgeTextOpen: { color: theme.colors.onSecondary },
  badgeTextResolved: { color: theme.colors.textSecondary },

  actionBtn: {
    marginTop: theme.spacing.lg,
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

  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.lg,
  },

  msgRow: { flexDirection: 'row' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  bubbleWrapMe: { maxWidth: '75%', alignItems: 'flex-end' },
  bubbleWrapOther: { maxWidth: '75%', alignItems: 'flex-start' },

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

  bubbleImageWrap: { borderRadius: theme.borderRadius.lg, overflow: 'hidden' },
  bubbleImage: { width: 200, height: 200, borderRadius: theme.borderRadius.lg },
  bubbleTimeImage: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    color: theme.colors.white,
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary },
  progressText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, width: 36 },

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
  attachBtn: { padding: 8 },
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
