// src/components/ProfileSheet.tsx
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ProfileSections } from '@/components/ProfileSections';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { theme } from '@/constants/theme';
import { UserProfile } from '@/services/firestoreService';

export interface ProfileSheetProps {
  visible: boolean;
  profile: UserProfile | null;
  myInterests?: string[];
  onClose: () => void;
  // S72-B1 — largura/altura vêm do SwipeScreen (derivadas de CARD_W, que só
  // existe lá) em vez de duplicar CARD_W ou os multiplicadores 1.35/0.85
  // aqui — ver relatório da sprint pra justificativa completa.
  cardWidth: number;
  sheetHeight: number;
}

export function ProfileSheet({
  visible,
  profile,
  myInterests,
  onClose,
  cardWidth,
  sheetHeight,
}: ProfileSheetProps) {
  const translateY = useSharedValue(sheetHeight);

  // S72-B1 — sem gesto nenhum: a única entrada de movimento é a prop
  // `visible`. O arrasto (S72-B2) substitui isso por um Pan próprio.
  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : sheetHeight, { duration: 250 });
  }, [visible, sheetHeight, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.sheet, animatedStyle, { width: cardWidth, height: sheetHeight }]}
    >
      <View style={styles.handleRow} pointerEvents="none">
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerNameGroup}>
          <Text style={styles.name} numberOfLines={1}>
            {profile?.name}
            {profile?.age ? `, ${profile.age}` : ''}
          </Text>
          {profile?.verified && <VerifiedBadge size={18} />}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-down" size={26} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ProfileSections profile={profile} myInterests={myInterests} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // S72-B1 — zIndex/elevation ficaram só no sheetWrapper (SwipeScreen.tsx),
  // que já clipa e reordena o painel + o Pressable de fechar; duplicar aqui
  // seria redundante.
  sheet: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  headerNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  name: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
});
