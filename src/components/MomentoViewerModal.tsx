// src/components/MomentoViewerModal.tsx
//
// S121 — visualização em tela cheia de UM momento (próprio ou de outra
// pessoa). Os dois <Modal> abaixo (o próprio viewer e o ReportModal) ficam
// como IRMÃOS, nunca um aninhado dentro do outro — mesmo padrão de
// ChatScreen/LikesScreen/MatchProfileScreen (ReportModal sempre sibling da
// tela, não filho de outro Modal).
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ReportModal } from '@/components/ReportModal';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { ReportReason, reportUser } from '@/services/blockService';
import { UserProfile } from '@/services/firestoreService';
import { MomentoWithId } from '@/services/momentoService';
import { getDisplayName } from '@/utils/profile';

// S141 — duração fixa de exibição de cada momento antes do avanço
// automático. Vale igual para texto e foto; nenhum outro número mágico de
// duração deve ser introduzido neste arquivo.
const MOMENTO_VIEW_DURATION_MS = 5000;

interface MomentoViewerModalProps {
  momento: MomentoWithId | null;
  authorProfile: UserProfile | null | undefined;
  visible: boolean;
  onClose: () => void;
  isOwnMomento: boolean;
  // Só relevante quando isOwnMomento — a tela mãe é quem decide confirmar
  // antes (ação destrutiva pede confirmação, ROADMAP.md).
  onDeleteOwn?: () => void;
  // S141 — chamado quando o timer de MOMENTO_VIEW_DURATION_MS termina (ou
  // quando o pause/resume termina). O modal não decide se avança ou fecha:
  // isso é responsabilidade da tela mãe (MomentosScreen).
  onAdvance: () => void;
}

export function MomentoViewerModal({
  momento,
  authorProfile,
  visible,
  onClose,
  isOwnMomento,
  onDeleteOwn,
  onAdvance,
}: MomentoViewerModalProps) {
  const { user } = useAuth();
  const [reportVisible, setReportVisible] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Fração (0 a 1) já percorrida no momento do pause — só serve pra calcular
  // a duração restante no resume, não precisa disparar re-render.
  const pausedFractionRef = useRef(0);
  // S141 — o useEffect de [reportVisible] abaixo dispara também na
  // montagem (reportVisible nasce false). Sem este guard, ele chamaria
  // resumeTimer() redundantemente por cima do timer que o efeito de
  // [momento?.id] já iniciou sozinho — inofensivo (Animated para a
  // animação anterior com finished:false antes de reiniciar), mas
  // desnecessário. O guard limita o efeito a reagir só a transições reais.
  const reportEffectMountedRef = useRef(false);

  useEffect(() => {
    if (!momento) return undefined;
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: MOMENTO_VIEW_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onAdvance();
    });
    return () => {
      progressAnim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momento?.id]);

  const pauseTimer = () => {
    progressAnim.stopAnimation((value) => {
      pausedFractionRef.current = value;
    });
  };

  const resumeTimer = () => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: MOMENTO_VIEW_DURATION_MS * (1 - pausedFractionRef.current),
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onAdvance();
    });
  };

  const handlePressIn = () => {
    pauseTimer();
  };

  const handlePressOut = () => {
    resumeTimer();
  };

  // S141 — o ReportModal é sibling do viewer (não filho), então abrir a
  // denúncia não passa por handlePressIn/handlePressOut (esses só cobrem
  // toque na área de CONTEÚDO). Sem isto, o timer seguia rodando por trás
  // do formulário de denúncia e podia trocar/fechar o `momento` enquanto o
  // usuário ainda estava denunciando (ver ROADMAP.md S141).
  useEffect(() => {
    if (!reportEffectMountedRef.current) {
      reportEffectMountedRef.current = true;
      return;
    }
    if (reportVisible) {
      pauseTimer();
    } else {
      resumeTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportVisible]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const authorName = isOwnMomento ? 'Você' : getDisplayName(authorProfile);

  const handleReport = async (reason: ReportReason, details: string) => {
    if (!user || !momento) return;
    await reportUser(user.uid, momento.authorId, reason, details, undefined, {
      momentoId: momento.authorId,
      momentoText: momento.text?.slice(0, 400),
      ...(momento.photoUrl ? { momentoPhotoUrl: momento.photoUrl } : {}),
    });
    setReportVisible(false);
    Alert.alert('Denúncia enviada', 'Obrigado por nos avisar. Vamos analisar o caso.');
  };

  return (
    <>
      <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
        {/* S141 — SafeAreaProvider aninhado: um <Modal> nativo monta como
            superfície separada, então o SafeAreaProvider de topo (App.tsx)
            não a mede e os insets do SafeAreaView abaixo ficam zerados sem
            este provider próprio. */}
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {!isOwnMomento && authorProfile?.photoURL ? (
                  <Image
                    source={{ uri: authorProfile.photoURL }}
                    style={styles.avatar}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                  />
                ) : null}
                <Text style={styles.authorName} numberOfLines={1}>
                  {authorName}
                </Text>
              </View>
              <View style={styles.headerActions}>
                {isOwnMomento ? (
                  <AnimatedPressable style={styles.headerBtn} onPress={onDeleteOwn}>
                    <Ionicons name="trash-outline" size={22} color={theme.colors.white} />
                  </AnimatedPressable>
                ) : (
                  <AnimatedPressable
                    style={styles.headerBtn}
                    onPress={() => setReportVisible(true)}
                  >
                    <Ionicons name="flag-outline" size={22} color={theme.colors.white} />
                  </AnimatedPressable>
                )}
                <AnimatedPressable style={styles.headerBtn} onPress={onClose}>
                  <Ionicons name="close" size={26} color={theme.colors.white} />
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>

            <Pressable style={styles.content} onPressIn={handlePressIn} onPressOut={handlePressOut}>
              {momento ? (
                momento.type === 'text' ? (
                  <Text style={styles.momentoText}>{momento.text}</Text>
                ) : momento.type === 'photo' && momento.photoUrl ? (
                  <Image
                    source={{ uri: momento.photoUrl }}
                    style={styles.momentoPhoto}
                    contentFit="contain"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                  />
                ) : null
              ) : null}
            </Pressable>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {!isOwnMomento && (
        <ReportModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          onSubmit={handleReport}
          title="Denunciar momento"
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // CLAUDE.md proíbe cor hardcoded — theme.ts não tem um token "preto"
  // dedicado, então o fundo escuro do viewer usa theme.colors.text (cinza
  // bem escuro, #1F2937), o token mais próximo de "quase preto" já
  // existente, em vez de inventar um hex novo.
  container: { flex: 1, backgroundColor: theme.colors.text },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  authorName: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
  headerBtn: { padding: 6 },
  // S141 — mesmo padrão visual do progress bar de upload em ChatScreen.tsx:
  // track semi-transparente, fill sólido com theme.colors.primary. rgba
  // branco (não token do theme.ts, que não tem cor de overlay) segue o
  // mesmo precedente já usado em PhotoCarousel.tsx (dots) e MatchModal.tsx.
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  momentoText: {
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.white,
    textAlign: 'center',
  },
  momentoPhoto: { width: '100%', height: '100%' },
});
