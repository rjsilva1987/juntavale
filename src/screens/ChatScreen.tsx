// src/screens/ChatScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Timestamp } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { ReportModal } from '@/components/ReportModal';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOtherPresence } from '@/hooks/useOtherPresence';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { RootStackParamList } from '@/navigation';
import { blockUser, reportUser, ReportReason } from '@/services/blockService';
import {
  listenMessages,
  listenMatchBlockStatus,
  listenReactions,
  listenHiddenMessages,
  hideMessage,
  deleteMessageForEveryone,
  markMatchRead,
  sendMessage,
  setMessageReaction,
  uploadChatImage,
  Message,
  REACTION_EMOJIS,
  ReactionEmoji,
} from '@/services/firestoreService';
import { countCodePoints } from '@/utils/text';

const SKELETON_PATTERN = [false, true, false, false, true];
// S79 — 100 code points na citação (client); rules aceitam até 400 (4x,
// guarda de abuso — ver firestore.rules). Nunca slice por índice UTF-16
// (mesmo cuidado do S77 em icebreakers.ts): usa countCodePoints pra medir
// e Array.from().slice().join() pra cortar sem partir emoji ao meio.
const REPLY_QUOTE_LENGTH = 100;
const truncateReplyQuote = (value: string): string =>
  countCodePoints(value) > REPLY_QUOTE_LENGTH
    ? Array.from(value).slice(0, REPLY_QUOTE_LENGTH).join('')
    : value;

// S79-B — mesmos rótulos fixos do preview de push (functions/src/index.ts),
// byte a byte, pra citação de foto/localização não inventar texto novo.
// Prioridade igual à de lá: texto > foto > localização.
const REPLY_QUOTE_PHOTO_LABEL = '📷 Foto';
const REPLY_QUOTE_LOCATION_LABEL = '📍 Localização';
const buildReplyQuote = (message: Message): string => {
  if (message.text) return truncateReplyQuote(message.text);
  if (message.imageUrl) return REPLY_QUOTE_PHOTO_LABEL;
  if (message.location) return REPLY_QUOTE_LOCATION_LABEL;
  return '';
};

// S79-E2 — arrasto pra responder: gatilho aos ~48px (soltar depois disso
// dispara a resposta), limite físico da bolha aos ~64px (resistência
// crescente entre os dois, ver onUpdate do Gesture.Pan em MessageBubble).
const REPLY_DRAG_TRIGGER = 48;
const REPLY_DRAG_MAX = 64;

// S85-B — janela de "apagar pros dois", em ms. Precisa ficar em sincronia
// manual com duration.value(1, 'h') em firestore.rules (match /messages/
// {messageId}, allow update) — mesmo padrão de sincronia manual de
// REACTION_EMOJIS. É só a guarda de UX (esconder a opção fora do prazo);
// quem decide de verdade é a rule.
const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000;

type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

// S79-E1 — extraído de renderMessage (era uma função chamada dentro do
// render de ChatScreen) pra componente próprio: função-por-item dentro de
// render não pode ter hooks por linha (useSharedValue/useAnimatedStyle do
// reanimated quebram a ordem dos hooks conforme a lista cresce/encolhe).
// Fica aqui em vez de em src/components/ pra reusar `styles` (StyleSheet
// único do arquivo, com chaves de header/sheets/input que não fazem sentido
// duplicar ou repartir) e os imports que ChatScreen.tsx já tem (Image,
// Ionicons, dayjs, Pressable, BLURHASH_PLACEHOLDER, theme, Message) sem
// puxar nenhum import novo.
interface MessageBubbleProps {
  item: Message;
  currentUid?: string;
  otherName: string;
  otherPhoto?: string;
  // S80-B — uid -> emoji pra ESTA mensagem. Passado direto do objeto do
  // estado (reactions[item.id]) pelo chamador, sem `?? {}` no ponto de
  // passagem (mudaria de identidade a cada render) — o fallback é tratado
  // aqui dentro.
  reactions?: Record<string, ReactionEmoji>;
  // S86 — lastReadAt do OUTRO participante (só o valor dele, não o map
  // inteiro), pra decidir o tique de leitura da mensagem PRÓPRIA. Mesmo
  // padrão de `reactions` acima: passado direto pelo chamador, sem `?? {}`
  // no ponto de passagem.
  otherReadAt?: Timestamp;
  onViewImage: (imageUrl: string) => void;
  onOpenLocation: (location: { latitude: number; longitude: number }) => void;
  onLongPressReply: (message: Message) => void;
  onDragReply: (message: Message) => void;
}

function MessageBubble({
  item,
  currentUid,
  otherName,
  otherPhoto,
  reactions,
  otherReadAt,
  onViewImage,
  onOpenLocation,
  onLongPressReply,
  onDragReply,
}: MessageBubbleProps) {
  const isMe = item.senderId === currentUid;
  const imageUrl = item.imageUrl;
  const location = item.location;
  // S86 — só a mensagem PRÓPRIA mostra tique; createdAt nulo (mensagem
  // recém-enviada, servidor ainda não confirmou) NUNCA conta como lida —
  // fica no tique de enviado até o próprio createdAt resolver.
  const isRead =
    isMe &&
    !!otherReadAt &&
    !!item.createdAt &&
    otherReadAt.toMillis() >= item.createdAt.toMillis();
  // S80-B — no máximo 2 participantes, logo no máximo 2 entradas. Ordenado
  // por uid: a ordem de chaves do objeto vem do snapshot do Firestore e não
  // é garantida entre re-renders, então sem isso os emoji trocariam de
  // lugar sozinhos.
  const reactionEntries = reactions
    ? Object.entries(reactions).sort(([a], [b]) => a.localeCompare(b))
    : [];

  // S79-E2 — arrasto pra responder. translateX: posição atual da bolha (só
  // pra direita, 0..REPLY_DRAG_MAX). hasTriggeredHaptic: shared value, não
  // useRef — o worklet do Gesture.Pan roda na thread de UI, e um useRef
  // comum não é seguro de mutar de lá (só JS thread garante a leitura).
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  const triggerReplyHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const dispatchDragReply = () => {
    onDragReply(item);
  };

  // S79-E2 — os callbacks de Gesture.Pan (.onUpdate/.onEnd/.onFinalize)
  // rodam como WORKLET na thread de UI, não na JS thread. Chamar
  // Haptics.impactAsync ou onDragReply (que no fim chama setReplyTarget, um
  // setState do React) direto de dentro deles não funciona — precisa
  // embrulhar em runOnJS pra saltar de volta pra JS thread. É por isso que
  // triggerReplyHaptic e dispatchDragReply existem como funções à parte em
  // vez de chamadas inline.
  const pan = Gesture.Pan()
    .enabled(!item.deletedAt)
    .activeOffsetX(10)
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      // Só pra direita: translationX negativo vira 0 (clamp). Até o
      // gatilho o movimento é 1:1 com o dedo; depois dele, resistência
      // crescente (assíntota em REPLY_DRAG_MAX) — quanto mais puxa, menos
      // a bolha anda por px de dedo.
      const raw = Math.max(0, e.translationX);
      const next =
        raw <= REPLY_DRAG_TRIGGER
          ? raw
          : REPLY_DRAG_TRIGGER +
            (REPLY_DRAG_MAX - REPLY_DRAG_TRIGGER) *
              (1 - Math.exp(-(raw - REPLY_DRAG_TRIGGER) / (REPLY_DRAG_MAX - REPLY_DRAG_TRIGGER)));
      translateX.value = Math.min(next, REPLY_DRAG_MAX);

      // Haptic uma vez só ao CRUZAR o gatilho (não ao soltar). O flag
      // rearma se o dedo voltar pra baixo do limiar, pra poder disparar de
      // novo se cruzar outra vez no mesmo gesto.
      if (translateX.value >= REPLY_DRAG_TRIGGER && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerReplyHaptic)();
      } else if (translateX.value < REPLY_DRAG_TRIGGER && hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd(() => {
      if (translateX.value >= REPLY_DRAG_TRIGGER) {
        runOnJS(dispatchDragReply)();
      }
    })
    .onFinalize(() => {
      // SEMPRE volta em mola, disparou ou não — e onFinalize (ao contrário
      // de onEnd) roda mesmo se o gesto for cancelado (ex.: outro gesto
      // ganha prioridade no meio do arrasto), então a bolha nunca fica
      // presa fora do lugar.
      translateX.value = withSpring(0);
      hasTriggeredHaptic.value = false;
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / REPLY_DRAG_TRIGGER, 1),
  }));

  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
      {!isMe && (
        <View style={styles.msgAvatar}>
          {otherPhoto ? (
            <Image
              source={{ uri: otherPhoto }}
              style={styles.msgAvatarImg}
              contentFit="cover"
              placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
              transition={200}
            />
          ) : (
            <View style={styles.msgAvatarPlaceholder}>
              <Text>😊</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.bubbleDragWrap}>
        {/* S79-E2 — ícone de responder, atrás da bolha, revelado conforme
            ela desliza pra direita. Reusa theme.colors.primary (mesmo token
            de replyBarName/replyBarAccent, vocabulário visual já
            estabelecido pra "responder" neste arquivo). */}
        <Animated.View style={[styles.replyDragIcon, replyIconStyle]}>
          <Ionicons name="arrow-undo" size={20} color={theme.colors.primary} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            collapsable={false}
            style={[
              imageUrl ? styles.bubbleImageWrap : styles.bubble,
              isMe ? styles.bubbleMe : styles.bubbleOther,
              dragStyle,
            ]}
          >
            {/* S79 — citação (v1, só existe em mensagem de texto). Mesmo
                vocabulário visual do bilhete em LikeCard/ProfileSections:
                borda à esquerda em primaryLight + itálico. Tocar aqui NÃO
                pula pra mensagem original (decisão de produto). */}
            {item.replyTo && (
              <View style={styles.replyQuoteBox}>
                <Text
                  style={[styles.replyQuoteName, isMe && styles.replyQuoteTextMe]}
                  numberOfLines={1}
                >
                  {item.replyTo.senderId === currentUid ? 'Você' : otherName}
                </Text>
                <Text
                  style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]}
                  numberOfLines={2}
                >
                  {item.replyTo.text}
                </Text>
              </View>
            )}
            {/* S85-B — lápide: mensagem apagada pros dois. Guarda antes do
                ternário de imagem/localização/texto — uma mensagem apagada
                não tem reação nem toque longo (o Text da lápide não recebe
                onLongPress de propósito); hora continua aparecendo (ver
                bubbleTimeRow fora deste ternário), só o tique de leitura
                some (condicionado a !item.deletedAt logo abaixo). */}
            {item.deletedAt ? (
              <Text style={[styles.bubbleTextDeleted, isMe && styles.bubbleTextDeletedMe]}>
                Esta mensagem foi apagada
              </Text>
            ) : (
              <>
                {imageUrl ? (
                  <Pressable
                    onPress={() => onViewImage(imageUrl)}
                    onLongPress={() => onLongPressReply(item)}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.bubbleImage}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                      transition={200}
                    />
                  </Pressable>
                ) : location ? (
                  <Pressable
                    style={styles.locationCard}
                    onPress={() => onOpenLocation(location)}
                    onLongPress={() => onLongPressReply(item)}
                  >
                    <Ionicons
                      name="location"
                      size={20}
                      color={isMe ? theme.colors.white : theme.colors.primary}
                    />
                    <Text style={[styles.locationText, isMe && styles.bubbleTextMe]}>
                      Localização compartilhada
                    </Text>
                  </Pressable>
                ) : (
                  // S79-B — toque longo agora também nas bolhas de FOTO e
                  // LOCALIZAÇÃO acima (mesmo handler, mesmo Pressable que já
                  // tinha onPress próprio). Text do RN já suporta onLongPress
                  // direto, sem precisar de Pressable extra por cima.
                  <Text
                    style={[styles.bubbleText, isMe && styles.bubbleTextMe]}
                    onLongPress={() => onLongPressReply(item)}
                  >
                    {item.text}
                  </Text>
                )}
              </>
            )}
            {/* S85-B — fora do ternário de propósito: a hora aparece nos
                dois casos (apagada ou não), só o tique de leitura some na
                lápide (isMe && !item.deletedAt). imageUrl é sempre
                undefined numa mensagem apagada, então bubbleTimeRowImage
                nunca pega a lápide. */}
            <View style={[styles.bubbleTimeRow, imageUrl && styles.bubbleTimeRowImage]}>
              <Text
                style={[
                  styles.bubbleTime,
                  isMe && styles.bubbleTimeMe,
                  imageUrl && styles.bubbleTimeImage,
                ]}
              >
                {item.createdAt ? dayjs(item.createdAt.toDate()).format('HH:mm') : ''}
              </Text>
              {isMe && !item.deletedAt && (
                <Ionicons
                  name={isRead ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={
                    isRead
                      ? theme.colors.success
                      : imageUrl
                        ? theme.colors.white
                        : 'rgba(255,255,255,0.6)'
                  }
                />
              )}
            </View>
            {/* S85-B — !item.deletedAt obrigatório: o doc de reações de uma
                mensagem apagada fica órfão no Firestore, sem essa guarda
                uma reação antiga voltaria a aparecer sobre a lápide. */}
            {!item.deletedAt && reactionEntries.length > 0 && (
              <View style={[styles.reactionBadgeRow, isMe && styles.reactionBadgeRowMe]}>
                {reactionEntries.map(([uid, emoji]) => (
                  <Text key={uid} style={styles.reactionBadge}>
                    {emoji}
                  </Text>
                ))}
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, otherUid, otherName, otherPhoto, draftMessage } = route.params;
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  // S80-B — messageId -> (uid -> emoji), espelho do doc mais recente de
  // matches/{matchId}/reactions/{messageId} (ver listenReactions).
  const [reactions, setReactions] = useState<Record<string, Record<string, ReactionEmoji>>>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  // S79 — replyOptionsTarget: mensagem que recebeu o toque longo (abre o
  // sheet "Responder"/"Cancelar"). replyTarget: mensagem escolhida de fato
  // pra responder (mostra a barra de citação acima do input). Os dois nunca
  // persistem — sair da tela sem enviar simplesmente descarta o estado.
  const [replyOptionsTarget, setReplyOptionsTarget] = useState<Message | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const isBlocked = blockedBy.length > 0;
  // S86 — espelho do lastReadAt do doc matches/{matchId}, vindo do mesmo
  // onSnapshot de listenMatchBlockStatus (ver comentário na função). Só o
  // valor do OUTRO uid é repassado pro MessageBubble.
  const [otherLastReadAt, setOtherLastReadAt] = useState<Record<string, Timestamp>>({});
  // S85-A — "apagar pra mim": ids escondidos SÓ pro uid do dono da tela,
  // espelho do doc matches/{matchId}/hidden/{meuUid} (ver listenHiddenMessages).
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  // Defesa em profundidade: MatchesScreen já barra a navegação pra cá se
  // !profile?.verified, mas ChatScreen pode ser aberta por outros caminhos
  // (deep link, MatchProfile, etc.) — a garantia real continua sendo a rule
  // de create em matches/{matchId}/messages (verified==true no doc do
  // remetente). Mensagens já existentes continuam visíveis de propósito: o
  // histórico é lido normalmente, só o envio fica bloqueado.
  const isUnverified = !profile?.verified;
  const flatListRef = React.useRef<FlatList>(null);
  const { isOtherTyping, handleTyping } = useTypingIndicator(matchId, user?.uid ?? '');
  const { presenceLabel } = useOtherPresence(otherUid);

  // Fundação do badge de não lidas (S27, ver useUnreadCount): marca
  // lastReadAt.{meuUid} ao focar a tela e de novo sempre que uma mensagem
  // nova chega enquanto ela está focada, pra abrir o chat com o outro lado
  // digitando não deixar o badge acender. isFocusedRef em vez de useIsFocused
  // pra não re-renderizar a tela inteira a cada troca de foco.
  const isFocusedRef = useRef(false);
  // Ação escolhida no attach sheet, disparada com segurança só depois que o
  // Modal termina de fechar de verdade (ver runAfterAttachSheetClose).
  const pendingAttachActionRef = useRef<(() => void) | null>(null);
  // draftMessage (sugestão de icebreaker do MatchModal) só é aplicado uma vez,
  // na montagem inicial da tela — se o usuário apagar o texto ou os params
  // mudarem depois (ex: deep link), não deve ser reaplicado.
  // aguarda o profile do useAuth resolver antes de consumir (evita perder o draft por latência)
  const draftAppliedRef = useRef(false);

  const uid = user?.uid;

  useEffect(() => {
    if (draftAppliedRef.current) return;
    if (!draftMessage) {
      draftAppliedRef.current = true;
      return;
    }
    if (profile === null || profile === undefined) return; // aguarda profile resolver; NÃO marcar o ref
    draftAppliedRef.current = true; // profile resolvido: consome o draft (aplicando ou não)
    if (!isUnverified) setText(draftMessage);
  }, [draftMessage, isUnverified, profile]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (uid) markMatchRead(matchId, uid).catch(() => {});
      return () => {
        isFocusedRef.current = false;
      };
    }, [matchId, uid]),
  );

  useEffect(() => {
    const unsub = listenMessages(matchId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      if (isFocusedRef.current && uid) {
        markMatchRead(matchId, uid).catch(() => {});
      }
    });
    return unsub;
  }, [matchId, uid]);

  useEffect(() => {
    const unsub = listenReactions(matchId, setReactions);
    return unsub;
  }, [matchId]);

  useEffect(() => {
    if (!uid) return;
    const unsub = listenHiddenMessages(matchId, uid, setHiddenIds);
    return unsub;
  }, [matchId, uid]);

  // S85-A — ponto único do filtro: a FlatList consome visibleMessages, não
  // messages direto (ver data={visibleMessages} abaixo). hiddenIds é só do
  // dono da tela, então isso nunca afeta o que o outro participante vê.
  const visibleMessages = useMemo(
    () => (hiddenIds.length === 0 ? messages : messages.filter((m) => !hiddenIds.includes(m.id))),
    [messages, hiddenIds],
  );

  useEffect(() => {
    const unsub = listenMatchBlockStatus(matchId, (blocked, lastReadAt) => {
      setBlockedBy(blocked);
      setOtherLastReadAt(lastReadAt);
    });
    return unsub;
  }, [matchId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || isBlocked || isUnverified) return;
    // S79 — cópia truncada, não referência viva: se a mensagem original for
    // apagada um dia (não dá pra hoje, mas rules podem mudar), a citação
    // continua mostrando o que foi escrito.
    const replyTo = replyTarget
      ? {
          messageId: replyTarget.id,
          text: buildReplyQuote(replyTarget),
          senderId: replyTarget.senderId,
        }
      : undefined;
    setText('');
    setReplyTarget(null);
    try {
      await sendMessage(matchId, user.uid, trimmed, undefined, undefined, replyTo);
    } catch (_) {}
  };

  const handleChangeText = (value: string) => {
    setText(value);
    handleTyping();
  };

  const handleSendImage = async (uri: string) => {
    if (!user || isBlocked || isUnverified) return;
    setUploadProgress(0);
    try {
      const imageUrl = await uploadChatImage(matchId, uri, setUploadProgress);
      await sendMessage(matchId, user.uid, '', imageUrl);
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      Alert.alert('Erro', 'Não foi possível enviar a imagem.');
    } finally {
      setUploadProgress(null);
    }
  };

  const runAttachAction = (action: () => void | Promise<void>) => {
    Promise.resolve(action()).catch((error) => {
      console.error('Erro na ação do menu de anexos:', error);
      Alert.alert('Erro', 'Não foi possível completar a ação. Tente novamente.');
    });
  };

  // No iOS, launchCameraAsync/launchImageLibraryAsync nunca resolvem (promise
  // pendura pra sempre) se chamados enquanto o Modal do attach sheet ainda
  // está sendo apresentado/descartado — dois view controllers modais em voo
  // ao mesmo tempo. onDismiss do Modal (iOS-only) dispara só quando o dismiss
  // já terminou de verdade, então guardamos a ação num ref e disparamos ali.
  // Android não tem esse problema e não chama onDismiss, então mantém o
  // setTimeout curto que já funcionava.
  const runAfterAttachSheetClose = (action: () => void | Promise<void>) => {
    if (Platform.OS === 'android') {
      setAttachSheetVisible(false);
      setTimeout(() => runAttachAction(action), 100);
      return;
    }
    pendingAttachActionRef.current = () => runAttachAction(action);
    setAttachSheetVisible(false);
  };

  const handleTakePhoto = () => {
    runAfterAttachSheetClose(async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      handleSendImage(result.assets[0].uri);
    });
  };

  const handlePickFromLibrary = () => {
    runAfterAttachSheetClose(async () => {
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
    });
  };

  const handleShareLocation = () => {
    runAfterAttachSheetClose(async () => {
      if (!user || isBlocked || isUnverified) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Permita o acesso à localização para compartilhá-la no chat.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await sendMessage(matchId, user.uid, '', undefined, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        console.error('Erro ao obter localização:', error);
        Alert.alert('Erro', 'Não foi possível obter sua localização.');
      }
    });
  };

  const handleViewProfile = () => {
    setOptionsSheetVisible(false);
    navigation.navigate('MatchProfile', {
      uid: otherUid,
      matchId,
      name: otherName,
      photoURL: otherPhoto,
    });
  };

  const handleBlock = () => {
    setOptionsSheetVisible(false);
    if (!user) return;
    Alert.alert(
      'Bloquear usuário?',
      `Você deixará de ver ${otherName} e o match será desfeito. Essa ação pode ser desfeita depois em "Usuários bloqueados".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            await blockUser(user.uid, otherUid);
            navigation.navigate('Main', { screen: 'Conversas' });
          },
        },
      ],
    );
  };

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user) return;
    await reportUser(user.uid, otherUid, reason, details);
    setReportVisible(false);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
  };

  const handleOpenLocation = (location: { latitude: number; longitude: number }) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${location.latitude},${location.longitude}`,
      android: `geo:0,0?q=${location.latitude},${location.longitude}`,
      default: `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`,
    });
    Linking.openURL(url as string).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`,
      );
    });
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <MessageBubble
      item={item}
      currentUid={user?.uid}
      otherName={otherName}
      otherPhoto={otherPhoto}
      reactions={reactions[item.id]}
      otherReadAt={otherLastReadAt[otherUid]}
      onViewImage={setViewerImage}
      onOpenLocation={handleOpenLocation}
      onLongPressReply={setReplyOptionsTarget}
      onDragReply={setReplyTarget}
    />
  );

  // S85-B — guarda de UX obrigatória junto da rule (mesmo bug do S49: sem
  // ela a pessoa toca e leva um permission-denied engolido). Só a própria
  // mensagem, ainda não apagada, dentro da janela — createdAt nulo
  // (mensagem recém-enviada, servidor ainda não confirmou) conta como
  // dentro da janela, mesmo critério "nunca lida" do S86 pro tique.
  const canDeleteForEveryone =
    !!replyOptionsTarget &&
    !!uid &&
    replyOptionsTarget.senderId === uid &&
    !replyOptionsTarget.deletedAt &&
    (!replyOptionsTarget.createdAt ||
      Date.now() - replyOptionsTarget.createdAt.toMillis() < DELETE_FOR_EVERYONE_WINDOW_MS);

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.canGoBack() && navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <AnimatedPressable style={styles.headerInfo} onPress={handleViewProfile}>
            {otherPhoto ? (
              <Image
                source={{ uri: otherPhoto }}
                style={styles.headerAvatar}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                transition={200}
              />
            ) : (
              <View
                style={[
                  styles.headerAvatar,
                  {
                    backgroundColor: theme.colors.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <Text style={{ fontSize: 18 }}>😊</Text>
              </View>
            )}
            <View>
              <Text style={styles.headerName}>{otherName}</Text>
              {(isOtherTyping || presenceLabel) && (
                <Text style={styles.headerStatus}>
                  {isOtherTyping ? 'digitando...' : presenceLabel}
                </Text>
              )}
            </View>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => setOptionsSheetVisible(true)}>
            <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text} />
          </AnimatedPressable>
        </View>

        {/* Messages */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <View style={styles.messagesList}>
              {SKELETON_PATTERN.map((isMe, i) => (
                <View key={i} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
                  {!isMe && <SkeletonPlaceholder width={30} height={30} borderRadius={15} />}
                  <SkeletonPlaceholder
                    width={isMe ? 160 : 200}
                    height={40}
                    borderRadius={theme.borderRadius.lg}
                  />
                </View>
              ))}
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={visibleMessages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              renderItem={renderMessage}
              ListEmptyComponent={
                <EmptyState
                  icon="chatbubble-ellipses-outline"
                  title="Comece uma conversa!"
                  subtitle={`Vocês fizeram match! Diga olá para ${otherName}`}
                />
              }
            />
          )}

          {/* Upload progress */}
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

          {/* Input */}
          {isBlocked ? (
            <View style={styles.blockedBanner}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.blockedBannerText}>Conversa indisponível</Text>
            </View>
          ) : isUnverified ? (
            <Pressable
              style={styles.blockedBanner}
              onPress={() => navigation.navigate('Verification')}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.blockedBannerText}>Verifique seu perfil para responder</Text>
            </Pressable>
          ) : (
            <>
              {/* S79 — barra de citação, irmã do inputRow (mesmo pai),
                  logo acima dele. Cancelar (X) só limpa o estado — nada é
                  persistido, sair da tela sem enviar descarta sozinho. */}
              {replyTarget && (
                <View style={styles.replyBar}>
                  <View style={styles.replyBarAccent} />
                  <View style={styles.replyBarTextWrap}>
                    <Text style={styles.replyBarName}>
                      {replyTarget.senderId === user?.uid ? 'Você' : otherName}
                    </Text>
                    <Text style={styles.replyBarText} numberOfLines={1}>
                      {/* S79-B — não pode ler replyTarget.text direto: foto e
                          localização não têm campo text (fica ''), então a
                          barra abriria vazia pra elas. buildReplyQuote
                          resolve o rótulo fixo, mesmo valor usado no envio. */}
                      {buildReplyQuote(replyTarget)}
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
              <View style={styles.inputRow}>
                <AnimatedPressable
                  style={styles.inputIcon}
                  onPress={() => setAttachSheetVisible(true)}
                >
                  <Ionicons name="camera-outline" size={24} color={theme.colors.textSecondary} />
                </AnimatedPressable>
                <TextInput
                  style={styles.input}
                  placeholder={`Mensagem para ${otherName}…`}
                  placeholderTextColor={theme.colors.textLight}
                  value={text}
                  onChangeText={handleChangeText}
                  multiline
                  maxLength={500}
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

      {/* Attachment action sheet */}
      <Modal
        visible={attachSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachSheetVisible(false)}
        onDismiss={() => {
          const pendingAction = pendingAttachActionRef.current;
          pendingAttachActionRef.current = null;
          pendingAction?.();
        }}
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
            <View style={styles.sheetDivider} />
            <AnimatedPressable style={styles.sheetOption} onPress={handleShareLocation}>
              <Ionicons name="location" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Enviar localização</Text>
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

      {/* S79 — sheet do toque longo na bolha de texto: mesmo padrão de
          Modal transparente + backdrop do attachment sheet acima, só que
          com uma opção só. */}
      <Modal
        visible={!!replyOptionsTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setReplyOptionsTarget(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setReplyOptionsTarget(null)}>
          <View style={styles.sheet}>
            {/* S80-A escreve, S80-B alterna: tocar de novo no MESMO emoji que
                o próprio usuário já reagiu remove a reação (deleteField). */}
            <View style={styles.reactionRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <AnimatedPressable
                  key={emoji}
                  style={styles.reactionButton}
                  onPress={() => {
                    if (replyOptionsTarget && user?.uid) {
                      const current = reactions[replyOptionsTarget.id]?.[user.uid];
                      const next = current === emoji ? null : emoji;
                      // Fire-and-forget, mas não em silêncio (mesmo padrão de
                      // usePresenceHeartbeat.ts): sem isso o erro desaparece
                      // sem deixar rastro, já que não há await aqui.
                      setMessageReaction(matchId, replyOptionsTarget.id, user.uid, next).catch(
                        (err) => console.warn('[ChatScreen] falha ao gravar reação', err),
                      );
                    }
                    setReplyOptionsTarget(null);
                  }}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </AnimatedPressable>
              ))}
            </View>
            <View style={styles.sheetDivider} />
            <AnimatedPressable
              style={styles.sheetOption}
              onPress={() => {
                setReplyTarget(replyOptionsTarget);
                setReplyOptionsTarget(null);
              }}
            >
              <Ionicons name="arrow-undo" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Responder</Text>
            </AnimatedPressable>
            {/* S85-A — "apagar pra mim": só esconde na própria tela, o doc da
                mensagem continua intacto e o outro lado não é afetado. Sem
                desfazer, por isso o Alert de confirmação antes de agir. */}
            <AnimatedPressable
              style={styles.sheetOption}
              onPress={() => {
                const target = replyOptionsTarget;
                setReplyOptionsTarget(null);
                if (!target || !uid) return;
                Alert.alert(
                  'Apagar pra mim',
                  'Essa mensagem some só da sua tela e não pode ser desfeito. Continuar?',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Apagar',
                      style: 'destructive',
                      onPress: () => {
                        hideMessage(matchId, uid, target.id).catch((err) =>
                          console.warn('[ChatScreen] falha ao esconder mensagem', err),
                        );
                      },
                    },
                  ],
                );
              }}
            >
              <Ionicons name="trash-outline" size={22} color={theme.colors.nope} />
              <Text style={[styles.sheetOptionText, { color: theme.colors.nope }]}>
                Apagar pra mim
              </Text>
            </AnimatedPressable>
            {/* S85-B — "apagar pros dois": vira lápide pra ambos. Só
                aparece dentro da janela de 1h e pra mensagem própria ainda
                não apagada — mesma guarda que a rule exige, client-side
                primeiro pra não deixar a pessoa levar permission-denied
                engolido (bug do S49). */}
            {canDeleteForEveryone && (
              <AnimatedPressable
                style={styles.sheetOption}
                onPress={() => {
                  const target = replyOptionsTarget;
                  setReplyOptionsTarget(null);
                  if (!target) return;
                  Alert.alert(
                    'Apagar pros dois',
                    'Essa mensagem vira "apagada" pros dois lados e não pode ser desfeito. Continuar?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Apagar',
                        style: 'destructive',
                        onPress: () => {
                          deleteMessageForEveryone(matchId, target.id).catch((err) =>
                            console.warn('[ChatScreen] falha ao apagar mensagem', err),
                          );
                        },
                      },
                    ],
                  );
                }}
              >
                <Ionicons name="trash-bin-outline" size={22} color={theme.colors.nope} />
                <Text style={[styles.sheetOptionText, { color: theme.colors.nope }]}>
                  Apagar pros dois
                </Text>
              </AnimatedPressable>
            )}
            <View style={styles.sheetGap} />
            <AnimatedPressable
              style={styles.sheetCancel}
              onPress={() => setReplyOptionsTarget(null)}
            >
              <Text style={styles.sheetCancelText}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Modal>

      {/* Full-screen image viewer */}
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

      {/* Options action sheet (perfil / denunciar / bloquear) */}
      <Modal
        visible={optionsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOptionsSheetVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setOptionsSheetVisible(false)}>
          <View style={styles.sheet}>
            <AnimatedPressable style={styles.sheetOption} onPress={handleViewProfile}>
              <Ionicons name="person-outline" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Ver perfil</Text>
            </AnimatedPressable>
            <View style={styles.sheetDivider} />
            <AnimatedPressable
              style={styles.sheetOption}
              onPress={() => {
                setOptionsSheetVisible(false);
                setReportVisible(true);
              }}
            >
              <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
              <Text style={styles.sheetOptionText}>Denunciar</Text>
            </AnimatedPressable>
            <View style={styles.sheetDivider} />
            <AnimatedPressable style={styles.sheetOption} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={22} color={theme.colors.nope} />
              <Text style={[styles.sheetOptionText, { color: theme.colors.nope }]}>Bloquear</Text>
            </AnimatedPressable>
            <View style={styles.sheetGap} />
            <AnimatedPressable
              style={styles.sheetCancel}
              onPress={() => setOptionsSheetVisible(false)}
            >
              <Text style={styles.sheetCancelText}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Modal>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleReport}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

  header: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  headerName: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  headerStatus: { fontSize: theme.fontSize.xs, color: theme.colors.like },

  messagesList: { padding: theme.spacing.md, gap: 10, flexGrow: 1 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  msgAvatar: {},
  msgAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  msgAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // S79-E2 — envolve só a bolha (não a row inteira, avatar fica parado) pra
  // dar contexto de posicionamento absoluto ao ícone de responder, revelado
  // atrás dela conforme o arrasto avança.
  bubbleDragWrap: { position: 'relative', maxWidth: '75%' },
  replyDragIcon: {
    position: 'absolute',
    left: -32,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  bubble: {
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleMe: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: theme.colors.white,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 20 },
  bubbleTextMe: { color: theme.colors.white },
  // S85-B — lápide de mensagem apagada "pros dois": mesmo vocabulário
  // itálico + cor apagada do replyQuoteText/replyQuoteTextMe acima.
  bubbleTextDeleted: {
    fontSize: theme.fontSize.md,
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  bubbleTextDeletedMe: { color: 'rgba(255,255,255,0.85)' },
  // S79 — citação dentro da bolha: mesmo vocabulário do bilhete em
  // LikeCard/ProfileSections (borda à esquerda em primaryLight + itálico).
  // Cor do texto segue a mesma regra condicional de bubbleText/bubbleTextMe
  // acima, porque aqui (ao contrário do LikeCard/ProfileSections, que só
  // aparecem num fundo fixo) a bolha pode ser clara OU escura.
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
  bubbleTime: { fontSize: theme.fontSize.xs, color: theme.colors.textLight },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },
  bubbleTimeImage: { color: theme.colors.white },
  // S86 — hora + tique de leitura lado a lado. alignSelf (que antes vivia em
  // bubbleTime) muda pra cá: agora é a ROW que se alinha à direita da
  // bolha, não mais o Text sozinho.
  bubbleTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end' },
  bubbleTimeRowImage: { position: 'absolute', bottom: 6, right: 10 },

  // S80-B — mesmo lado da bolha: flex-start (recebida) por padrão, flex-end
  // (própria) sobrepõe, mesma convenção de msgRowMe/msgRowOther acima.
  reactionBadgeRow: { flexDirection: 'row', gap: 2, alignSelf: 'flex-start' },
  reactionBadgeRowMe: { alignSelf: 'flex-end' },
  reactionBadge: { fontSize: theme.fontSize.sm },

  bubbleImageWrap: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  bubbleImage: { width: 200, height: 200, borderRadius: theme.borderRadius.lg },

  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: { fontSize: theme.fontSize.md, color: theme.colors.text },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    backgroundColor: theme.colors.white,
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

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: 32,
  },
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
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
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

  // S79 — barra de citação acima do input, mesmo fundo/borda do inputRow
  // logo abaixo (branco + borda superior), pra ler como um bloco só com
  // ele. Acento reusa o mesmo vocabulário do replyQuoteBox (borda à
  // esquerda em primaryLight).
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
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
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    paddingHorizontal: 12,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  inputIcon: { padding: 6, paddingBottom: 8 },

  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  blockedBannerText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },

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
});
