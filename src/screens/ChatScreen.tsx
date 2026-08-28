// src/screens/ChatScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as Clipboard from 'expo-clipboard';
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  editMessage,
  getInitialMessageWindow,
  getMatchLastReadAt,
  loadOlderMessages,
  markMatchRead,
  sendMessage,
  setMessageReaction,
  unmatch,
  uploadChatImage,
  Message,
  MessageCursor,
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

// S92 — janela de edição, em ms. Coincide com a janela do apagar hoje, mas
// são ramos SEPARADOS da rule — mudar um não pode mudar o outro em silêncio.
const EDIT_WINDOW_MS = 60 * 60 * 1000;

// S101 — distância máxima (px) entre o fim do conteúdo e a borda inferior
// visível pra lista ainda contar como "no fim". Mensagem nova só puxa o
// scroll dentro dessa faixa; acima dela o usuário está lendo histórico e a
// tela não pode ser arrastada embaixo dele. ~1 bolha curta de altura.
const NEAR_BOTTOM_THRESHOLD = 80;

// S129-A — teto de páginas que scrollToMessage busca pra trás procurando a
// mensagem original de uma citação, reusando loadOlderMessages (MESSAGE_PAGE_SIZE
// por página) do S101. 10 páginas = até 300 mensagens antigas por toque: teto
// alto o bastante pra cobrir o caso comum (citação de conversa antiga), mas
// finito pra não martelar o Firestore indefinidamente se a mensagem já não
// existir mais na coleção por algum motivo fora do previsto no S85-B/S92.
const MAX_JUMP_TO_REPLY_PAGES = 10;

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
  // S129-B — deliveredAt do OUTRO participante, mesmo padrão de otherReadAt
  // acima, pra decidir o tique de entrega (terceiro estado, entre enviado e
  // lido) da mensagem PRÓPRIA.
  otherDeliveredAt?: Timestamp;
  onViewImage: (imageUrl: string) => void;
  onOpenLocation: (location: { latitude: number; longitude: number }) => void;
  onLongPressReply: (message: Message) => void;
  onDragReply: (message: Message) => void;
  // S129-A — reversão do S79: tocar na citação leva até a mensagem original.
  onJumpToReply: (messageId: string) => void;
}

// S157 — React.memo pra FlatList não re-renderizar todas as bolhas visíveis
// a cada digitação: renderMessage (ver useCallback abaixo) já mantém as
// props estáveis entre renders, então o memo aqui passa a valer de fato.
const MessageBubble = React.memo(function MessageBubble({
  item,
  currentUid,
  otherName,
  otherPhoto,
  reactions,
  otherReadAt,
  otherDeliveredAt,
  onViewImage,
  onOpenLocation,
  onLongPressReply,
  onDragReply,
  onJumpToReply,
}: MessageBubbleProps) {
  const isMe = item.senderId === currentUid;
  const imageUrl = item.imageUrl;
  const location = item.location;
  // S129-A — variável local (não item.replyTo direto) só pra deixar o
  // TypeScript estreitar o tipo dentro do closure do onPress do Pressable
  // logo abaixo, sem precisar de non-null assertion (item.replyTo!).
  const replyTo = item.replyTo;
  // S130 — colapso de texto longo, por mensagem (useState local desta
  // instância, não um flag global da tela): expandir uma bolha não afeta as
  // outras, e uma bolha já expandida não recolapsa sozinha quando chega
  // mensagem nova (nada aqui depende do array de mensagens).
  // S158 — a medição de isTextTruncated NÃO fica no Text visível: no
  // Fabric (RN 0.81/Expo 54), onTextLayout de um Text que já tem
  // numberOfLines aplicado reporta as linhas JÁ truncadas, então
  // lines.length nunca passa de 6 e "ler mais" nunca aparecia, mesmo em
  // mensagem longa. A medição real é feita por um segundo Text "espelho"
  // (mesmo texto, mesmo style, sem numberOfLines, invisível/opacity 0,
  // position absolute por cima do Text visível) — só ele carrega
  // onTextLayout.
  const [textExpanded, setTextExpanded] = useState(false);
  const [isTextTruncated, setIsTextTruncated] = useState(false);
  // S86 — só a mensagem PRÓPRIA mostra tique; createdAt nulo (mensagem
  // recém-enviada, servidor ainda não confirmou) NUNCA conta como lida —
  // fica no tique de enviado até o próprio createdAt resolver.
  const isRead =
    isMe &&
    !!otherReadAt &&
    !!item.createdAt &&
    otherReadAt.toMillis() >= item.createdAt.toMillis();
  // S129-B — mesmo raciocínio de isRead acima, mas pra deliveredAt: terceiro
  // estado do tique, entre "enviado" e "lido".
  const isDelivered =
    isMe &&
    !!otherDeliveredAt &&
    !!item.createdAt &&
    otherDeliveredAt.toMillis() >= item.createdAt.toMillis();
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
                borda à esquerda em primaryLight + itálico. S129-A reverteu a
                decisão do S79: tocar aqui agora pula pra mensagem original. */}
            {replyTo && (
              <Pressable onPress={() => onJumpToReply(replyTo.messageId)}>
                <View style={styles.replyQuoteBox}>
                  <Text
                    style={[styles.replyQuoteName, isMe && styles.replyQuoteTextMe]}
                    numberOfLines={1}
                  >
                    {replyTo.senderId === currentUid ? 'Você' : otherName}
                  </Text>
                  <Text
                    style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]}
                    numberOfLines={2}
                  >
                    {replyTo.text}
                  </Text>
                </View>
              </Pressable>
            )}
            {/* S143-B — momentoRef: comentário a um momento de quem já é
                match (caso A, decisão 5), mesmo vocabulário visual da
                citação acima (replyQuoteBox/replyQuoteName/replyQuoteText).
                Sem onPress/Pressable de propósito: o momento original pode
                já ter expirado (24h), não há "mensagem original" pra
                pular — momentoRef já É a cópia truncada (decisão 7). */}
            {item.momentoRef && (
              <View style={styles.replyQuoteBox}>
                <Text
                  style={[styles.replyQuoteName, isMe && styles.replyQuoteTextMe]}
                  numberOfLines={1}
                >
                  Respondendo ao momento
                </Text>
                <Text
                  style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]}
                  numberOfLines={2}
                >
                  {item.momentoRef.type === 'photo' ? '📷 Foto' : item.momentoRef.text}
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
                  <>
                    <View style={styles.bubbleTextWrap}>
                      <Text
                        style={[styles.bubbleText, isMe && styles.bubbleTextMe]}
                        onLongPress={() => onLongPressReply(item)}
                        numberOfLines={textExpanded ? undefined : 6}
                      >
                        {item.text}
                      </Text>
                      {/* S158 — Text espelho, sem numberOfLines: mede o texto
                          inteiro pra saber se passa de 6 linhas (ver
                          comentário de isTextTruncated acima). Invisível e
                          fora do fluxo de toque, de propósito. */}
                      <Text
                        style={[
                          styles.bubbleText,
                          isMe && styles.bubbleTextMe,
                          styles.bubbleTextMirror,
                        ]}
                        pointerEvents="none"
                        onTextLayout={(e) => {
                          if (!isTextTruncated && e.nativeEvent.lines.length > 6) {
                            setIsTextTruncated(true);
                          }
                        }}
                      >
                        {item.text}
                      </Text>
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
              {/* S92 — "editada" ao lado da hora quando a mensagem foi editada
                  e não foi apagada. Mesmo estilo discreto da hora. */}
              {!item.deletedAt && item.editedAt && (
                <Text
                  style={[
                    styles.bubbleTime,
                    isMe && styles.bubbleTimeMe,
                    imageUrl && styles.bubbleTimeImage,
                  ]}
                >
                  editada
                </Text>
              )}
              {/* S129-B — três estados, precedência lido > entregue >
                  enviado: lido usa checkmark-done + success (inalterado);
                  entregue usa checkmark-done na MESMA cor neutra de
                  enviado (não é um estado "positivo" como lido); enviado
                  usa checkmark simples, mesma cor neutra. */}
              {isMe && !item.deletedAt && (
                <Ionicons
                  name={isRead || isDelivered ? 'checkmark-done' : 'checkmark'}
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
});

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, otherUid, otherName, otherPhoto, draftMessage } = route.params;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  // S101 — messages é só a JANELA em tempo real (onSnapshot com
  // createdAt >= corte). O histórico anterior vive em olderMessages, buscado
  // página a página sob toque e SEM listener; os dois são concatenados em
  // orderedMessages pra render.
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  // Mensagem mais antiga já carregada (snapshot cru) — startAfter da próxima
  // página. null = ainda não sei / nada carregado.
  const [olderCursor, setOlderCursor] = useState<MessageCursor | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // S80-B — messageId -> (uid -> emoji), espelho do doc mais recente de
  // matches/{matchId}/reactions/{messageId} (ver listenReactions).
  const [reactions, setReactions] = useState<Record<string, Record<string, ReactionEmoji>>>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  // S102-C — reportMessageTarget: mensagem escolhida pra denunciar via
  // sheet de toque longo. Independente de reportVisible/handleReport, que
  // seguem exclusivos do fluxo de denunciar o perfil (menu do cabeçalho).
  const [reportMessageTarget, setReportMessageTarget] = useState<Message | null>(null);
  // S79 — replyOptionsTarget: mensagem que recebeu o toque longo (abre o
  // sheet "Responder"/"Cancelar"). replyTarget: mensagem escolhida de fato
  // pra responder (mostra a barra de citação acima do input). Os dois nunca
  // persistem — sair da tela sem enviar simplesmente descarta o estado.
  const [replyOptionsTarget, setReplyOptionsTarget] = useState<Message | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // S92 — editTarget: mensagem escolhida pra editar (mostra a barra de
  // edição acima do input, espelhando replyTarget). Não persiste.
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const isBlocked = blockedBy.length > 0;
  // S86 — espelho do lastReadAt do doc matches/{matchId}, vindo do mesmo
  // onSnapshot de listenMatchBlockStatus (ver comentário na função). Só o
  // valor do OUTRO uid é repassado pro MessageBubble.
  const [otherLastReadAt, setOtherLastReadAt] = useState<Record<string, Timestamp>>({});
  // S129-B — mesmo padrão de otherLastReadAt acima, pra deliveredAt (terceiro
  // parâmetro do mesmo onSnapshot de listenMatchBlockStatus).
  const [otherDeliveredAt, setOtherDeliveredAt] = useState<Record<string, Timestamp>>({});
  // S85-A — "apagar pra mim": ids escondidos SÓ pro uid do dono da tela,
  // espelho do doc matches/{matchId}/hidden/{meuUid} (ver listenHiddenMessages).
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  // S129-A — messageId aguardando scroll assim que aparecer em
  // visibleMessages (ver scrollToMessage e o useEffect que consome este
  // estado). null = nenhum salto pendente.
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  // S142 — indicador flutuante "nova mensagem abaixo": true quando uma
  // mensagem do OUTRO lado chega enquanto isNearBottomRef.current é false
  // (usuário rolado pra cima lendo histórico). Nesse caso o scroll NÃO é
  // arrastado (ver o callback do listener abaixo) e markMatchRead fica
  // pendente até o usuário voltar ao fim por qualquer via — toque no
  // indicador (handleReturnToBottom) ou rolagem manual (handleMessagesScroll).
  // Resetado por geração igual aos demais estados desta tela (ver efeito de
  // dados abaixo).
  const [hasNewMessageBelow, setHasNewMessageBelow] = useState(false);
  // S142 (correção) — espelha hasNewMessageBelow pra ser lido dentro do
  // useFocusEffect sem re-render, mesmo padrão de isNearBottomRef logo abaixo:
  // navegar pra MatchProfile/Verification e voltar reganha foco na mesma
  // geração sem passar por handleMessagesScroll/handleReturnToBottom, então o
  // useFocusEffect precisa checar o indicador pendente por ref, não por
  // closure do state.
  const hasNewMessageBelowRef = useRef(false);
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
  // S101 — true enquanto a lista está a até NEAR_BOTTOM_THRESHOLD px do fim
  // (ver handleMessagesScroll). Gate do scrollToEnd automático para mensagem
  // que CHEGA do outro lado; começa true pra primeira pintura descer até o
  // fim. NÃO é a garantia de "envio próprio sempre desce" — essa é aferida no
  // callback do listener (ver isOwnNewMessage), porque um onScroll durante o
  // upload de foto reescreveria esta ref antes de a mensagem existir. Ref, não
  // estado: muda a cada frame de scroll e não pode re-renderizar a lista.
  const isNearBottomRef = useRef(true);
  // S101 — ids da última janela entregue pelo listener. Serve pra detectar
  // mensagem PRÓPRIA recém-chegada e forçar o scroll no fim (ver o callback do
  // listenMessages). Ref, não estado: só é lido dentro do próprio callback e não
  // pode causar render.
  const windowIdsRef = useRef<Set<string>>(new Set());
  // S101 (RODADA 2) — contador de geração da abertura do chat: incrementado
  // uma vez por (re)montagem lógica da conversa (mesmo reabrir o MESMO
  // matchId conta), dentro do efeito de dados abaixo. Serve de base pra DUAS
  // guardas contra resultado desatualizado quando um deep link/notificação
  // troca de conversa reusando esta mesma instância de ChatScreen (ver
  // useNotifications.ts e useChatDeepLink.ts): a Promise da âncora
  // (anchorPromiseRef, ver comentário abaixo) e handleLoadOlderMessages.
  // Substitui o antigo activeMatchIdRef (comparar só matchId não bastava: no
  // cenário A→B→A a comparação de matchId não distingue a 1ª da 2ª vez que a
  // tela abriu em A).
  const chatGenerationRef = useRef(0);
  // S101 (RODADA 2) — Promise da leitura da âncora lastReadAt desta conversa,
  // JUNTO da geração em que foi criada. O useFocusEffect só pode encadear
  // markMatchRead nela se a geração ainda bater com chatGenerationRef no
  // momento em que ele roda — senão não faz nada neste ciclo (falha fechada,
  // sem fallback de "marcar direto"; ver useFocusEffect).
  const anchorPromiseRef = useRef<{
    generation: number;
    promise: Promise<Timestamp | null>;
  } | null>(null);
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

  // S101 — abertura do chat em duas etapas: (1) getInitialMessageWindow
  // descobre o corte da janela (30 mais recentes, ou até a não lida mais
  // antiga quando há mais de 30 não lidas) usando o lastReadAt lido ANTES de
  // qualquer escrita nossa; (2) o onSnapshot em tempo real assina só dessa
  // janela pra frente, a partir do CURSOR (snapshot) da etapa (1). O histórico
  // anterior fica de fora até o usuário pedir.
  //
  // Se a etapa (1) falhar (offline, match desfeito), segue com cursor null e o
  // listener assina as MESSAGE_PAGE_SIZE mais recentes (limitToLast) em vez de
  // deixar a tela vazia — silencioso, só console.warn, sem indicador na UI.
  //
  // S101 (RODADA 2) — ORDEM DE DECLARAÇÃO IMPORTA: este efeito precisa vir
  // ANTES do useFocusEffect logo abaixo. React roda efeitos passivos
  // (useEffect) na ordem em que foram DECLARADOS no componente; se este
  // efeito for movido pra DEPOIS do useFocusEffect no futuro, a geração lida
  // pelo useFocusEffect (chatGenerationRef.current) vai estar sempre UM CICLO
  // ATRASADA em relação à geração gravada aqui em anchorPromiseRef — a guarda
  // de geração do useFocusEffect nunca vai bater e o foco NUNCA MAIS vai
  // marcar a conversa como lida. Não mova um sem revisar a lógica de geração
  // dos dois juntos.
  useEffect(() => {
    // Nova geração a cada (re)abertura desta conversa — inclusive reabrir o
    // MESMO matchId conta como nova geração. Token pra invalidar leituras
    // assíncronas de uma abertura anterior (ver anchorPromiseRef abaixo e
    // handleLoadOlderMessages).
    chatGenerationRef.current += 1;
    const generation = chatGenerationRef.current;
    windowIdsRef.current = new Set();
    if (!uid) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    setLoading(true);
    setMessages([]);
    setOlderMessages([]);
    setOlderCursor(null);
    setHasOlderMessages(false);
    isNearBottomRef.current = true;
    setHasNewMessageBelow(false);
    hasNewMessageBelowRef.current = false;

    // S101 (correção, RODADA 2) — a leitura da âncora começa AQUI e fica
    // guardada na ref JUNTO da geração desta abertura: o markMatchRead do
    // useFocusEffect só encadeia nesta Promise se a geração ainda bater
    // quando ele rodar.
    const anchorPromise = getMatchLastReadAt(matchId, uid);
    anchorPromiseRef.current = { generation, promise: anchorPromise };

    const start = async () => {
      let cursor: MessageCursor | null = null;
      try {
        const lastReadAt = await anchorPromise;
        const initialWindow = await getInitialMessageWindow(matchId, lastReadAt);
        if (cancelled) return;
        cursor = initialWindow.cursor;
        setOlderCursor(initialWindow.cursor);
        setHasOlderMessages(initialWindow.hasMore);
      } catch (error) {
        if (cancelled) return;
        console.warn('[ChatScreen] falha ao montar a janela inicial de mensagens:', error);
      }
      // cursor null (chat nunca aberto, ou falha/offline acima) NÃO vira query
      // sem limite: listenMessages cai no ramo limitToLast(MESSAGE_PAGE_SIZE).
      unsub = listenMessages(
        matchId,
        (msgs) => {
          // S101 (correção) — garantia de "ao enviar mensagem própria, sempre
          // rola pro fim" aferida AQUI, na chegada da mensagem, e não por um
          // flag ligado antes do envio: upload de foto/permissão de localização
          // duram segundos, e um onScroll do usuário nesse intervalo apagaria o
          // flag antes da mensagem existir. Mensagem mais nova da janela, do
          // próprio uid, que não estava na janela anterior => desce sempre.
          const newest = msgs[msgs.length - 1];
          const isOwnNewMessage =
            !!newest && newest.senderId === uid && !windowIdsRef.current.has(newest.id);
          windowIdsRef.current = new Set(msgs.map((m) => m.id));
          setMessages(msgs);
          setLoading(false);
          // S142 — "está vendo o fim" vale tanto pra mensagem própria quanto
          // pra já estar perto do fim quando a mensagem do outro lado chega.
          // Só nesse caso o scroll desce E markMatchRead é chamado; senão
          // (mensagem do outro lado, usuário rolado pra cima) acende o
          // indicador flutuante e adia a leitura pro retorno ao fim (ver
          // handleReturnToBottom/handleMessagesScroll).
          const isViewingBottom = isOwnNewMessage || isNearBottomRef.current;
          if (isViewingBottom) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            setHasNewMessageBelow(false);
            hasNewMessageBelowRef.current = false;
          } else {
            setHasNewMessageBelow(true);
            hasNewMessageBelowRef.current = true;
          }
          if (isViewingBottom && isFocusedRef.current && uid) {
            markMatchRead(matchId, uid).catch(() => {});
          }
        },
        cursor,
      );
    };
    start();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [matchId, uid]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      // S101 (RODADA 2) — só encadeia markMatchRead se a Promise guardada em
      // anchorPromiseRef for da MESMA geração lida agora em
      // chatGenerationRef. Se a geração não bater (deep link/notificação
      // trocou de conversa nesse meio-tempo) ou a ref ainda for null (efeito
      // de dados acima ainda não rodou neste ciclo), NÃO chama markMatchRead
      // de jeito nenhum — não existe fallback de "marcar direto". Falha
      // fechada: é preferível atrasar a marcação de lido até o próximo foco
      // do que arriscar destruir o cálculo de não lidas de uma janela que já
      // foi montada com uma âncora errada.
      //
      // Ponto crítico: NÃO engolir a rejeição com .catch(() => null) antes do
      // .then — isso transformaria falha de leitura em "sucesso" e o
      // markMatchRead rodaria sem conhecer a âncora, destruindo as não lidas
      // de forma irreversível. Só marca em caso de SUCESSO da Promise; se ela
      // rejeitar, o .catch final apenas descarta o erro sem chamar
      // markMatchRead.
      const anchor = anchorPromiseRef.current;
      const generation = chatGenerationRef.current;
      // S142 (correção) — refoco (ex.: voltar de MatchProfile/Verification na
      // mesma stack, sem desmontar) NÃO deve marcar como lido enquanto o
      // indicador "Nova mensagem" estiver pendente: o usuário ainda não voltou
      // ao fim da lista, só saiu e voltou pra mesma geração.
      if (anchor && anchor.generation === generation && !hasNewMessageBelowRef.current) {
        anchor.promise
          .then(() => {
            if (uid) markMatchRead(matchId, uid).catch(() => {});
          })
          .catch(() => {});
      }
      return () => {
        isFocusedRef.current = false;
      };
    }, [matchId, uid]),
  );

  // S101 — "carregar mais": página anterior por getDocs + startAfter, sem
  // tempo real. Prefixa em olderMessages descartando id já conhecido (o
  // startAfter já garante que não há sobreposição, o filtro é cinto e
  // suspensório contra toque duplo).
  const handleLoadOlderMessages = useCallback(async () => {
    if (loadingOlder || !olderCursor) return;
    // S101 (correção, RODADA 2) — mesma geração de abertura (chatGenerationRef),
    // não mais o matchId isolado: no cenário A→B→A o matchId bate ('A' ===
    // 'A') mas a geração não, então uma página antiga da PRIMEIRA vez em A
    // que resolve tarde é descartada em vez de corromper o olderCursor da
    // SEGUNDA vez em A.
    const requestedGeneration = chatGenerationRef.current;
    setLoadingOlder(true);
    try {
      const page = await loadOlderMessages(matchId, olderCursor);
      if (chatGenerationRef.current !== requestedGeneration) return;
      setOlderMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...page.messages.filter((m) => !known.has(m.id)), ...prev];
      });
      if (page.cursor) setOlderCursor(page.cursor);
      setHasOlderMessages(page.hasMore);
    } catch (error) {
      console.warn('[ChatScreen] falha ao carregar mensagens anteriores:', error);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, olderCursor, matchId]);

  // S101 — gate do scroll automático (ver isNearBottomRef).
  // S142 — além de atualizar o gate, detecta a transição false→true (usuário
  // voltou ao fim rolando manualmente, sem tocar no indicador) e replica o
  // mesmo efeito de handleReturnToBottom: limpa o indicador e dispara a
  // leitura que tinha ficado pendente.
  const handleMessagesScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
      const wasNearBottom = isNearBottomRef.current;
      const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
      isNearBottomRef.current = isNearBottom;
      if (!wasNearBottom && isNearBottom && hasNewMessageBelow) {
        setHasNewMessageBelow(false);
        hasNewMessageBelowRef.current = false;
        if (uid) markMatchRead(matchId, uid).catch(() => {});
      }
    },
    [hasNewMessageBelow, matchId, uid],
  );

  // S142 — toque no indicador flutuante "nova mensagem": desce até o fim,
  // some com o indicador e dispara a leitura que tinha ficado pendente (ver
  // decisão 3 acima, no callback do listener).
  const handleReturnToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setHasNewMessageBelow(false);
    hasNewMessageBelowRef.current = false;
    if (uid) markMatchRead(matchId, uid).catch(() => {});
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

  // S92 — preenche o input com o texto quando entra em modo edição
  useEffect(() => {
    if (editTarget) {
      setText(editTarget.text);
    }
  }, [editTarget]);

  // S101 — histórico paginado (mais antigo primeiro) + janela em tempo real,
  // nessa ordem. O Set de ids da janela impede duplicata se uma página antiga
  // encostar no corte do listener.
  const orderedMessages = useMemo(() => {
    if (olderMessages.length === 0) return messages;
    const windowIds = new Set(messages.map((m) => m.id));
    return [...olderMessages.filter((m) => !windowIds.has(m.id)), ...messages];
  }, [olderMessages, messages]);

  // S85-A — ponto único do filtro: a FlatList consome visibleMessages, não
  // messages direto (ver data={visibleMessages} abaixo). hiddenIds é só do
  // dono da tela, então isso nunca afeta o que o outro participante vê.
  const visibleMessages = useMemo(
    () =>
      hiddenIds.length === 0
        ? orderedMessages
        : orderedMessages.filter((m) => !hiddenIds.includes(m.id)),
    [orderedMessages, hiddenIds],
  );

  // S129-A — reversão do S79: tocar na citação leva até a mensagem original.
  // Reusa os estados/serviço já existentes do S101 (messages/olderMessages/
  // olderCursor/hasOlderMessages/loadingOlder, loadOlderMessages,
  // visibleMessages, flatListRef) — nada de sistema de paginação paralelo, e
  // NÃO chama handleLoadOlderMessages (é um loop próprio, separado).
  const scrollToMessage = useCallback(
    async (messageId: string) => {
      if (visibleMessages.some((m) => m.id === messageId)) {
        setPendingScrollTarget(messageId);
        return;
      }
      // Nada mais pra buscar: load manual já em andamento, ou não há cursor,
      // ou a última página já disse que não há mais histórico. Só avisa
      // quando NÃO há load manual em andamento — não interromper esse caso.
      if (loadingOlder || !olderCursor || !hasOlderMessages) {
        if (!loadingOlder) {
          Alert.alert('Aviso', 'Não foi possível localizar a mensagem original.');
        }
        return;
      }

      // Mesmo flag do botão "carregar mensagens anteriores": desabilita/
      // oculta o botão manual durante esta busca, evitando corrida entre
      // handleLoadOlderMessages e este loop escrevendo nos mesmos estados ao
      // mesmo tempo.
      // S129-A (correção pós-auditoria) — mesma guarda de geração que
      // handleLoadOlderMessages já usa: se a conversa trocar (deep
      // link/notificação reabrindo a mesma instância de ChatScreen com
      // outro matchId) no meio deste loop, aborta antes de escrever estado
      // da conversa nova com dados da conversa antiga.
      const requestedGeneration = chatGenerationRef.current;
      setLoadingOlder(true);
      let cursor: MessageCursor | null = olderCursor;
      let hasMore: boolean = hasOlderMessages;
      let found = false;
      let pagesFetched = 0;

      try {
        while (cursor && hasMore && pagesFetched < MAX_JUMP_TO_REPLY_PAGES) {
          const page = await loadOlderMessages(matchId, cursor);
          if (chatGenerationRef.current !== requestedGeneration) return;
          pagesFetched += 1;
          setOlderMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            return [...page.messages.filter((m) => !known.has(m.id)), ...prev];
          });
          cursor = page.cursor;
          hasMore = page.hasMore;
          // S85-A — exclui ids escondidos "pra mim": se a mensagem original
          // foi ocultada pelo próprio usuário, ela nunca vai aparecer em
          // visibleMessages mesmo depois de carregada — sem esta exclusão o
          // loop marcaria "achou" e o alvo pendente travaria esperando pra
          // sempre.
          if (page.messages.some((m) => m.id === messageId && !hiddenIds.includes(m.id))) {
            found = true;
            break;
          }
        }
      } catch (error) {
        console.warn('[ChatScreen] falha ao buscar mensagem original da citação:', error);
      } finally {
        if (chatGenerationRef.current === requestedGeneration) {
          setOlderCursor(cursor);
          setHasOlderMessages(hasMore);
        }
        setLoadingOlder(false);
      }

      if (chatGenerationRef.current !== requestedGeneration) return;

      if (found) {
        setPendingScrollTarget(messageId);
      } else {
        Alert.alert('Aviso', 'Não foi possível localizar a mensagem original.');
      }
    },
    [visibleMessages, loadingOlder, olderCursor, hasOlderMessages, hiddenIds, matchId],
  );

  // S129-A — dispara o scroll de fato assim que a mensagem-alvo aparecer em
  // visibleMessages. Se ainda não achar (página anterior ainda carregando /
  // re-render não propagou), não faz nada — o próprio efeito roda de novo
  // quando visibleMessages mudar.
  useEffect(() => {
    if (!pendingScrollTarget) return;
    const index = visibleMessages.findIndex((m) => m.id === pendingScrollTarget);
    if (index === -1) return;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    setPendingScrollTarget(null);
  }, [pendingScrollTarget, visibleMessages]);

  useEffect(() => {
    const unsub = listenMatchBlockStatus(matchId, (blocked, lastReadAt, deliveredAt) => {
      setBlockedBy(blocked);
      setOtherLastReadAt(lastReadAt);
      setOtherDeliveredAt(deliveredAt);
    });
    return unsub;
  }, [matchId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || isBlocked || isUnverified) return;

    // S92 — modo edição: chamar editMessage em vez de sendMessage
    if (editTarget) {
      try {
        await editMessage(matchId, editTarget.id, trimmed);
        setText('');
        setEditTarget(null);
      } catch (error) {
        // Falha mantém texto e modo de edição de propósito: a rule pode negar
        // (fora da janela de 1h) e o usuário não pode perder o que digitou.
        console.warn('[ChatScreen] falha ao editar mensagem:', error);
      }
      return;
    }

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
    // S101 — enviar sempre desce até o fim, mesmo com a lista rolada pra cima
    // lendo histórico: o gate de scroll só vale pra mensagem que CHEGA. Aqui é
    // só o atalho otimista (envio de texto é imediato); a GARANTIA é o
    // isOwnNewMessage no callback do listener.
    isNearBottomRef.current = true;
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
    // S101 (correção) — nada de ligar isNearBottomRef aqui: o upload dura
    // segundos e um onScroll do usuário no meio apagaria o flag antes da foto
    // chegar. Quem garante o scroll é o isOwnNewMessage no callback do listener.
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
        // S101 (correção) — idem handleSendImage: sem flag frágil aqui, a
        // garantia de scroll é o isOwnNewMessage no callback do listener.
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

  const handleUnmatch = () => {
    setOptionsSheetVisible(false);
    if (!user) return;
    Alert.alert(
      'Desfazer match?',
      `Você e ${otherName} não vão mais poder conversar. Essa ação é definitiva e não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desfazer match',
          style: 'destructive',
          onPress: async () => {
            try {
              await unmatch(matchId);
              navigation.navigate('Main', { screen: 'Conversas' });
            } catch (error) {
              console.error('[ChatScreen] falha ao desfazer match:', error);
              Alert.alert(
                'Erro',
                'Não foi possível desfazer o match agora. Tente novamente mais tarde.',
              );
            }
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

  // S102-C — denúncia de uma mensagem específica, reusando reportUser com
  // messageContext. Independente de handleReport (fluxo de perfil) acima.
  const handleReportMessage = async (reason: ReportReason, details: string) => {
    if (!user || !reportMessageTarget) return;
    await reportUser(user.uid, reportMessageTarget.senderId, reason, details, {
      matchId,
      messageId: reportMessageTarget.id,
      messageText: (reportMessageTarget.text ?? '').slice(0, 400),
      ...(reportMessageTarget.imageUrl ? { messageImageUrl: reportMessageTarget.imageUrl } : {}),
    });
    setReportMessageTarget(null);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
  };

  // S157 — useCallback com deps vazias: o corpo não lê nenhum estado/prop
  // do componente, só o parâmetro `location` recebido na chamada. Sem isso
  // esta função ganharia identidade nova a cada render de ChatScreen (ex.:
  // cada tecla digitada), o que quebraria o React.memo do MessageBubble
  // logo abaixo, já que ela é repassada como prop onOpenLocation.
  const handleOpenLocation = useCallback((location: { latitude: number; longitude: number }) => {
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
  }, []);

  // S157 — useCallback pra FlatList não receber uma prop renderItem nova a
  // cada render de ChatScreen (ex.: cada tecla digitada no input), o que
  // forçava a FlatList (PureComponent) a re-renderizar todas as bolhas
  // visíveis. Deps: só o que o corpo abaixo de fato lê — nem `text` nem
  // `isOtherTyping` entram aqui, porque nenhum dos dois é usado por
  // MessageBubble/renderMessage.
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        item={item}
        currentUid={user?.uid}
        otherName={otherName}
        otherPhoto={otherPhoto}
        reactions={reactions[item.id]}
        otherReadAt={otherLastReadAt[otherUid]}
        otherDeliveredAt={otherDeliveredAt[otherUid]}
        onViewImage={setViewerImage}
        onOpenLocation={handleOpenLocation}
        onLongPressReply={setReplyOptionsTarget}
        onDragReply={setReplyTarget}
        onJumpToReply={scrollToMessage}
      />
    ),
    [
      user?.uid,
      otherName,
      otherPhoto,
      reactions,
      otherLastReadAt,
      otherDeliveredAt,
      otherUid,
      handleOpenLocation,
      scrollToMessage,
    ],
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

  // S92 — guarda de edição: só a própria mensagem de texto, ainda não
  // apagada, sem foto/localização, dentro da janela de 1h. Mesmo padrão.
  const canEdit =
    !!replyOptionsTarget &&
    !!uid &&
    replyOptionsTarget.senderId === uid &&
    !replyOptionsTarget.deletedAt &&
    !replyOptionsTarget.imageUrl &&
    !replyOptionsTarget.location &&
    (!replyOptionsTarget.createdAt ||
      Date.now() - replyOptionsTarget.createdAt.toMillis() < EDIT_WINDOW_MS);

  // S102-C — guarda de UX: só mensagem do OUTRO lado, ainda não apagada.
  // Mesmo raciocínio client-side-primeiro de canDeleteForEveryone/canEdit
  // acima, evitando permission-denied engolido (bug do S49).
  const canReportMessage =
    !!replyOptionsTarget &&
    !!uid &&
    replyOptionsTarget.senderId !== uid &&
    !replyOptionsTarget.deletedAt;

  // S142 — guarda de "copiar": vale pra mensagem de qualquer um dos dois
  // lados, sem janela de tempo (diferente de canEdit/canDeleteForEveryone).
  // !!replyOptionsTarget.text barra foto/localização (text === '') e
  // mensagem apagada (lápide, sem text).
  const canCopy =
    !!replyOptionsTarget &&
    !replyOptionsTarget.deletedAt &&
    !replyOptionsTarget.imageUrl &&
    !replyOptionsTarget.location &&
    !!replyOptionsTarget.text;

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
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
          <View style={styles.messagesWrap}>
            {loading ? (
              <View style={styles.messagesList}>
                {SKELETON_PATTERN.map((isMe, i) => (
                  <View
                    key={i}
                    style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}
                  >
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
                onScroll={handleMessagesScroll}
                scrollEventThrottle={16}
                // S101 — sem isto, prefixar uma página antiga empurra o
                // conteúdo visível pra baixo e a leitura "pula". minIndexForVisible
                // 0 faz o RN compensar o offset pelo tamanho do que entrou acima,
                // mantendo na tela exatamente a mensagem que o usuário estava lendo.
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                // S129-A — workaround padrão de RN pra scrollToIndex numa lista
                // de altura variável (sem getItemLayout aqui): se o índice ainda
                // não tiver layout medido, tenta de novo num timeout curto.
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
                  }, 100);
                }}
                onContentSizeChange={() => {
                  if (isNearBottomRef.current && !pendingScrollTarget) {
                    flatListRef.current?.scrollToEnd({ animated: false });
                  }
                }}
                // S101 — página anterior só sob toque (decisão de produto:
                // nada de auto-load ao chegar perto do topo).
                ListHeaderComponent={
                  hasOlderMessages ? (
                    <View style={styles.loadOlderWrap}>
                      {loadingOlder ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <AnimatedPressable
                          style={styles.loadOlderBtn}
                          onPress={handleLoadOlderMessages}
                        >
                          <Ionicons
                            name="arrow-up-circle-outline"
                            size={16}
                            color={theme.colors.primary}
                          />
                          <Text style={styles.loadOlderText}>Carregar mensagens anteriores</Text>
                        </AnimatedPressable>
                      )}
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  <EmptyState
                    icon="chatbubble-ellipses-outline"
                    title="Comece uma conversa!"
                    subtitle={`Vocês fizeram match! Diga olá para ${otherName}`}
                  />
                }
              />
            )}
            {/* S142 — indicador flutuante "nova mensagem", mesmo molde visual do
                botão "carregar mensagens anteriores" (AnimatedPressable +
                Ionicons + theme.colors.primary), ancorado embaixo (acima do
                composer) em vez de no topo. Sem contador — só o aviso fixo.
                pointerEvents box-none no wrap pra não bloquear o scroll da
                lista na área vazia ao redor do botão. */}
            {hasNewMessageBelow && (
              <View style={styles.newMessageIndicatorWrap} pointerEvents="box-none">
                <AnimatedPressable
                  style={styles.newMessageIndicatorBtn}
                  onPress={handleReturnToBottom}
                >
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={16}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.newMessageIndicatorText}>Nova mensagem</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>

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
            <View
              style={[styles.blockedBanner, { paddingBottom: theme.spacing.md + insets.bottom }]}
            >
              <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.blockedBannerText}>Conversa indisponível</Text>
            </View>
          ) : isUnverified ? (
            <Pressable
              style={[styles.blockedBanner, { paddingBottom: theme.spacing.md + insets.bottom }]}
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
              {/* S92 — barra de edição, espelhando o modo responder. */}
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
                  placeholder={`Mensagem para ${otherName}…`}
                  placeholderTextColor={theme.colors.textLight}
                  value={text}
                  onChangeText={handleChangeText}
                  multiline
                  maxLength={2000}
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
            {/* S142 — "copiar mensagem": qualquer lado, sem janela de tempo,
                só texto ainda não apagado (guarda canCopy acima). */}
            {canCopy && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={async () => {
                    const target = replyOptionsTarget;
                    setReplyOptionsTarget(null);
                    if (!target?.text) return;
                    await Clipboard.setStringAsync(target.text);
                  }}
                >
                  <Ionicons name="copy-outline" size={22} color={theme.colors.text} />
                  <Text style={styles.sheetOptionText}>Copiar mensagem</Text>
                </AnimatedPressable>
              </>
            )}
            {/* S92 — "editar": só em mensagem própria de texto, ainda não
                apagada, dentro da janela de 1h. Mesma guarda que a rule. */}
            {canEdit && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    setEditTarget(replyOptionsTarget);
                    setReplyOptionsTarget(null);
                  }}
                >
                  <Ionicons name="pencil" size={22} color={theme.colors.text} />
                  <Text style={styles.sheetOptionText}>Editar</Text>
                </AnimatedPressable>
              </>
            )}
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
                          deleteMessageForEveryone(matchId, target.id, target.imageUrl).catch(
                            (err) => console.warn('[ChatScreen] falha ao apagar mensagem', err),
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
            {/* S102-C — "Denunciar mensagem": só a mensagem do outro lado,
                ainda não apagada (canReportMessage). Fluxo independente da
                denúncia de perfil do menu do cabeçalho. */}
            {canReportMessage && (
              <AnimatedPressable
                style={styles.sheetOption}
                onPress={() => {
                  setReportMessageTarget(replyOptionsTarget);
                  setReplyOptionsTarget(null);
                }}
              >
                <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
                <Text style={styles.sheetOptionText}>Denunciar mensagem</Text>
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
            <View style={styles.sheetDivider} />
            <AnimatedPressable style={styles.sheetOption} onPress={handleUnmatch}>
              <Ionicons name="heart-dislike-outline" size={22} color={theme.colors.nope} />
              <Text style={[styles.sheetOptionText, { color: theme.colors.nope }]}>
                Desfazer match
              </Text>
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

      {/* S102-C — segundo ReportModal, independente do de perfil acima:
          denúncia de uma mensagem específica via sheet de toque longo. */}
      <ReportModal
        visible={!!reportMessageTarget}
        onClose={() => setReportMessageTarget(null)}
        onSubmit={handleReportMessage}
        title="Denunciar mensagem"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

  header: {
    backgroundColor: theme.colors.surface,
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

  // S142 — container relativo da FlatList, âncora de posicionamento do
  // indicador flutuante "nova mensagem" abaixo (position: absolute nele).
  messagesWrap: { flex: 1, position: 'relative' },

  // S142 — indicador flutuante "nova mensagem", ancorado embaixo da lista
  // (acima do composer). Mesmo molde visual de loadOlderBtn/loadOlderText
  // logo abaixo (texto azul sobre surface, regra de ouro do tema).
  newMessageIndicatorWrap: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  newMessageIndicatorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  newMessageIndicatorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // S101 — cabeçalho "carregar mais" da lista de mensagens. Texto azul sobre
  // surface (nunca branco sobre amarelo, regra de ouro do tema).
  loadOlderWrap: { alignItems: 'center', paddingBottom: theme.spacing.sm },
  loadOlderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  loadOlderText: { fontSize: theme.fontSize.xs, color: theme.colors.primary, fontWeight: '600' },

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
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 20 },
  bubbleTextMe: { color: theme.colors.white },
  // S158 — wrapper do Text visível + Text espelho: position 'relative'
  // garante que o espelho (position absolute) se posicione relativo a este
  // wrapper, e não à bolha inteira (que pode ter citação/momentoRef acima).
  bubbleTextWrap: { position: 'relative' },
  bubbleTextMirror: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  // S130 — "ler mais" da bolha colapsada.
  bubbleReadMore: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 2,
  },
  bubbleReadMoreMe: { color: theme.colors.white, textDecorationLine: 'underline' },
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

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
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
