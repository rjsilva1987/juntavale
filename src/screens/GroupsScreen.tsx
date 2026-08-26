// src/screens/GroupsScreen.tsx
//
// S124-A — lista de grupos: "Meus grupos" (onde o usuário é membro) e
// "Descobrir" (grupos abertos onde ainda não é membro nem tem pedido
// pendente). Mesmo molde de tela-de-lista de BlockedUsersScreen.tsx
// (SafeAreaView edges={['top']}, header com voltar, EmptyState).
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { Group, listDiscoverableGroups, listMyGroups } from '@/services/groupService';
import { hasValidLastMessage } from '@/utils/matches';

type GroupsScreenProps = NativeStackScreenProps<RootStackParamList, 'Groups'>;

// "Meus grupos" primeiro, "Descobrir" depois — mesma seção usada nos dois
// FlatList (uma lista só, com um header por seção, pra não aninhar
// FlatList dentro de ScrollView).
type Section = { title: string; data: Group[]; emptyLabel: string; showCreateButton?: boolean };

export default function GroupsScreen({ navigation }: GroupsScreenProps) {
  const { user } = useAuth();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // S124-A-fix (correção pós-auditoria) — try/catch/finally: sem isto,
  // qualquer rejeição (rede, permission-denied, etc.) deixava `loading`
  // travado em true pra sempre, sem log e sem aviso — o `finally` garante
  // que a tela sempre sai do spinner, e `loadError` troca a lista por um
  // estado "tentar de novo" visível em vez de engolir o erro em silêncio.
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [mine, discover] = await Promise.all([
        listMyGroups(user.uid),
        listDiscoverableGroups(user.uid),
      ]);
      setMyGroups(mine);
      setDiscoverGroups(discover);
    } catch (err) {
      console.error('[GroupsScreen] falha ao carregar grupos:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Sem listener em tempo real de propósito (esqueleto): recarrega ao focar
  // a tela — cobre voltar de CreateGroup/GroupDetail depois de criar/pedir/
  // sair de um grupo.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const sections: Section[] = [
    {
      title: 'Meus grupos',
      data: myGroups,
      emptyLabel: 'Você ainda não participa de nenhum grupo.',
      // Botão "Criar grupo" na seção vazia — reforça o atalho do ícone "+"
      // do cabeçalho pra quem ainda não tem nenhum grupo.
      showCreateButton: true,
    },
    { title: 'Descobrir', data: discoverGroups, emptyLabel: 'Nenhum grupo pra descobrir agora.' },
  ];

  const renderGroup = (item: Group) => (
    <AnimatedPressable
      key={item.id}
      style={styles.card}
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name="people" size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {item.memberCount} {item.memberCount === 1 ? 'membro' : 'membros'} ·{' '}
          {item.expiresAt
            ? `encerra em ${dayjs(item.expiresAt.toDate()).format('DD/MM')}`
            : 'sem prazo'}
        </Text>
        {hasValidLastMessage(item) && (
          <Text style={styles.cardPreview} numberOfLines={1}>
            {item.lastMessage.senderId === user?.uid ? 'Você: ' : ''}
            {item.lastMessage.text}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
    </AnimatedPressable>
  );

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Grupos</Text>
          <AnimatedPressable
            onPress={() => navigation.navigate('CreateGroup')}
            style={styles.backBtn}
            accessibilityLabel="Criar grupo"
          >
            <Ionicons name="add" size={26} color={theme.colors.primary} />
          </AnimatedPressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : loadError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Não foi possível carregar seus grupos."
            buttonLabel="Tentar de novo"
            onButtonPress={load}
          />
        ) : (
          <FlatList
            data={sections}
            keyExtractor={(section) => section.title}
            contentContainerStyle={styles.content}
            renderItem={({ item: section }) => (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.data.length === 0 ? (
                  <EmptyState
                    icon="people-outline"
                    title={section.emptyLabel}
                    style={styles.sectionEmpty}
                    buttonLabel={section.showCreateButton ? 'Criar grupo' : undefined}
                    onButtonPress={
                      section.showCreateButton
                        ? () => navigation.navigate('CreateGroup')
                        : undefined
                    }
                  />
                ) : (
                  <View style={{ gap: 10 }}>{section.data.map(renderGroup)}</View>
                )}
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  content: { padding: theme.spacing.md, gap: theme.spacing.lg },
  section: { gap: 10 },
  sectionTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  sectionEmpty: { flex: 0, paddingVertical: theme.spacing.lg },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 12,
    ...theme.shadows.medium,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
  cardSubtitle: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  // S149-B — prévia da última mensagem, mesmo padrão de cardSubtitle.
  cardPreview: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
