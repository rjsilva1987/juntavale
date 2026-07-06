// src/components/MatchModal.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { BounceIn } from 'react-native-reanimated';

import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';

interface MatchModalProps {
  visible: boolean;
  currentUserPhoto?: string;
  matchedUserPhoto?: string;
  matchedUserName: string;
  onSendMessage: () => void;
  onContinue: () => void;
}

export function MatchModal({
  visible,
  currentUserPhoto,
  matchedUserPhoto,
  matchedUserName,
  onSendMessage,
  onContinue,
}: MatchModalProps) {
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Animated.Text entering={BounceIn.duration(800)} style={styles.title}>
            É um Match!
          </Animated.Text>
          <Text style={styles.subtitle}>Você e {matchedUserName} curtiram um ao outro!</Text>

          <View style={styles.avatarsRow}>
            <Avatar uri={currentUserPhoto} />
            <Avatar uri={matchedUserPhoto} />
          </View>

          <TouchableOpacity style={styles.sendBtn} onPress={onSendMessage}>
            <Text style={styles.sendBtnText}>Enviar mensagem</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onContinue}>
            <Text style={styles.continueText}>Continuar</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function Avatar({ uri }: { uri?: string }) {
  return uri ? (
    <Image
      source={{ uri }}
      style={styles.avatar}
      contentFit="cover"
      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
      transition={200}
    />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Ionicons name="person" size={40} color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '90%',
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: theme.borderRadius.full,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  avatarFallback: {
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 48,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.medium,
  },
  sendBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  continueText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing.xs,
  },
});
