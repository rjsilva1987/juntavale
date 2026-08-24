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
// SEM reações, replyTo, read-receipts, edição ou exclusão de mensagem.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { GroupFounderTag } from '@/components/GroupFounderTag';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { getUserProfile, UserProfile } from '@/services/firestoreService';
import {
  getGroup,
  getMyMembership,
  GroupMessage,
  listenGroupMessages,
  sendGroupMessage,
  uploadGroupChatImage,
} from '@/services/groupService';
import { getDisplayName } from '@/utils/profile';

type GroupChatScreenProps = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

const MAX_MESSAGE_LENGTH = 2000;

export default function GroupChatScreen({ route, navigation }: GroupChatScreenProps) {
  const { groupId, groupName } = route.params;
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, UserProfile | null>>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
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

  useEffect(() => {
    const unsubscribe = listenGroupMessages(groupId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return unsubscribe;
  }, [groupId]);

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
    setText('');
    try {
      await sendGroupMessage(groupId, user.uid, value);
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      console.error('[GroupChatScreen] falha ao enviar mensagem:', err);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    }
  }, [groupId, text, user]);

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

  const renderMessage = ({ item }: { item: GroupMessage }) => {
    const isMe = item.senderId === user?.uid;
    const senderProfile = senderProfiles[item.senderId];
    const senderName = senderProfile === undefined ? '' : getDisplayName(senderProfile);
    const imageUrl = item.imageUrl;
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {!isMe && !!senderName && (
            <View style={styles.senderNameRow}>
              <Text style={styles.senderName}>{senderName}</Text>
              {!!creatorId && item.senderId === creatorId && <GroupFounderTag />}
            </View>
          )}
          {imageUrl ? (
            <Pressable onPress={() => setViewerImage(imageUrl)}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.bubbleImage}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                transition={200}
              />
            </Pressable>
          ) : (
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
          )}
          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
            {item.createdAt ? dayjs(item.createdAt.toDate()).format('HH:mm') : ''}
          </Text>
        </View>
      </View>
    );
  };

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
            <View style={styles.blockedBanner}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.blockedBannerText}>Você não é mais membro deste grupo</Text>
            </View>
          ) : isUnverified ? (
            <Pressable
              style={styles.blockedBanner}
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
            <View style={styles.inputRow}>
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
  bubbleImage: { width: 200, height: 200, borderRadius: theme.borderRadius.md },
  bubbleTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    alignSelf: 'flex-end',
  },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },

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
