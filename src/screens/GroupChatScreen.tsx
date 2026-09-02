// src/screens/GroupChatScreen.tsx
//
// S124-A decisão 11 — mirror CONCEITUAL de ChatScreen.tsx (mesmo vocabulário
// visual: SafeAreaView sem edges, bolha por remetente, composer com câmera +
// texto + enviar), mas escrito do zero em vez de reusar o componente
// inteiro: ChatScreen.tsx (2000+ linhas) tem reações, replyTo, tique de
// entregue/lido, edição e "apagar pros dois" TODOS entranhados na mesma
// `MessageBubble` interna (não exportada) e no mesmo `styles` do arquivo —
// separar só o subconjunto de texto+foto exigiria desmontar esse componente
// inteiro, mais caro do que escrever a versão mínima aqui. O CONTRATO DE
// DADOS fica restrito ao mínimo (ver groupService.ts/firestore.rules):
// reações (S149-B), replyTo (S149-C), edição (S149-D) e "apagar pra todos"
// (S149-E) já existem; SEM read-receipts nem "apagar só pra mim" (S85-A,
// fora do escopo do grupo).
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { GroupFounderTag } from '@/components/GroupFounderTag';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  getUserProfile,
  REACTION_EMOJIS,
  ReactionEmoji,
  UserProfile,
} from '@/services/firestoreService';
import {
  deleteGroupMessageForEveryone,
  editGroupMessage,
  getGroup,
  getMyMembership,
  GroupMessage,
  GroupMessageReplyTo,
  listenGroupMessages,
  listenGroupReactions,
  markGroupMessagesSeen,
  sendGroupMessage,
  setGroupMessageReaction,
  uploadGroupChatImage,
} from '@/services/groupService';
import { getDisplayName } from '@/utils/profile';
import { countCodePoints } from '@/utils/text';

type GroupChatScreenProps = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

const MAX_MESSAGE_LENGTH = 2000;
// S149-D — decisão do Raphael (26/08/2026): a janela de editar em grupo é a
// MESMA do 1:1 (EDIT_WINDOW_MS, ChatScreen.tsx:111) — mesmo valor literal,
// não existe fonte única compartilhada entre 1:1 e grupo hoje.
const GROUP_EDIT_WINDOW_MS = 60 * 60 * 1000;
// S149-E — decisão do Raphael (26/08/2026): a janela de apagar-pra-todos em
// grupo é a MESMA do 1:1 (DELETE_FOR_EVERYONE_WINDOW_MS, ChatScreen.tsx:107)
// — mesmo valor numérico, constante SEPARADA de propósito (mesmo padrão do
// 1:1: DELETE_FOR_EVERYONE_WINDOW_MS e EDIT_WINDOW_MS lá também são duas
// constantes distintas, mudar uma não pode mudar a outra em silêncio). Não
// reusa GROUP_EDIT_WINDOW_MS acima nem cria fonte compartilhada nova.
const GROUP_DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000;
// S149-C — mesma regra de truncamento de ChatScreen.tsx:74-82 (100 code
// points na citação; rules aceitam até 400, guarda de abuso — ver
// firestore.rules). Não reimporta de lá (const local, não exportada em
// ChatScreen.tsx) — mesma lógica via countCodePoints, sem slice por índice
// UTF-16.
const REPLY_QUOTE_LENGTH = 100;
const truncateReplyQuote = (value: string): string =>
  countCodePoints(value) > REPLY_QUOTE_LENGTH
    ? Array.from(value).slice(0, REPLY_QUOTE_LENGTH).join('')
    : value;

// S149-C (correção) — mensagem de foto é gravada com text: '' (ver
// sendGroupMessage/groupService.ts); sem isso a citação de uma resposta a
// foto saía em branco. Mesmo rótulo fixo, byte a byte, do preview de push
// (functions/src/index.ts) e do 1:1 (ChatScreen.tsx REPLY_QUOTE_PHOTO_LABEL).
// GroupMessage não tem campo `location` (ver groupService.ts) — sem ramo de
// localização aqui, ao contrário do buildReplyQuote do 1:1.
const REPLY_QUOTE_PHOTO_LABEL = '📷 Foto';
const buildGroupReplyQuote = (message: GroupMessage): string => {
  if (message.text) return truncateReplyQuote(message.text);
  if (message.imageUrl) return REPLY_QUOTE_PHOTO_LABEL;
  return '';
};

// S149-F — mirror estrutural de MessageBubble (ChatScreen.tsx:168, S157):
// extraído de dentro do renderMessage porque o "ler mais" (item 1, mirror de
// S130) precisa de useState LOCAL por bolha (textExpanded/isTextTruncated) —
// uma função-por-item passada direto como renderItem do FlatList não pode
// ter hooks (regra dos hooks quebra conforme a lista cresce/encolhe),
// precisa ser instanciada via JSX. React.memo pelo mesmo motivo do 1:1: a
// FlatList não deve re-renderizar todas as bolhas visíveis a cada digitação
// no composer.
interface GroupMessageBubbleProps {
  item: GroupMessage;
  isMe: boolean;
  senderName: string;
  creatorId: string | null;
  reactionEntries: [string, ReactionEmoji][];
  getReplySenderLabel: (senderId: string) => string;
  onViewImage: (imageUrl: string) => void;
  onLongPress: (message: GroupMessage) => void;
}

const GroupMessageBubble = React.memo(function GroupMessageBubble({
  item,
  isMe,
  senderName,
  creatorId,
  reactionEntries,
  getReplySenderLabel,
  onViewImage,
  onLongPress,
}: GroupMessageBubbleProps) {
  const imageUrl = item.imageUrl;
  const replyTo = item.replyTo;
  // S149-F (item 1) — mirror EXATO de textExpanded/isTextTruncated
  // (ChatScreen.tsx:196-197, S130): colapso de texto longo por bolha, teto
  // de 6 linhas (numberOfLines/e.nativeEvent.lines.length abaixo), NÃO
  // caracteres — sem relação com MAX_MESSAGE_LENGTH do TextInput.
  const [textExpanded, setTextExpanded] = useState(false);
  const [isTextTruncated, setIsTextTruncated] = useState(false);

  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {!isMe && !!senderName && (
          <View style={styles.senderNameRow}>
            <Text style={styles.senderName}>{senderName}</Text>
            {!!creatorId && item.senderId === creatorId && <GroupFounderTag />}
          </View>
        )}
        {/* S149-C — preview compacto da mensagem citada, mirror visual de
            ChatScreen.tsx:330-343. Sem Pressable/onJumpToReply: scroll até
            a mensagem original é EXPLICITAMENTE fora do escopo (S149-C
            item 7). */}
        {replyTo && (
          <View style={styles.replyQuoteBox}>
            <Text
              style={[styles.replyQuoteName, isMe && styles.replyQuoteTextMe]}
              numberOfLines={1}
            >
              {getReplySenderLabel(replyTo.senderId)}
            </Text>
            <Text
              style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]}
              numberOfLines={2}
            >
              {replyTo.text}
            </Text>
          </View>
        )}
        {/* S149-E — lápide: mensagem apagada pra todos. Guarda antes do
            ternário de imagem/texto — mirror de ChatScreen.tsx:370-379. */}
        {item.deletedAt ? (
          <Text style={[styles.bubbleTextDeleted, isMe && styles.bubbleTextDeletedMe]}>
            Esta mensagem foi apagada
          </Text>
        ) : imageUrl ? (
          <Pressable onPress={() => onViewImage(imageUrl)} onLongPress={() => onLongPress(item)}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.bubbleImage}
              contentFit="cover"
              placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
              transition={200}
            />
          </Pressable>
        ) : (
          // S149-F (item 1) / S158 — mirror EXATO de ChatScreen.tsx:419-459:
          // numberOfLines colapsa em 6 linhas até textExpanded virar true. A
          // medição fica num Text "espelho" à parte (sem numberOfLines,
          // invisível, position absolute por cima do Text visível), não no
          // Text visível — no Fabric (RN 0.81/Expo 54), onTextLayout de um
          // Text que já tem numberOfLines aplicado reporta as linhas JÁ
          // truncadas, então "ler mais" nunca aparecia, mesmo em mensagem
          // longa.
          <>
            <View style={styles.bubbleTextWrap}>
              <Text
                style={[styles.bubbleText, isMe && styles.bubbleTextMe]}
                onLongPress={() => onLongPress(item)}
                numberOfLines={textExpanded ? undefined : 6}
              >
                {item.text}
              </Text>
              {/* S167 — pointerEvents="none" é no-op em Text no Android (RN 0.81); por isso o wrapper View. */}
              <View style={styles.bubbleTextMirrorWrap} pointerEvents="none">
                <Text
                  style={[styles.bubbleText, isMe && styles.bubbleTextMe, styles.bubbleTextMirror]}
                  onTextLayout={(e) => {
                    if (!isTextTruncated && e.nativeEvent.lines.length > 6) {
                      setIsTextTruncated(true);
                    }
                  }}
                >
                  {item.text}
                </Text>
              </View>
            </View>
            {isTextTruncated && !textExpanded && (
              <Pressable onPress={() => setTextExpanded(true)}>
                <Text style={[styles.bubbleReadMore, isMe && styles.bubbleReadMoreMe]}>
                  ler mais
                </Text>
              </Pressable>
            )}
          </>
        )}
        <View style={styles.bubbleTimeRow}>
          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
            {item.createdAt ? dayjs(item.createdAt.toDate()).format('HH:mm') : ''}
          </Text>
          {/* S149-D — "editada" ao lado da hora, mirror de
              ChatScreen.tsx:454-466. */}
          {item.editedAt && (
            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>editada</Text>
          )}
        </View>
        {/* S149-E — reações somem da lápide, mirror de ChatScreen.tsx:489
            (!item.deletedAt && reactionEntries.length > 0). */}
        {!item.deletedAt && reactionEntries.length > 0 && (
          <View style={[styles.reactionBadgeRow, isMe && styles.reactionBadgeRowMe]}>
            {reactionEntries.map(([uid, emoji]) => (
              <Text key={uid} style={styles.reactionBadge}>
                {emoji}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

export default function GroupChatScreen({ route, navigation }: GroupChatScreenProps) {
  const { groupId, groupName } = route.params;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, UserProfile | null>>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, Record<string, ReactionEmoji>>>({});
  const [reactionTarget, setReactionTarget] = useState<GroupMessage | null>(null);
  // S149-C — mirror de replyTarget (ChatScreen.tsx): setado pelo sheet de
  // toque longo (opção "Responder"), consumido em handleSend abaixo (mesmo
  // padrão do 1:1: handleSendImage NUNCA anexa replyTo), limpo depois do
  // envio.
  const [replyTarget, setReplyTarget] = useState<GroupMessageReplyTo | null>(null);
  // S149-D — editTarget: mensagem escolhida pra editar (mostra a barra de
  // edição acima do input, espelhando replyTarget), mirror de editTarget
  // (ChatScreen.tsx:537-539). Guarda a GroupMessage inteira (não só o texto)
  // porque canEdit/handleSend precisam de id/senderId/createdAt/imageUrl.
  const [editTarget, setEditTarget] = useState<GroupMessage | null>(null);
  const flatListRef = useRef<FlatList<GroupMessage>>(null);

  // S124-B (camada 3 — Selo de fundador do grupo) — a tela hoje só recebe
  // groupId/groupName via route params (ver comentário de RootStackParamList
  // acima), sem creatorId; getGroup(groupId) já existe em groupService.ts
  // (S124-A) — busca uma vez no mount em vez de alterar
  // RootStackParamList/os call sites de navigation.navigate.
  useEffect(() => {
    getGroup(groupId)
      .then((g) => setCreatorId(g?.creatorId ?? null))
      .catch((err) => console.error('[GroupChatScreen] falha ao carregar grupo:', err));
  }, [groupId]);

  useEffect(() => {
    if (!user) return;
    // S124-A-fix (correção pós-auditoria) — .catch adicionado: sem isto,
    // uma falha aqui (rede) sumia em silêncio, sem log — isMember ficava
    // preso em `null` (nem bloqueia nem libera o composer explicitamente,
    // já que só `isMember === false` mostra o banner de bloqueio), mas o
    // erro em si nunca aparecia em lugar nenhum.
    getMyMembership(groupId, user.uid)
      .then((m) => setIsMember(!!m))
      .catch((err) => console.error('[GroupChatScreen] falha ao checar participação:', err));
  }, [groupId, user]);

  // S150 — badge "mensagem nova em grupo": marca messagesSeenAt no mount
  // (fire-and-forget, mesmo padrão de markMatchRead em ChatScreen.tsx),
  // SEMPRE que isMember é true — precisa acompanhar mensagem nova a cada
  // vez que a tela abre, DISTINTO de markGroupMembershipSeen
  // (GroupDetailScreen.tsx), que só marca uma vez (badge "aceite→
  // solicitante", S146, não mexer).
  useEffect(() => {
    if (!user || !isMember) return;
    markGroupMessagesSeen(groupId, user.uid).catch(() => {});
  }, [user, isMember, groupId]);

  useEffect(() => {
    const unsubscribe = listenGroupMessages(groupId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return unsubscribe;
  }, [groupId]);

  // S149-B — reações, mirror do listener de matches/{matchId}/reactions
  // (ChatScreen.tsx, S80-B).
  useEffect(() => {
    const unsubscribe = listenGroupReactions(groupId, setReactions);
    return unsubscribe;
  }, [groupId]);

  // S149-D — preenche o input com o texto quando entra em modo edição,
  // mirror de ChatScreen.tsx:863-868.
  useEffect(() => {
    if (editTarget) {
      setText(editTarget.text);
    }
  }, [editTarget]);

  useEffect(() => {
    const missing = Array.from(new Set(messages.map((m) => m.senderId))).filter(
      (uid) => !(uid in senderProfiles),
    );
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (uid) => [uid, await getUserProfile(uid)] as const),
      );
      setSenderProfiles((prev) => {
        const next = { ...prev };
        entries.forEach(([uid, p]) => {
          next[uid] = p;
        });
        return next;
      });
    })();
  }, [messages, senderProfiles]);

  const isUnverified = !profile?.verified;

  const handleSend = useCallback(async () => {
    if (!user || !text.trim()) return;
    const value = text.trim();

    // S149-D — modo edição: chama editGroupMessage em vez de
    // sendGroupMessage, mirror de handleSend (ChatScreen.tsx:994-1006).
    // editTarget e replyTarget podem coexistir em estado (o 1:1 não os
    // exclui mutuamente — ver ChatScreen.tsx), mas edição tem precedência
    // aqui do mesmo jeito que lá.
    if (editTarget) {
      try {
        await editGroupMessage(groupId, editTarget.id, value);
        setText('');
        setEditTarget(null);
      } catch (err) {
        // Falha mantém texto e modo de edição de propósito: a rule pode
        // negar (fora da janela de 1h) e o usuário não pode perder o que
        // digitou — mesmo raciocínio do 1:1.
        console.warn('[GroupChatScreen] falha ao editar mensagem:', err);
      }
      return;
    }

    // S149-C — mirror de handleSend (ChatScreen.tsx:1011-1027): consome
    // replyTarget aqui, limpa depois do envio (independente de sucesso, mesmo
    // padrão do 1:1 — corrigir a resposta errada exige tocar em "Responder"
    // de novo, não guardar o estado numa falha de rede).
    const replyTo = replyTarget ?? undefined;
    setText('');
    setReplyTarget(null);
    try {
      await sendGroupMessage(groupId, user.uid, value, undefined, replyTo);
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      console.error('[GroupChatScreen] falha ao enviar mensagem:', err);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    }
  }, [editTarget, groupId, replyTarget, text, user]);

  const handleSendImage = useCallback(
    async (localUri: string) => {
      if (!user) return;
      setUploadProgress(0);
      try {
        const imageUrl = await uploadGroupChatImage(groupId, localUri, setUploadProgress);
        await sendGroupMessage(groupId, user.uid, '', imageUrl);
        flatListRef.current?.scrollToEnd({ animated: true });
      } catch (err) {
        console.error('[GroupChatScreen] falha ao enviar foto:', err);
        Alert.alert('Erro', 'Não foi possível enviar a foto.');
      } finally {
        setUploadProgress(null);
      }
    },
    [groupId, user],
  );

  const handleTakePhoto = async () => {
    setAttachSheetVisible(false);
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
    setAttachSheetVisible(false);
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

  // S149-C — mirror de `replyTo.senderId === currentUid ? 'Você' : otherName`
  // (ChatScreen.tsx:337/1478), adaptado: grupo tem N remetentes possíveis
  // (1:1 só tem "eu" e "otherName" fixo), então resolve por senderProfiles em
  // vez de um nome único. Mesma regra de "ainda carregando" de senderName
  // acima (undefined = '', não 'Usuário').
  const getReplySenderLabel = (senderId: string): string => {
    if (senderId === user?.uid) return 'Você';
    const p = senderProfiles[senderId];
    return p === undefined ? '' : getDisplayName(p);
  };

  // S149-D — guarda de UI, mirror de canEdit (ChatScreen.tsx:1261-1269):
  // verdadeiro só pra mensagem própria de texto, ainda não editada fora da
  // janela, dentro de GROUP_EDIT_WINDOW_MS. reactionTarget é o mesmo state
  // usado pelo sheet de toque longo (mensagem tocada), papel equivalente a
  // replyOptionsTarget no 1:1.
  // S149-E (ajuste) — GroupMessage agora tem deletedAt; guarda
  // "!reactionTarget.deletedAt" acrescentada pra mensagem apagada não
  // oferecer mais "Editar" (mesmo raciocínio do 1:1: lápide não é editável).
  const canEdit =
    !!reactionTarget &&
    reactionTarget.senderId === user?.uid &&
    !reactionTarget.deletedAt &&
    !reactionTarget.imageUrl &&
    (!reactionTarget.createdAt ||
      Date.now() - reactionTarget.createdAt.toMillis() < GROUP_EDIT_WINDOW_MS);

  // S149-E — guarda de UI, mirror de canDeleteForEveryone (ChatScreen.tsx:
  // 1251-1257): verdadeiro só pra própria mensagem (SÓ O AUTOR — sem exceção
  // pro criador/dono do grupo, decisão do Raphael 26/08/2026), ainda não
  // apagada, dentro da janela de GROUP_DELETE_FOR_EVERYONE_WINDOW_MS.
  const canDeleteForEveryone =
    !!reactionTarget &&
    reactionTarget.senderId === user?.uid &&
    !reactionTarget.deletedAt &&
    (!reactionTarget.createdAt ||
      Date.now() - reactionTarget.createdAt.toMillis() < GROUP_DELETE_FOR_EVERYONE_WINDOW_MS);

  // S149-F (item 2) — guarda de "copiar", mirror ADAPTADO de canCopy
  // (ChatScreen.tsx:1311-1316, S142): vale pra mensagem de qualquer um dos
  // membros, sem janela de tempo (diferente de canEdit/canDeleteForEveryone).
  // Sem checo de `location` — GroupMessage (groupService.ts:131-144) não tem
  // esse campo, referenciá-lo quebraria o tsc. !!reactionTarget.text barra
  // foto (text === '') e mensagem apagada (lápide, sem text).
  const canCopy =
    !!reactionTarget &&
    !reactionTarget.deletedAt &&
    !reactionTarget.imageUrl &&
    !!reactionTarget.text;

  // S149-F (item 3) — renderMessage só computa as props derivadas do estado
  // da tela (isMe, senderName, reactionEntries) e instancia GroupMessageBubble
  // via JSX, mirror de renderMessage/<MessageBubble/> (ChatScreen.tsx:
  // 1243-1245+, S157). O JSX inteiro da bolha migrou pra dentro do
  // componente acima.
  const renderMessage = ({ item }: { item: GroupMessage }) => {
    const isMe = item.senderId === user?.uid;
    const senderProfile = senderProfiles[item.senderId];
    const senderName = senderProfile === undefined ? '' : getDisplayName(senderProfile);
    // S149-B — mirror de reactionEntries (ChatScreen.tsx:214-216).
    const reactionEntries: [string, ReactionEmoji][] = reactions[item.id]
      ? Object.entries(reactions[item.id]).sort(([a], [b]) => a.localeCompare(b))
      : [];
    return (
      <GroupMessageBubble
        item={item}
        isMe={isMe}
        senderName={senderName}
        creatorId={creatorId}
        reactionEntries={reactionEntries}
        getReplySenderLabel={getReplySenderLabel}
        onViewImage={setViewerImage}
        onLongPress={setReactionTarget}
      />
    );
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
          <Text style={styles.headerName} numberOfLines={1}>
            {groupName}
          </Text>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              renderItem={renderMessage}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <EmptyState
                  icon="chatbubble-ellipses-outline"
                  title="Comece a conversa!"
                  subtitle={`Diga olá para o grupo ${groupName}`}
                />
              }
            />
          )}

          {uploadProgress !== null && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}%</Text>
            </View>
          )}

          {isMember === false ? (
            <View
              style={[styles.blockedBanner, { paddingBottom: theme.spacing.md + insets.bottom }]}
            >
              <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.blockedBannerText}>Você não é mais membro deste grupo</Text>
            </View>
          ) : isUnverified ? (
            <Pressable
              style={[styles.blockedBanner, { paddingBottom: theme.spacing.md + insets.bottom }]}
              onPress={() => navigation.navigate('Verification')}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.blockedBannerText}>Verifique seu perfil para conversar</Text>
            </Pressable>
          ) : (
            <>
              {/* S149-C — barra de citação, mirror exato de
                  ChatScreen.tsx:1473-1496. Cancelar (X) só limpa o estado —
                  nada é persistido. */}
              {replyTarget && (
                <View style={styles.replyBar}>
                  <View style={styles.replyBarAccent} />
                  <View style={styles.replyBarTextWrap}>
                    <Text style={styles.replyBarName}>
                      {getReplySenderLabel(replyTarget.senderId)}
                    </Text>
                    {/* S149-C (correção) — replyTarget: GroupMessageReplyTo não
                        tem imageUrl (mirror reduzido de GroupMessage); o
                        rótulo "📷 Foto" já vem pronto de buildGroupReplyQuote
                        no ponto em que replyTarget é montado (sheet
                        "Responder" acima), então .text aqui já é o valor
                        final — sem recomputar. */}
                    <Text style={styles.replyBarText} numberOfLines={1}>
                      {replyTarget.text}
                    </Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => setReplyTarget(null)}
                    hitSlop={8}
                    accessibilityLabel="Cancelar resposta"
                  >
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                  </AnimatedPressable>
                </View>
              )}
              {/* S149-D — barra de edição, mirror exato de
                  ChatScreen.tsx:1498-1515. */}
              {editTarget && (
                <View style={styles.replyBar}>
                  <View style={styles.replyBarAccent} />
                  <View style={styles.replyBarTextWrap}>
                    <Text style={styles.replyBarName}>Editando mensagem</Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => {
                      setEditTarget(null);
                      setText('');
                    }}
                    hitSlop={8}
                    accessibilityLabel="Cancelar edição"
                  >
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                  </AnimatedPressable>
                </View>
              )}
              <View style={[styles.inputRow, { paddingBottom: theme.spacing.sm + insets.bottom }]}>
                <AnimatedPressable
                  style={styles.inputIcon}
                  onPress={() => setAttachSheetVisible(true)}
                >
                  <Ionicons name="camera-outline" size={24} color={theme.colors.textSecondary} />
                </AnimatedPressable>
                <TextInput
                  style={styles.input}
                  placeholder={`Mensagem para ${groupName}…`}
                  placeholderTextColor={theme.colors.textLight}
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={MAX_MESSAGE_LENGTH}
                />
                <AnimatedPressable
                  style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!text.trim()}
                >
                  <Ionicons
                    name="send"
                    size={18}
                    color={text.trim() ? theme.colors.onSecondary : theme.colors.textLight}
                  />
                </AnimatedPressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={attachSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachSheetVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setAttachSheetVisible(false)}>
          <View style={styles.sheet}>
            <AnimatedPressable style={styles.sheetOption} onPress={handleTakePhoto}>
              <Ionicons name="camera" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Tirar foto</Text>
            </AnimatedPressable>
            <View style={styles.sheetDivider} />
            <AnimatedPressable style={styles.sheetOption} onPress={handlePickFromLibrary}>
              <Ionicons name="images" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Escolher da galeria</Text>
            </AnimatedPressable>
            <View style={styles.sheetGap} />
            <AnimatedPressable
              style={styles.sheetCancel}
              onPress={() => setAttachSheetVisible(false)}
            >
              <Text style={styles.sheetCancelText}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Modal>

      {/* S149-B — sheet do toque longo: mirror do sheet de reação do
          ChatScreen.tsx (1:1, S80-A/B). S149-C acrescentou "Responder",
          S149-D acrescentou "Editar" e S149-E acrescentou "Apagar pra
          todos" (mesmo sheet, sem Modal paralelo) — "apagar só pra mim"
          (S85-A) continua fora do escopo. */}
      <Modal
        visible={!!reactionTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setReactionTarget(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setReactionTarget(null)}>
          <View style={styles.sheet}>
            <View style={styles.reactionRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <AnimatedPressable
                  key={emoji}
                  style={styles.reactionButton}
                  onPress={() => {
                    if (reactionTarget && user?.uid) {
                      const current = reactions[reactionTarget.id]?.[user.uid];
                      const next = current === emoji ? null : emoji;
                      setGroupMessageReaction(groupId, reactionTarget.id, user.uid, next).catch(
                        (err) => console.warn('[GroupChatScreen] falha ao gravar reação', err),
                      );
                    }
                    setReactionTarget(null);
                  }}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </AnimatedPressable>
              ))}
            </View>
            {/* S149-C — "Responder", mirror exato de ChatScreen.tsx:1624-1634
                (sheetDivider + sheetOption, ícone arrow-undo). Fecha o sheet
                e monta o replyTarget com o texto já truncado (mesma regra do
                1:1) a partir da mensagem tocada. */}
            <View style={styles.sheetDivider} />
            <AnimatedPressable
              style={styles.sheetOption}
              onPress={() => {
                if (reactionTarget) {
                  setReplyTarget({
                    messageId: reactionTarget.id,
                    text: buildGroupReplyQuote(reactionTarget),
                    senderId: reactionTarget.senderId,
                  });
                }
                setReactionTarget(null);
              }}
            >
              <Ionicons name="arrow-undo" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Responder</Text>
            </AnimatedPressable>
            {/* S149-F (item 2) — "Copiar mensagem", mirror exato de
                ChatScreen.tsx:1662-1680 (S142): qualquer lado, sem janela de
                tempo, só texto ainda não apagado (guarda canCopy acima). */}
            {canCopy && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={async () => {
                    const target = reactionTarget;
                    setReactionTarget(null);
                    if (!target?.text) return;
                    await Clipboard.setStringAsync(target.text);
                  }}
                >
                  <Ionicons name="copy-outline" size={22} color={theme.colors.text} />
                  <Text style={styles.sheetOptionText}>Copiar mensagem</Text>
                </AnimatedPressable>
              </>
            )}
            {/* S149-D — "Editar": só em mensagem própria de texto, ainda não
                editada fora da janela — mirror exato de
                ChatScreen.tsx:1654-1670 (sheetDivider + sheetOption, ícone
                pencil). */}
            {canEdit && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    setEditTarget(reactionTarget);
                    setReactionTarget(null);
                  }}
                >
                  <Ionicons name="pencil" size={22} color={theme.colors.text} />
                  <Text style={styles.sheetOptionText}>Editar</Text>
                </AnimatedPressable>
              </>
            )}
            {/* S149-E — "Apagar pra todos": vira lápide pra todo mundo do
                grupo. Só o AUTOR (sem exceção pro criador/dono do grupo,
                decisão do Raphael 26/08/2026), dentro da janela de 1h —
                mirror de canDeleteForEveryone/sheetOption de "Apagar pros
                dois" (ChatScreen.tsx:1703-1738), com Alert.alert de
                confirmação ANTES de chamar deleteGroupMessageForEveryone,
                mesma guarda client-side-primeiro (bug do S49). */}
            {canDeleteForEveryone && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    const target = reactionTarget;
                    setReactionTarget(null);
                    if (!target) return;
                    Alert.alert(
                      'Apagar pra todos',
                      'Essa mensagem vira "apagada" pra todos e não pode ser desfeito. Continuar?',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Apagar',
                          style: 'destructive',
                          onPress: () => {
                            deleteGroupMessageForEveryone(
                              groupId,
                              target.id,
                              target.imageUrl,
                            ).catch((err) =>
                              console.warn('[GroupChatScreen] falha ao apagar mensagem', err),
                            );
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Ionicons name="trash-bin-outline" size={22} color={theme.colors.nope} />
                  <Text style={[styles.sheetOptionText, { color: theme.colors.nope }]}>
                    Apagar pra todos
                  </Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!viewerImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerImage(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerImage(null)}>
          {viewerImage && (
            <Image source={{ uri: viewerImage }} style={styles.viewerImage} contentFit="contain" />
          )}
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
  },
  backBtn: { padding: 4, width: 34 },
  headerName: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
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
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  // S124-B (camada 3) — linha própria pro nome + GroupFounderTag, mesmo
  // padrão de nameRow (ProfileScreen: nome + VerifiedBadge/FounderBadge).
  senderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  senderName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  bubbleText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 20 },
  bubbleTextMe: { color: theme.colors.white },
  // S158 — mirror exato de bubbleTextWrap/bubbleTextMirror
  // (ChatScreen.tsx): wrapper do Text visível + Text espelho, position
  // 'relative' garante que o espelho (position absolute) se posicione
  // relativo a este wrapper, não à bolha inteira.
  bubbleTextWrap: { position: 'relative' },
  bubbleTextMirrorWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  bubbleTextMirror: { opacity: 0 },
  // S149-F (item 1) — "ler mais" da bolha colapsada, mirror EXATO de
  // bubbleReadMore/bubbleReadMoreMe (ChatScreen.tsx:1996-2002, S130).
  bubbleReadMore: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 2,
  },
  bubbleReadMoreMe: { color: theme.colors.white, textDecorationLine: 'underline' },
  // S149-E — lápide de mensagem apagada "pra todos": mirror exato de
  // bubbleTextDeleted/bubbleTextDeletedMe (ChatScreen.tsx:1978-1984).
  bubbleTextDeleted: {
    fontSize: theme.fontSize.md,
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  bubbleTextDeletedMe: { color: 'rgba(255,255,255,0.85)' },
  // S149-C — mirror EXATO de ChatScreen.tsx:1990-2006 (citação dentro da
  // bolha: borda à esquerda em primaryLight + itálico).
  replyQuoteBox: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primaryLight,
    marginBottom: 4,
  },
  replyQuoteName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  replyQuoteText: {
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
  },
  replyQuoteTextMe: { color: 'rgba(255,255,255,0.85)' },
  bubbleImage: { width: 200, height: 200, borderRadius: theme.borderRadius.md },
  bubbleTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
  },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },
  // S149-D — mirror de bubbleTimeRow (ChatScreen.tsx:2013): agrupa hora +
  // indicador "editada" na mesma linha, alinhados à direita da bolha.
  bubbleTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end' },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  progressText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },

  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  blockedBannerText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },

  // S149-C — mirror EXATO de ChatScreen.tsx:2105-2131 (barra de citação
  // acima do input).
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  replyBarAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.primaryLight,
    borderRadius: 1,
  },
  replyBarTextWrap: { flex: 1 },
  replyBarName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  replyBarText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },

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
  inputIcon: { padding: 6, paddingBottom: 8 },
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
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.surface },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: 32,
  },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  sheetOptionText: { fontSize: theme.fontSize.md, color: theme.colors.text },
  sheetDivider: { height: 0.5, backgroundColor: theme.colors.border },
  sheetGap: { height: 8 },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  sheetCancelText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.nope },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },

  // S149-B — mirror EXATO de ChatScreen.tsx:2013-2015 (badge) e :2060-2070
  // (sheet de reação).
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  reactionButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  reactionEmoji: { fontSize: theme.fontSize.xl },
  reactionBadgeRow: { flexDirection: 'row', gap: 2, alignSelf: 'flex-start' },
  reactionBadgeRowMe: { alignSelf: 'flex-end' },
  reactionBadge: { fontSize: theme.fontSize.sm },
});
