// src/screens/ChatScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  TextInput,
  SafeAreaView,
  Modal,
  Alert,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { RootStackParamList } from '@/navigation';
import { listenMessages, sendMessage, uploadChatImage, Message } from '@/services/firestoreService';
import { notifyNewMessage } from '@/services/sendPushNotification';

const SKELETON_PATTERN = [false, true, false, false, true];

type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, otherUid, otherName, otherPhoto } = route.params;
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const flatListRef = React.useRef<FlatList>(null);
  const { isOtherTyping, handleTyping } = useTypingIndicator(matchId, user?.uid ?? '');

  useEffect(() => {
    const unsub = listenMessages(matchId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [matchId]);

  const notifyRecipient = (preview: string) => {
    if (!user || !otherUid) return;
    notifyNewMessage({
      toUid: otherUid,
      matchId,
      senderUid: user.uid,
      senderName: profile?.name ?? 'Alguém',
      senderPhoto: profile?.photoURL,
      preview,
    }).catch(() => {});
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;
    setText('');
    try {
      await sendMessage(matchId, user.uid, trimmed);
      notifyRecipient(trimmed);
    } catch (_) {}
  };

  const handleChangeText = (value: string) => {
    setText(value);
    handleTyping();
  };

  const handleSendImage = async (uri: string) => {
    if (!user) return;
    setUploadProgress(0);
    try {
      const imageUrl = await uploadChatImage(matchId, uri, setUploadProgress);
      await sendMessage(matchId, user.uid, '', imageUrl);
      notifyRecipient('📷 Foto');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a imagem.');
    } finally {
      setUploadProgress(null);
    }
  };

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    handleSendImage(result.assets[0].uri);
  };

  const handleShareLocation = async () => {
    setAttachSheetVisible(false);
    if (!user) return;
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
      notifyRecipient('📍 Localização');
    } catch {
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    }
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

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.uid;
    const imageUrl = item.imageUrl;
    const location = item.location;
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
        <View
          style={[
            imageUrl ? styles.bubbleImageWrap : styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
          ]}
        >
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
          ) : location ? (
            <Pressable style={styles.locationCard} onPress={() => handleOpenLocation(location)}>
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
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
          )}
          <Text
            style={[
              styles.bubbleTime,
              isMe && styles.bubbleTimeMe,
              imageUrl && styles.bubbleTimeImage,
            ]}
          >
            {item.createdAt ? dayjs(item.createdAt.toDate()).format('HH:mm') : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <View style={styles.headerInfo}>
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
              <Text style={styles.headerStatus}>
                {isOtherTyping ? 'digitando...' : 'Online agora'}
              </Text>
            </View>
          </View>
          <AnimatedPressable>
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
              data={messages}
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
          <View style={styles.inputRow}>
            <AnimatedPressable style={styles.inputIcon} onPress={() => setAttachSheetVisible(true)}>
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
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Attachment action sheet */}
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

  bubble: {
    maxWidth: '75%',
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
  bubbleTime: { fontSize: theme.fontSize.xs, color: theme.colors.textLight, alignSelf: 'flex-end' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },
  bubbleTimeImage: { position: 'absolute', bottom: 6, right: 10, color: theme.colors.white },

  bubbleImageWrap: {
    maxWidth: '75%',
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
