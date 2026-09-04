// src/screens/ListingChatScreen.tsx
//
// S168-B — chat 1:1 SEM match entre o interessado e o anunciante de um
// classificado (listings/{listingId}, S168-A). Mirror do SUBCONJUNTO de
// GroupChatScreen.tsx (texto, foto, responder, copiar, apagar pra todos) —
// SEM reações/Modal de emoji, edição, enquete, presença/membros, denunciar
// nem swipe-to-reply (fora de escopo). chatId = listingChatId(listingId,
// interestedId); o doc listingChats/{chatId} só é criado pelo INTERESSADO na
// PRIMEIRA mensagem (nunca ao abrir a tela) — ver
// createListingChatWithFirstMessage.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  createListingChatWithFirstMessage,
  deleteListingChatMessageForEveryone,
  LISTING_CHAT_DELETE_FOR_EVERYONE_WINDOW_MS,
  listenListingChat,
  listenListingChatMessages,
  listingChatId,
  ListingChat,
  ListingChatMessage,
  ListingChatReplyTo,
  markListingChatRead,
  MAX_LISTING_CHAT_MESSAGE_LENGTH,
  sendListingChatMessage,
  uploadListingChatImage,
} from '@/services/listingChatService';
import { getListing, Listing } from '@/services/listingService';
import { getDisplayName } from '@/utils/profile';
import { countCodePoints } from '@/utils/text';

type ListingChatScreenProps = NativeStackScreenProps<RootStackParamList, 'ListingChat'>;

// S149-C — mesma regra de truncamento de GroupChatScreen.tsx:82-91 (100 code
// points na citação; rules aceitam até 400, guarda de abuso).
const REPLY_QUOTE_LENGTH = 100;
const truncateReplyQuote = (value: string): string =>
  countCodePoints(value) > REPLY_QUOTE_LENGTH
    ? Array.from(value).slice(0, REPLY_QUOTE_LENGTH).join('')
    : value;

const REPLY_QUOTE_PHOTO_LABEL = '📷 Foto';
const buildReplyQuote = (message: ListingChatMessage): string => {
  if (message.text) return truncateReplyQuote(message.text);
  if (message.imageUrl) return REPLY_QUOTE_PHOTO_LABEL;
  return '';
};

// Mirror estrutural de GroupMessageBubble (GroupChatScreen.tsx:114-254),
// reduzido: sem nome de remetente (chat é sempre 1:1, ao contrário do
// grupo), sem reações, sem "editada". O "ler mais" (numberOfLines/Text
// espelho) é mirror EXATO — ver a armadilha S158 no comentário de
// GroupChatScreen.tsx:190-197.
interface ListingChatMessageBubbleProps {
  item: ListingChatMessage;
  isMe: boolean;
  getReplySenderLabel: (senderId: string) => string;
  onViewImage: (imageUrl: string) => void;
  onLongPress: (message: ListingChatMessage) => void;
}

const ListingChatMessageBubble = React.memo(function ListingChatMessageBubble({
  item,
  isMe,
  getReplySenderLabel,
  onViewImage,
  onLongPress,
}: ListingChatMessageBubbleProps) {
  const imageUrl = item.imageUrl;
  const replyTo = item.replyTo;
  const [textExpanded, setTextExpanded] = useState(false);
  const [isTextTruncated, setIsTextTruncated] = useState(false);

  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
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
          <>
            <View style={styles.bubbleTextWrap}>
              <Text
                style={[styles.bubbleText, isMe && styles.bubbleTextMe]}
                onLongPress={() => onLongPress(item)}
                numberOfLines={textExpanded ? undefined : 6}
              >
                {item.text}
              </Text>
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
        </View>
      </View>
    </View>
  );
});

export default function ListingChatScreen({ route, navigation }: ListingChatScreenProps) {
  const { listingId, ownerId, interestedId, listingTitle } = route.params;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const chatId = listingChatId(listingId, interestedId);
  const isOwner = user?.uid === ownerId;
  const otherUid = isOwner ? interestedId : ownerId;

  const [chat, setChat] = useState<ListingChat | null | undefined>(undefined);
  const [messages, setMessages] = useState<ListingChatMessage[]>([]);
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [text, setText] = useState('');
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ListingChatMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<ListingChatReplyTo | null>(null);
  const flatListRef = useRef<FlatList<ListingChatMessage>>(null);
  const sendingRef = useRef(false);
  // Evita Alert/goBack duplicado se o listener do chat e o de mensagens
  // derem permission-denied quase juntos.
  const permissionDeniedRef = useRef(false);

  const chatExists = chat != null;

  // permission-denied em QUALQUER listener desta tela é "conversa
  // indisponível" (armadilha do ROADMAP: nunca erro genérico) — Alert +
  // goBack, mirror do princípio já usado em listenGroup/getGroup
  // (groupService.ts), adaptado aqui pra sair da tela em vez de renderizar
  // um estado "sumiu".
  const handleListenerError = useCallback(
    (error: unknown) => {
      if ((error as { code?: string })?.code === 'permission-denied') {
        if (permissionDeniedRef.current) return;
        permissionDeniedRef.current = true;
        Alert.alert('Conversa indisponível', 'Não foi possível abrir esta conversa.');
        navigation.goBack();
        return;
      }
      console.error('[ListingChatScreen] erro no listener:', error);
    },
    [navigation],
  );

  useEffect(() => {
    const unsub = listenListingChat(chatId, setChat, handleListenerError);
    return unsub;
  }, [chatId, handleListenerError]);

  // Mensagens só depois de o doc existir — antes disso a rule de messages
  // negaria (pai inexistente). "chatExists" (booleano) em vez de "chat"
  // (objeto) nas deps: o objeto muda de referência a CADA snapshot do chat
  // (ex.: toda troca de lastMessage), o que reabriria este listener sem
  // necessidade.
  useEffect(() => {
    if (!chatExists) {
      setMessages([]);
      return;
    }
    const unsub = listenListingChatMessages(
      chatId,
      (msgs, lastMessageHasPendingWrites) => {
        setMessages(msgs);
        // Leitura (b) — mirror do critério de isMatchUnread: só marca lido
        // quando a ÚLTIMA mensagem já foi confirmada pelo servidor e não foi
        // o próprio uid quem mandou.
        if (user && !lastMessageHasPendingWrites) {
          const last = msgs[msgs.length - 1];
          if (last && last.senderId !== user.uid) {
            markListingChatRead(chatId, user.uid).catch(() => {});
          }
        }
      },
      handleListenerError,
    );
    return unsub;
  }, [chatExists, chatId, user, handleListenerError]);

  // Leitura (a) — no mount, sempre que o doc já existe (independente de quem
  // mandou a última mensagem), mirror de markGroupMessagesSeen
  // (GroupChatScreen.tsx).
  useEffect(() => {
    if (!user || !chatExists) return;
    markListingChatRead(chatId, user.uid).catch(() => {});
  }, [chatExists, chatId, user]);

  useEffect(() => {
    let cancelled = false;
    getListing(listingId).then((result) => {
      if (!cancelled) setListing(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    let cancelled = false;
    getUserProfile(otherUid)
      .then((p) => {
        if (!cancelled) setOtherProfile(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  const isUnverified = !profile?.verified;
  const headerTitle = chat?.listingTitle ?? listingTitle;
  const canOpenListing = !!listing;
  // Banner "Anúncio encerrado": anúncio inacessível/removido, não aprovado ou
  // já expirado. NÃO bloqueia envio — conversa segue aberta (spec).
  const showClosedBanner =
    listing !== undefined &&
    (listing === null ||
      listing.status !== 'approved' ||
      listing.expiresAt.toMillis() <= Date.now());

  const getReplySenderLabel = (senderId: string): string => {
    if (senderId === user?.uid) return 'Você';
    return getDisplayName(otherProfile);
  };

  // S77 — cap de 2000 CODE POINTS (não `.length`/UTF-16 code units): um
  // emoji fora do BMP conta 1 aqui, ao contrário do `maxLength` nativo do
  // TextInput (mirror do padrão de truncateReplyQuote acima, aplicado ao
  // corpo inteiro da mensagem).
  const handleChangeText = (value: string) => {
    if (countCodePoints(value) <= MAX_LISTING_CHAT_MESSAGE_LENGTH) {
      setText(value);
      return;
    }
    setText(Array.from(value).slice(0, MAX_LISTING_CHAT_MESSAGE_LENGTH).join(''));
  };

  const handleSend = useCallback(async () => {
    if (!user || sendingRef.current) return;
    const value = text.trim();
    if (!value) return;
    sendingRef.current = true;
    const replyTo = replyTarget ?? undefined;
    setText('');
    setReplyTarget(null);
    try {
      if (!chatExists) {
        await createListingChatWithFirstMessage(
          { listingId, ownerId, listingTitle: chat?.listingTitle ?? listingTitle },
          user.uid,
          value,
          replyTo ? { replyTo } : undefined,
        );
      } else {
        await sendListingChatMessage(chatId, user.uid, value, replyTo ? { replyTo } : undefined);
      }
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      console.error('[ListingChatScreen] falha ao enviar mensagem:', err);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    } finally {
      sendingRef.current = false;
    }
  }, [chatExists, chat, chatId, listingId, ownerId, listingTitle, replyTarget, text, user]);

  const handleSendImage = useCallback(
    async (localUri: string) => {
      if (!user || sendingRef.current) return;
      sendingRef.current = true;
      setUploadProgress(0);
      try {
        const imageUrl = await uploadListingChatImage(chatId, localUri, setUploadProgress);
        if (!chatExists) {
          await createListingChatWithFirstMessage(
            { listingId, ownerId, listingTitle: chat?.listingTitle ?? listingTitle },
            user.uid,
            '',
            { imageUrl },
          );
        } else {
          await sendListingChatMessage(chatId, user.uid, '', { imageUrl });
        }
        flatListRef.current?.scrollToEnd({ animated: true });
      } catch (err) {
        console.error('[ListingChatScreen] falha ao enviar foto:', err);
        Alert.alert('Erro', 'Não foi possível enviar a foto.');
      } finally {
        setUploadProgress(null);
        sendingRef.current = false;
      }
    },
    [chatExists, chat, chatId, listingId, ownerId, listingTitle, user],
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

  // "Responder" só em mensagem não apagada (spec, ao contrário do grupo, que
  // não tem essa guarda). Mensagem já apagada não recebe onLongPress na
  // bolha (ver ListingChatMessageBubble acima), então na prática
  // actionTarget nunca é uma mensagem com deletedAt — guarda mantida mesmo
  // assim, mirror do texto da spec.
  const canReply = !!actionTarget && !actionTarget.deletedAt;
  const canCopy =
    !!actionTarget && !actionTarget.deletedAt && !actionTarget.imageUrl && !!actionTarget.text;
  const canDeleteForEveryone =
    !!actionTarget &&
    actionTarget.senderId === user?.uid &&
    !actionTarget.deletedAt &&
    (!actionTarget.createdAt ||
      Date.now() - actionTarget.createdAt.toMillis() < LISTING_CHAT_DELETE_FOR_EVERYONE_WINDOW_MS);

  const renderMessage = ({ item }: { item: ListingChatMessage }) => {
    const isMe = item.senderId === user?.uid;
    return (
      <ListingChatMessageBubble
        item={item}
        isMe={isMe}
        getReplySenderLabel={getReplySenderLabel}
        onViewImage={setViewerImage}
        onLongPress={setActionTarget}
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
          <AnimatedPressable
            style={styles.headerInfo}
            disabled={!canOpenListing}
            onPress={() => canOpenListing && navigation.navigate('ListingDetail', { listingId })}
          >
            {otherProfile?.photoURL ? (
              <Image
                source={{ uri: otherProfile.photoURL }}
                style={styles.headerAvatar}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
              />
            ) : null}
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {getDisplayName(otherProfile)}
              </Text>
            </View>
          </AnimatedPressable>
          <View style={styles.backBtn} />
        </View>

        {showClosedBanner && (
          <View style={styles.closedBanner}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.closedBannerText}>Anúncio encerrado</Text>
          </View>
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {chat === undefined ? (
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
                  title="Envie uma mensagem para o anunciante"
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

          {isUnverified ? (
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
              {replyTarget && (
                <View style={styles.replyBar}>
                  <View style={styles.replyBarAccent} />
                  <View style={styles.replyBarTextWrap}>
                    <Text style={styles.replyBarName}>
                      {getReplySenderLabel(replyTarget.senderId)}
                    </Text>
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
              <View style={[styles.inputRow, { paddingBottom: theme.spacing.sm + insets.bottom }]}>
                <AnimatedPressable
                  style={styles.inputIcon}
                  onPress={() => setAttachSheetVisible(true)}
                >
                  <Ionicons name="camera-outline" size={24} color={theme.colors.textSecondary} />
                </AnimatedPressable>
                <TextInput
                  style={styles.input}
                  placeholder="Escreva sua mensagem…"
                  placeholderTextColor={theme.colors.textLight}
                  value={text}
                  onChangeText={handleChangeText}
                  multiline
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

      {/* Sheet do toque longo: Responder / Copiar / Apagar pra todos — sem
          Reagir/Editar/Denunciar (fora de escopo). */}
      <Modal
        visible={!!actionTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setActionTarget(null)}>
          <View style={styles.sheet}>
            {canReply && (
              <AnimatedPressable
                style={styles.sheetOption}
                onPress={() => {
                  if (actionTarget) {
                    setReplyTarget({
                      messageId: actionTarget.id,
                      text: buildReplyQuote(actionTarget),
                      senderId: actionTarget.senderId,
                    });
                  }
                  setActionTarget(null);
                }}
              >
                <Ionicons name="arrow-undo" size={22} color={theme.colors.text} />
                <Text style={styles.sheetOptionText}>Responder</Text>
              </AnimatedPressable>
            )}
            {canCopy && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={async () => {
                    const target = actionTarget;
                    setActionTarget(null);
                    if (!target?.text) return;
                    await Clipboard.setStringAsync(target.text);
                  }}
                >
                  <Ionicons name="copy-outline" size={22} color={theme.colors.text} />
                  <Text style={styles.sheetOptionText}>Copiar mensagem</Text>
                </AnimatedPressable>
              </>
            )}
            {canDeleteForEveryone && (
              <>
                <View style={styles.sheetDivider} />
                <AnimatedPressable
                  style={styles.sheetOption}
                  onPress={() => {
                    const target = actionTarget;
                    setActionTarget(null);
                    if (!target || !user) return;
                    Alert.alert(
                      'Apagar pra todos',
                      'Essa mensagem vira "apagada" pra todos e não pode ser desfeito. Continuar?',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Apagar',
                          style: 'destructive',
                          onPress: () => {
                            const isLastMessage = messages[messages.length - 1]?.id === target.id;
                            deleteListingChatMessageForEveryone(
                              chatId,
                              target.id,
                              user.uid,
                              target.imageUrl,
                              isLastMessage,
                            ).catch((err) =>
                              console.warn('[ListingChatScreen] falha ao apagar mensagem', err),
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
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  headerSubtitle: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },

  // Banner "Anúncio encerrado" — mesmos tokens de blockedBanner
  // (GroupChatScreen.tsx:983-993), mas com borderBottomWidth (fica no topo,
  // abaixo do header) e SEM insets.bottom (não fica no rodapé).
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  closedBannerText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },

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
  bubbleText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 20 },
  bubbleTextMe: { color: theme.colors.white },
  bubbleTextWrap: { position: 'relative' },
  bubbleTextMirrorWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  bubbleTextMirror: { opacity: 0 },
  bubbleReadMore: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 2,
  },
  bubbleReadMoreMe: { color: theme.colors.white, textDecorationLine: 'underline' },
  bubbleTextDeleted: {
    fontSize: theme.fontSize.md,
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  bubbleTextDeletedMe: { color: 'rgba(255,255,255,0.85)' },
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
});
