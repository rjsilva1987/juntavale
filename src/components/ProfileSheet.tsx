// src/components/ProfileSheet.tsx
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ProfileSections } from '@/components/ProfileSections';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { LOOKING_FOR_LABELS } from '@/constants/lookingFor';
import { theme } from '@/constants/theme';
import { UserProfile } from '@/services/firestoreService';
import { getDisplayAge } from '@/utils/birthDate';

// S72-B2 — arrasto pra fechar: fecha se soltar depois de 1/3 da altura do
// painel OU se o dedo estava se movendo rápido (mesmo sem passar do 1/3).
const CLOSE_VELOCITY_THRESHOLD = 800;

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
  // S73 — repassado direto pro ProfileSections; ver comentário lá.
  onReply?: (promptId: string) => void;
  // S74-B — repassado direto pro ProfileSections, que é quem mostra o valor
  // (no rótulo do botão "Responder"); S110-B tirou a exibição duplicada que
  // havia aqui no header fixo. undefined em MatchProfileScreen (que não usa
  // ProfileSheet).
  replyQuotaRemaining?: number;
  // S126 — repassados direto pro ProfileSections, mesmo padrão de onReply/
  // replyQuotaRemaining acima. undefined em MatchProfileScreen (que não usa
  // ProfileSheet) — a enquete nunca aparece lá.
  poll?: { question: string; options: string[] };
  myPollVote?: number | null;
  onVotePoll?: (optionIndex: number) => void;
}

export function ProfileSheet({
  visible,
  profile,
  myInterests,
  onClose,
  cardWidth,
  sheetHeight,
  onReply,
  replyQuotaRemaining,
  poll,
  myPollVote,
  onVotePoll,
}: ProfileSheetProps) {
  const translateY = useSharedValue(sheetHeight);

  // S72-B2 — este efeito continua sendo quem ABRE (e quem fecha por outras
  // vias: chevron, overlay, back button) — ele só dispara numa transição de
  // `visible`. O Pan abaixo nunca muda `visible`; ele só escreve em
  // translateY.value enquanto o dedo está na tela (onUpdate) e, ao soltar
  // sem cruzar o limiar, ele mesmo volta pro aberto (withSpring, efeito não
  // recorre porque `visible` não mudou). Quando o gesto DECIDE fechar, ele
  // não anima nada sozinho — só chama onClose(), que vira `visible=false`
  // no pai; é o efeito que então roda o withTiming até sheetHeight, partindo
  // de onde o dedo soltou o painel. Os dois nunca escrevem no mesmo instante.
  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : sheetHeight, { duration: 250 });
  }, [visible, sheetHeight, translateY]);

  const closeThreshold = sheetHeight / 3;
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > closeThreshold || e.velocityY > CLOSE_VELOCITY_THRESHOLD) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // S76-B2 — idade derivada de birthDate, ver getDisplayAge.
  const displayAge = getDisplayAge(profile);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.sheet, animatedStyle, { width: cardWidth, height: sheetHeight }]}
    >
      <GestureDetector gesture={panGesture}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>
      </GestureDetector>

      <View style={styles.header}>
        <View style={styles.headerNameGroup}>
          <View style={styles.nameAgeGroup}>
            <Text style={styles.name} numberOfLines={1}>
              {profile?.name}
            </Text>
            {displayAge != null && <Text style={styles.nameAge}>, {displayAge}</Text>}
          </View>
          {profile?.verified && <VerifiedBadge size={18} />}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-down" size={26} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* S108-A — badge de intenção (lookingFor) no header FIXO, não dentro
          do ScrollView: é informação de identidade, tem que continuar
          visível com o conteúdo rolado. Mesmo estilo já copiado em
          MatchProfileScreen.tsx e ProfileScreen.tsx — terceira cópia do
          mesmo objeto, sem extrair componente compartilhado nesta sprint. */}
      {profile?.lookingFor && (
        <View style={styles.lookingForRow}>
          <View style={styles.lookingForBadge}>
            <Text style={styles.lookingForBadgeText}>{LOOKING_FOR_LABELS[profile.lookingFor]}</Text>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <ProfileSections
          profile={profile}
          myInterests={myInterests}
          onReply={onReply}
          replyQuotaRemaining={replyQuotaRemaining}
          poll={poll}
          myPollVote={myPollVote}
          onVotePoll={onVotePoll}
        />
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
    backgroundColor: theme.colors.surface,
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
  // S134 — nome e idade em Text separados: só o nome trunca (numberOfLines
  // no Text do nome), a idade nunca encolhe/corta.
  nameAgeGroup: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  nameAge: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text },
  // S108-A — mesmo objeto de MatchProfileScreen.tsx:451-462 /
  // ProfileScreen.tsx:1530-1541 (primaryLight de fundo, texto primary 700).
  lookingForRow: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  lookingForBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  lookingForBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
});
