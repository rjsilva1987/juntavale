// src/screens/MomentoRequestChatScreen.tsx
//
// S143-B — thread de um pedido de conversa sem match (momentoRequests/
// {requestId}), decisão 2/4: NUNCA cria/usa matches/, chat isolado a estes
// dois uids específicos. Mesmo molde de ReportThreadScreen.tsx (tela
// separada e mais simples, não uma reparametrização do ChatScreen gigante)
// — decisão 4 já exclui nenhuma feature de match se aplicar aqui (sem
// imagem/localização/reação/edição/apagar/typing/bloqueio/unmatch), então
// duplicar a UI mínima é mais barato e seguro do que abrir o ChatScreen
// (2000+ linhas, muito acoplado a matches/{matchId}) pra um caminho novo.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ReportModal } from '@/components/ReportModal';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { ReportReason, reportUser } from '@/services/blockService';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  answerMomentoRequest,
  declineMomentoRequest,
  listenMomentoRequestById,
  listenMomentoRequestMessages,
  markMomentoRequestSeen,
  MOMENTO_REQUEST_TEXT_MAX,
  MomentoRequest,
  MomentoRequestMessage,
  sendMomentoRequestMessage,
} from '@/services/momentoRequestService';
import { getDisplayName } from '@/utils/profile';

type MomentoRequestChatScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MomentoRequestChat'
>;

// O comentário/pedido inicial vive em momentoRequests/{requestId}.text (não
// na subcoleção messages) — este item sintético representa ele na mesma
// lista, sempre em primeiro (id fixo, nunca colide com um id de doc real do
// Firestore).
const INITIAL_MESSAGE_ID = '__initial__';

export default function MomentoRequestChatScreen({
  route,
  navigation,
}: MomentoRequestChatScreenProps) {
  const { requestId } = route.params;
  const { user } = useAuth();
  const [request, setRequest] = useState<MomentoRequest | null | undefined>(undefined);
  const [threadMessages, setThreadMessages] = useState<MomentoRequestMessage[]>([]);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = listenMomentoRequestById(requestId, setRequest);
    return unsub;
  }, [requestId]);

  useEffect(() => {
    const unsub = listenMomentoRequestMessages(requestId, (msgs) => {
      setThreadMessages(msgs);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [requestId]);

  const otherUid = useMemo(() => {
    if (!request || !user) return undefined;
    return request.authorId === user.uid ? request.senderId : request.authorId;
  }, [request, user]);

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    getUserProfile(otherUid)
      .then((profile) => {
        if (!cancelled) setOtherProfile(profile);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  const isAuthor = !!request && !!user && request.authorId === user.uid;
  const isPending = request?.status === 'pending';
  const isAnswered = request?.status === 'answered';
  const isDeclined = request?.status === 'declined';

  // S146 — badge "aceite→solicitante": marca o pedido como visto (fire-and-
  // forget, mesmo padrão de markMatchRead em ChatScreen.tsx) quando o
  // usuário logado é o SENDER, o pedido já saiu de pending (answered ou
  // declined) e ainda não tem `seenAt`. O autor nunca marca aqui — o dot
  // dele é outro ("solicitação→dono"), some ao ver os pedidos pendentes.
  useEffect(() => {
    if (!user || !request) return;
    if (request.senderId !== user.uid) return;
    if (request.status === 'pending') return;
    if (request.seenAt) return;
    markMomentoRequestSeen(requestId).catch(() => {});
  }, [user, request, requestId]);

  // Mensagem inicial (o comentário/pedido, sempre do senderId) + thread
  // respondida, nessa ordem — mesma junção "histórico + tempo real" do
  // ChatScreen, só que sem paginação (thread curta, isolada por decisão 4).
  const allMessages: MomentoRequestMessage[] = useMemo(() => {
    if (!request) return threadMessages;
    return [
      {
        id: INITIAL_MESSAGE_ID,
        senderId: request.senderId,
        text: request.text,
        createdAt: request.createdAt,
      },
      ...threadMessages,
    ];
  }, [request, threadMessages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || !request || sending) return;
    setSending(true);
    try {
      if (isPending && isAuthor) {
        await answerMomentoRequest(requestId, user.uid, trimmed);
      } else if (isAnswered) {
        await sendMomentoRequestMessage(requestId, user.uid, trimmed);
      }
      setText('');
    } catch (error) {
      console.error('[MomentoRequestChatScreen] falha ao enviar:', error);
      Alert.alert('Erro', 'Não foi possível enviar sua mensagem. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const handleDecline = () => {
    Alert.alert('Recusar pedido?', 'O remetente será avisado que você recusou.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Recusar',
        style: 'destructive',
        onPress: async () => {
          try {
            await declineMomentoRequest(requestId);
          } catch {
            Alert.alert('Erro', 'Não foi possível recusar o pedido agora.');
          }
        },
      },
    ]);
  };

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user || !request || !otherUid) return;
    await reportUser(
      user.uid,
      otherUid,
      reason,
      details,
      undefined,
      undefined,
      undefined,
      undefined,
      { momentoRequestId: requestId, momentoRequestSenderId: request.senderId },
    );
    setReportVisible(false);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
  };

  const renderMessage = ({ item }: { item: MomentoRequestMessage }) => {
    const isMe = item.senderId === user?.uid;
    const timeLabel = item.createdAt ? dayjs(item.createdAt.toDate()).format('HH:mm') : '';
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{timeLabel}</Text>
        </View>
      </View>
    );
  };

  const canSend = !!text.trim() && !sending && (isAnswered || (isPending && isAuthor));

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
            {otherProfile?.photoURL ? (
              <Image
                source={{ uri: otherProfile.photoURL }}
                style={styles.headerAvatar}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
              />
            ) : null}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {getDisplayName(otherProfile)}
            </Text>
          </View>
          {isPending && isAuthor ? (
            <AnimatedPressable onPress={handleDecline} style={styles.backBtn}>
              <Ionicons name="close-circle-outline" size={24} color={theme.colors.error} />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={() => setReportVisible(true)} style={styles.backBtn}>
              <Ionicons name="flag-outline" size={22} color={theme.colors.textSecondary} />
            </AnimatedPressable>
          )}
        </View>

        {/* S148 — momento de origem do pedido: cópia guardada em
            momentoSnapshot (sobrevive mesmo se o momento original já
            expirou). Mesmo molde visual do bloco item.momentoRef de
            ChatScreen.tsx (replyQuoteBox/replyQuoteName/replyQuoteText),
            SEM Pressable — não há como abrir o viewer de um momento que
            pode já ter expirado. */}
        {request && (
          <View style={styles.momentoQuoteBox}>
            <Text style={styles.momentoQuoteName} numberOfLines={1}>
              {isAuthor ? 'Seu momento' : `Momento de ${getDisplayName(otherProfile)}`}
            </Text>
            {request.momentoSnapshot.type === 'photo' && request.momentoSnapshot.photoUrl ? (
              <Image
                source={{ uri: request.momentoSnapshot.photoUrl }}
                style={styles.momentoQuoteThumb}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
              />
            ) : (
              <Text style={styles.momentoQuoteText} numberOfLines={2}>
                {request.momentoSnapshot.text}
              </Text>
            )}
          </View>
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {request === undefined ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : request === null ? (
            <View style={styles.center}>
              <Text style={styles.notFound}>Pedido não encontrado.</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={allMessages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              renderItem={renderMessage}
            />
          )}

          {isPending && !isAuthor && (
            <View style={styles.banner}>
              <Ionicons name="time-outline" size={16} color={theme.colors.text} />
              <Text style={styles.bannerText}>Aguardando o autor responder.</Text>
            </View>
          )}
          {isDeclined && (
            <View style={styles.banner}>
              <Ionicons name="close-circle-outline" size={16} color={theme.colors.text} />
              <Text style={styles.bannerText}>Este pedido foi recusado.</Text>
            </View>
          )}

          {(isAnswered || (isPending && isAuthor)) && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={
                  isPending ? 'Responder (aceita o pedido)...' : 'Escreva sua mensagem...'
                }
                placeholderTextColor={theme.colors.textLight}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={MOMENTO_REQUEST_TEXT_MAX}
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
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleReport}
        title="Denunciar conversa"
      />
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
  headerAvatar: { width: 30, height: 30, borderRadius: 15 },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },

  // S148 — molde do momento de origem no topo, mesmo vocabulário de
  // replyQuoteBox/replyQuoteName/replyQuoteText (ChatScreen.tsx): borda à
  // esquerda em primaryLight + itálico no texto.
  momentoQuoteBox: {
    paddingLeft: 8,
    paddingVertical: 8,
    paddingRight: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primaryLight,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
  },
  momentoQuoteName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  momentoQuoteText: {
    fontSize: theme.fontSize.sm,
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  momentoQuoteThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.sm,
    marginTop: 4,
  },

  messagesList: { padding: theme.spacing.md, gap: 10, flexGrow: 1 },

  msgRow: { flexDirection: 'row' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '75%',
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
  bubbleTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    alignSelf: 'flex-end',
  },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.secondaryLight,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
  },
  bannerText: { fontSize: theme.fontSize.sm, color: theme.colors.text, flexShrink: 1 },

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
