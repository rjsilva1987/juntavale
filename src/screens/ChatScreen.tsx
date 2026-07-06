// src/screens/ChatScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
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
import { listenMessages, sendMessage, Message } from '@/services/firestoreService';

const SKELETON_PATTERN = [false, true, false, false, true];

type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, otherName, otherPhoto } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
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

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;
    setText('');
    try {
      await sendMessage(matchId, user.uid, trimmed);
    } catch (_) {}
  };

  const handleChangeText = (value: string) => {
    setText(value);
    handleTyping();
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.uid;
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
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
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

          {/* Input */}
          <View style={styles.inputRow}>
            <AnimatedPressable style={styles.inputIcon}>
              <Ionicons name="happy-outline" size={24} color={theme.colors.textSecondary} />
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
