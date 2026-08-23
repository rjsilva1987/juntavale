// src/components/MomentoViewerModal.tsx
//
// S121 — visualização em tela cheia de UM momento (próprio ou de outra
// pessoa). Os dois <Modal> abaixo (o próprio viewer e o ReportModal) ficam
// como IRMÃOS, nunca um aninhado dentro do outro — mesmo padrão de
// ChatScreen/LikesScreen/MatchProfileScreen (ReportModal sempre sibling da
// tela, não filho de outro Modal).
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ReportModal } from '@/components/ReportModal';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { ReportReason, reportUser } from '@/services/blockService';
import { UserProfile } from '@/services/firestoreService';
import { MomentoWithId } from '@/services/momentoService';
import { getDisplayName } from '@/utils/profile';

interface MomentoViewerModalProps {
  momento: MomentoWithId | null;
  authorProfile: UserProfile | null | undefined;
  visible: boolean;
  onClose: () => void;
  isOwnMomento: boolean;
  // Só relevante quando isOwnMomento — a tela mãe é quem decide confirmar
  // antes (ação destrutiva pede confirmação, ROADMAP.md).
  onDeleteOwn?: () => void;
}

export function MomentoViewerModal({
  momento,
  authorProfile,
  visible,
  onClose,
  isOwnMomento,
  onDeleteOwn,
}: MomentoViewerModalProps) {
  const { user } = useAuth();
  const [reportVisible, setReportVisible] = useState(false);

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
                <AnimatedPressable style={styles.headerBtn} onPress={() => setReportVisible(true)}>
                  <Ionicons name="flag-outline" size={22} color={theme.colors.white} />
                </AnimatedPressable>
              )}
              <AnimatedPressable style={styles.headerBtn} onPress={onClose}>
                <Ionicons name="close" size={26} color={theme.colors.white} />
              </AnimatedPressable>
            </View>
          </View>

          <View style={styles.content}>
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
          </View>
        </SafeAreaView>
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
