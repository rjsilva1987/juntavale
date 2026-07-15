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
import { getIcebreakers, IcebreakerProfile } from '@/utils/icebreakers';

interface MatchModalProps {
  visible: boolean;
  currentUserPhoto?: string;
  matchedUserPhoto?: string;
  matchedUserName: string;
  myProfile?: IcebreakerProfile | null;
  theirProfile?: IcebreakerProfile | null;
  onSendMessage: () => void;
  onUseIcebreaker?: (message: string) => void;
  onContinue: () => void;
}

export function MatchModal({
  visible,
  currentUserPhoto,
  matchedUserPhoto,
  matchedUserName,
  myProfile,
  theirProfile,
  onSendMessage,
  onUseIcebreaker,
  onContinue,
}: MatchModalProps) {
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible]);

  const icebreaker = getIcebreakers(myProfile, theirProfile)[0];

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

          {icebreaker && onUseIcebreaker && (
            <View style={styles.icebreakerCard}>
              <View style={styles.icebreakerHeader}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={theme.colors.primary}
                />
                <Text style={styles.icebreakerLabel}>Sugestão de mensagem</Text>
              </View>
              <Text style={styles.icebreakerText} numberOfLines={3}>
                {icebreaker}
              </Text>
              <TouchableOpacity
                style={styles.useIcebreakerBtn}
                onPress={() => onUseIcebreaker(icebreaker)}
              >
                <Text style={styles.useIcebreakerBtnText}>Usar como mensagem</Text>
              </TouchableOpacity>
            </View>
          )}

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
  icebreakerCard: {
    width: '100%',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  icebreakerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  icebreakerLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
  },
  icebreakerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  useIcebreakerBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  useIcebreakerBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.onSecondary,
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
