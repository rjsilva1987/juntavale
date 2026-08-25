// src/components/MomentoLikersModal.tsx
//
// S143-B — lista NOMINAL COMPLETA de quem curtiu um momento (decisão 6:
// nunca resumo tipo "e mais N", NUNCA legalName — getDisplayName só usa
// nickname/name legado). Só é aberta quando authorId === uid do usuário
// logado (ver MomentoViewerModal.tsx); as rules negam a leitura da
// subcoleção momentos/{authorUid}/likes pra qualquer outro uid, então abrir
// isto como não-autor sempre falharia. Modal sibling do viewer, mesmo
// padrão de ReportModal.tsx (nunca aninhado dentro de outro <Modal>).
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { VALE_LABELS } from '@/constants/vale';
import { getMomentoLikers, MomentoLiker } from '@/services/momentoService';
import { getDisplayName } from '@/utils/profile';

interface MomentoLikersModalProps {
  visible: boolean;
  authorUid: string | null;
  onClose: () => void;
}

export function MomentoLikersModal({ visible, authorUid, onClose }: MomentoLikersModalProps) {
  const [likers, setLikers] = useState<MomentoLiker[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !authorUid) return;
    let cancelled = false;
    setLoading(true);
    getMomentoLikers(authorUid)
      .then((data) => {
        if (!cancelled) setLikers(data);
      })
      .catch(() => {
        if (!cancelled) setLikers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, authorUid]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Curtidas</Text>

          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.loading} />
          ) : likers.length === 0 ? (
            <Text style={styles.emptyText}>Ninguém curtiu este momento ainda.</Text>
          ) : (
            <FlatList
              data={likers}
              keyExtractor={(item) => item.uid}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  {item.profile?.photoURL ? (
                    <Image
                      source={{ uri: item.profile.photoURL }}
                      style={styles.avatar}
                      contentFit="cover"
                      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={{ fontSize: 18 }}>😊</Text>
                    </View>
                  )}
                  <View style={styles.rowInfo}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.profile === null ? 'Conta excluída' : getDisplayName(item.profile)}
                    </Text>
                    {item.profile?.vale && (
                      <Text style={styles.vale}>{VALE_LABELS[item.profile.vale]}</Text>
                    )}
                  </View>
                </View>
              )}
            />
          )}

          <AnimatedPressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Fechar</Text>
          </AnimatedPressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  loading: { marginVertical: theme.spacing.lg },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginVertical: theme.spacing.lg,
  },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  name: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
  vale: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  closeBtn: { alignItems: 'center', paddingVertical: 16 },
  closeBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
