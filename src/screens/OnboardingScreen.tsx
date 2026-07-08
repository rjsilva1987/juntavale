// src/screens/OnboardingScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

interface OnboardingScreenProps {
  onDone: () => void;
}

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'flame',
    title: 'Descubra pessoas',
    description: 'Deslize pelos perfis de quem está por perto e compartilha seus interesses.',
  },
  {
    icon: 'heart',
    title: 'Dê match',
    description: 'Curtiu alguém que também curtiu você? É um match — a conversa pode começar.',
  },
  {
    icon: 'chatbubbles',
    title: 'Converse',
    description: 'Puxe assunto, combine um encontro e deixe a conexão acontecer.',
  },
];

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    pagerRef.current?.setPage(page + 1);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={styles.slide}>
            <View style={styles.iconWrap}>
              <Ionicons name={slide.icon} size={72} color={theme.colors.secondary} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>
        ))}
      </PagerView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <View key={slide.title} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>

        <AnimatedPressable style={styles.actionBtn} onPress={handleNext}>
          <Text style={styles.actionBtnText}>{isLast ? 'Começar' : 'Próximo'}</Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  pager: { flex: 1 },
  slide: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  iconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: theme.colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: theme.spacing.md,
  },

  footer: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotActive: {
    backgroundColor: theme.colors.secondary,
    width: 22,
  },

  actionBtn: {
    width: '100%',
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.onSecondary },
});
