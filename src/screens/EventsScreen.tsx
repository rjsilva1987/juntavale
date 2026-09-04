// src/screens/EventsScreen.tsx
//
// S125 — lista de eventos: "Meus eventos" (onde o usuário é criador ou
// participante aprovado) e "Descobrir" (eventos ativos, ainda não
// acontecidos, onde o usuário ainda não é participante aprovado). Mirror de
// GroupsScreen.tsx (SafeAreaView edges={['top']}, header com voltar,
// EmptyState).
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
import { Event, listDiscoverableEvents, listMyEvents } from '@/services/eventService';

type EventsScreenProps = NativeStackScreenProps<RootStackParamList, 'Events'>;

// "Meus eventos" primeiro, "Descobrir" depois — mesma seção usada nos dois
// FlatList (uma lista só, com um header por seção, pra não aninhar
// FlatList dentro de ScrollView) — mirror de GroupsScreen.
type Section = { title: string; data: Event[]; emptyLabel: string; showCreateButton?: boolean };

export default function EventsScreen({ navigation }: EventsScreenProps) {
  const { user } = useAuth();
  const [myEvents, setMyEvents] = useState<Event[]>([]);
  const [discoverEvents, setDiscoverEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Mesmo tratamento de try/catch/finally de GroupsScreen: sem isto,
  // qualquer rejeição deixava `loading` travado em true pra sempre.
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [mine, discover] = await Promise.all([
        listMyEvents(user.uid),
        listDiscoverableEvents(user.uid),
      ]);
      setMyEvents(mine);
      setDiscoverEvents(discover);
    } catch (err) {
      console.error('[EventsScreen] falha ao carregar eventos:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Sem listener em tempo real de propósito (mirror de GroupsScreen):
  // recarrega ao focar a tela — cobre voltar de CreateEvent/EventDetail
  // depois de criar/pedir/sair de um evento.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const sections: Section[] = [
    {
      title: 'Meus eventos',
      data: myEvents,
      emptyLabel: 'Você ainda não participa de nenhum evento.',
      showCreateButton: true,
    },
    { title: 'Descobrir', data: discoverEvents, emptyLabel: 'Nenhum evento pra descobrir agora.' },
  ];

  const renderEvent = (item: Event) => (
    <AnimatedPressable
      key={item.id}
      style={styles.card}
      onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name="calendar" size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.status === 'cancelled' ? (
          <Text style={styles.cardSubtitleCancelled} numberOfLines={1}>
            Evento cancelado · {dayjs(item.startsAt.toDate()).format('DD/MM [às] HH:mm')}
          </Text>
        ) : (
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.participantCount} {item.participantCount === 1 ? 'participante' : 'participantes'}{' '}
            · {dayjs(item.startsAt.toDate()).format('DD/MM [às] HH:mm')}
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
          <Text style={styles.headerTitle}>Eventos</Text>
          <AnimatedPressable
            onPress={() => navigation.navigate('CreateEvent')}
            style={styles.backBtn}
            accessibilityLabel="Criar evento"
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
            title="Não foi possível carregar seus eventos."
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
                    icon="calendar-outline"
                    title={section.emptyLabel}
                    style={styles.sectionEmpty}
                    buttonLabel={section.showCreateButton ? 'Criar evento' : undefined}
                    onButtonPress={
                      section.showCreateButton
                        ? () => navigation.navigate('CreateEvent')
                        : undefined
                    }
                  />
                ) : (
                  <View style={{ gap: 10 }}>{section.data.map(renderEvent)}</View>
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
  // S180-A — mesmo tamanho de cardSubtitle, só a cor muda (evento
  // cancelado via deleteAccount do criador).
  cardSubtitleCancelled: { fontSize: theme.fontSize.xs, color: theme.colors.error },
});
