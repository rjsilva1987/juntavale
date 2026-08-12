// src/navigation/index.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isAdminUid } from '@/config/admin';
import { theme } from '@/constants/theme';
import { useAdminAlert } from '@/contexts/AdminAlertContext';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAlert } from '@/contexts/ReportAlertContext';
import { useSupportAlert } from '@/contexts/SupportAlertContext';
import { useVerificationAlert } from '@/contexts/VerificationAlertContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useNotifications } from '@/hooks/useNotifications';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { linking } from '@/linking';
import { navigationRef } from '@/navigation/navigationRef';
import { useChatDeepLink } from '@/navigation/useChatDeepLink';
import AdminReportDetailScreen from '@/screens/AdminReportDetailScreen';
import AdminReportsScreen from '@/screens/AdminReportsScreen';
import AdminSupportDetailScreen from '@/screens/AdminSupportDetailScreen';
import AdminSupportScreen from '@/screens/AdminSupportScreen';
import AdminVerificationDetailScreen from '@/screens/AdminVerificationDetailScreen';
import AdminVerificationsScreen from '@/screens/AdminVerificationsScreen';
import BlockedUsersScreen from '@/screens/BlockedUsersScreen';
import ChatScreen from '@/screens/ChatScreen';
import LikesScreen from '@/screens/LikesScreen';
import LoginScreen from '@/screens/LoginScreen';
import MatchesGridScreen from '@/screens/MatchesGridScreen';
import MatchesScreen from '@/screens/MatchesScreen';
import MatchProfileScreen from '@/screens/MatchProfileScreen';
import MyReportsScreen from '@/screens/MyReportsScreen';
import MyTicketsScreen from '@/screens/MyTicketsScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import ReportThreadScreen from '@/screens/ReportThreadScreen';
import SupportScreen from '@/screens/SupportScreen';
import SupportThreadScreen from '@/screens/SupportThreadScreen';
import SwipeScreen from '@/screens/SwipeScreen';
import VerificationScreen from '@/screens/VerificationScreen';

const ONBOARDING_SEEN_KEY = '@juntavale:onboarding_seen';

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main:
    | undefined
    | {
        screen:
          | 'Descobrir'
          | 'Curtidas'
          | 'Conversas'
          | 'Perfil'
          | 'Verificacoes'
          | 'Chamados'
          | 'Denuncias';
      };
  Chat: {
    matchId: string;
    otherUid: string;
    otherName: string;
    otherPhoto?: string;
    draftMessage?: string;
  };
  MatchProfile: {
    uid: string;
    matchId?: string;
    name: string;
    photoURL?: string;
    fromLikes?: boolean;
    alreadyLiked?: boolean;
    // S67-complemento — bilhete completo da super curtida, vindo já em mãos
    // da LikesScreen (aba "Quem curtiu você"). Nunca lido do doc de swipe
    // aqui, só repassado por param — ver comentário em MatchProfileScreen.
    note?: string;
  };
  MatchesGrid: undefined;
  BlockedUsers: undefined;
  Support: undefined;
  MyTickets: undefined;
  SupportThread: { ticketId: string };
  MyReports: undefined;
  ReportThread: { reportId: string };
  Verification: undefined;
  AdminVerificationDetail: { uid: string };
  AdminSupportDetail: { ticketId: string };
  AdminReportDetail: { reportId: string };
  Profile: undefined;
};

export type RootStackProps = NativeStackScreenProps<RootStackParamList>;

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Fonte única de label + ícone por aba. Ionicons segue a convenção
// "<nome>"/"<nome>-outline" para focado/não focado nas 4 abas atuais — dá pra
// assumir o mesmo padrão pra uma 5ª aba futura (ex: "Explorar"), bastando uma
// entrada nova aqui + um <Tab.Screen> correspondente abaixo.
const TAB_META: Record<string, { label: string; icon: string }> = {
  Descobrir: { label: 'Descobrir', icon: 'flame' },
  Curtidas: { label: 'Curtidas', icon: 'heart' },
  Conversas: { label: 'Conversas', icon: 'chatbubble' },
  Perfil: { label: 'Perfil', icon: 'person' },
  // S95 — abas exclusivas do admin. Base sem "-outline": o tabBarIcon abaixo
  // já apêndica "-outline" pro estado não-focado (mesma convenção das 4
  // acima); usar aqui o nome cheio "briefcase-outline"/"chatbox-ellipses-
  // outline" (como aparece nos botões do Painel Admin na ProfileScreen)
  // geraria "briefcase-outline-outline", que não existe no set do Ionicons.
  Verificacoes: { label: 'Verificações', icon: 'briefcase' },
  Chamados: { label: 'Chamados', icon: 'chatbox-ellipses' },
  // S96-B — 4ª aba do admin, denúncias entre usuários (S96-A criou os dados).
  Denuncias: { label: 'Denúncias', icon: 'flag' },
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = isAdminUid(user?.uid);
  const unreadCount = useUnreadCount();
  // S78 — sem contagem (não é "quantas revisões", é "tem uma nova pra ver"),
  // então o badge não usa número: um espaço só deixa a bolinha visível, sem
  // texto dentro dela. Some quando showAlert vira false (markSeen na
  // VerificationScreen), mesmo padrão de "some ao abrir" do badge de
  // Conversas (que some ao ler as mensagens).
  const { showAlert: showVerificationAlert } = useVerificationAlert();
  const { showAlert: showSupportAlert } = useSupportAlert();
  const { showAlert: showReportAlert } = useReportAlert();
  // S94-B — contagem de pendências pras abas do admin. O Provider já devolve
  // 0/0 pra quem não é admin (ver AdminAlertContext), então não precisa
  // repetir o isAdmin aqui pra decidir se lê os valores.
  const { pendingVerifications, pendingTickets, pendingReports } = useAdminAlert();

  // S95 — aba Perfil é idêntica nos dois papéis (mesmo badge de
  // verificação/suporte, nada ligado a unreadCount de Conversas), então o
  // JSX é montado uma vez só e reaproveitado nos dois ramos abaixo.
  const perfilTab = (
    <Tab.Screen
      key="Perfil"
      name="Perfil"
      options={{
        // S84 — a bolinha da aba Perfil e COMPARTILHADA entre verificacao e
        // suporte: ela so diz "tem algo pra ver". Qual das duas coisas e,
        // quem diz e a propria ProfileScreen, onde cada linha tem seu ponto
        // (S84-B). Decisao de Raphael, 30/jul.
        // S96-C — mesmo raciocinio, agora tambem com denuncias (ponto
        // proprio em "Minhas denuncias", ver ProfileScreen).
        tabBarBadge: showVerificationAlert || showSupportAlert || showReportAlert ? ' ' : undefined,
        // theme.colors.error (#E5484D) — nunca usado antes; não é o
        // vermelho padrão do React Navigation, é o nosso token.
        tabBarBadgeStyle: { backgroundColor: theme.colors.error },
      }}
    >
      {() => (
        <ErrorBoundary>
          <ProfileScreen />
        </ErrorBoundary>
      )}
    </Tab.Screen>
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 0.5,
          paddingBottom: 6 + insets.bottom,
          paddingTop: 6,
          height: 62 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: theme.fontSize.xs, fontWeight: '600' },
        tabBarLabel: TAB_META[route.name]?.label ?? route.name,
        tabBarIcon: ({ color, size, focused }) => {
          const icon = TAB_META[route.name]?.icon ?? 'ellipse';
          return (
            <Ionicons name={(focused ? icon : `${icon}-outline`) as any} size={size} color={color} />
          );
        },
      })}
    >
      {isAdmin ? (
        <>
          <Tab.Screen
            name="Verificacoes"
            options={{
              tabBarBadge: pendingVerifications > 0 ? pendingVerifications : undefined,
            }}
          >
            {() => (
              <ErrorBoundary>
                <AdminVerificationsScreen />
              </ErrorBoundary>
            )}
          </Tab.Screen>
          <Tab.Screen
            name="Chamados"
            options={{ tabBarBadge: pendingTickets > 0 ? pendingTickets : undefined }}
          >
            {() => (
              <ErrorBoundary>
                <AdminSupportScreen />
              </ErrorBoundary>
            )}
          </Tab.Screen>
          <Tab.Screen
            name="Denuncias"
            options={{ tabBarBadge: pendingReports > 0 ? pendingReports : undefined }}
          >
            {() => (
              <ErrorBoundary>
                <AdminReportsScreen />
              </ErrorBoundary>
            )}
          </Tab.Screen>
          {perfilTab}
        </>
      ) : (
        <>
          <Tab.Screen name="Descobrir">
            {() => (
              <ErrorBoundary>
                <SwipeScreen />
              </ErrorBoundary>
            )}
          </Tab.Screen>
          <Tab.Screen name="Curtidas">
            {() => (
              <ErrorBoundary>
                <LikesScreen />
              </ErrorBoundary>
            )}
          </Tab.Screen>
          <Tab.Screen
            name="Conversas"
            options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
          >
            {({ navigation }) => (
              <ErrorBoundary>
                <MatchesScreen
                  navigation={
                    navigation as NativeStackScreenProps<RootStackParamList, 'Main'>['navigation']
                  }
                />
              </ErrorBoundary>
            )}
          </Tab.Screen>
          {perfilTab}
        </>
      )}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { user, loading } = useAuth();
  const isAdmin = isAdminUid(user?.uid);
  useNotifications();
  useActivityTracker();
  usePresenceHeartbeat();
  const { onNavigationReady } = useChatDeepLink(user?.uid);

  // Resolvido em paralelo com o Auth (AsyncStorage não depende do Firebase) —
  // null enquanto ainda não sabemos, true/false depois do getItem no mount.
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((value) => {
      setOnboardingSeen(value === 'true');
    });
  }, []);

  const handleOnboardingDone = () => {
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    setOnboardingSeen(true);
  };

  if (loading || onboardingSeen === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Onboarding tem prioridade sobre o gate de auth: um usuário já logado
  // numa reinstalação sem a flag também vê as telas de introdução.
  if (!onboardingSeen) {
    return <OnboardingScreen onDone={handleOnboardingDone} />;
  }

  // Navigator raiz único: os grupos abaixo trocam o CONJUNTO de telas de um
  // mesmo Stack.Navigator, nunca o navigator inteiro. react-native-screens
  // gerencia uma única pilha nativa e o handoff entre grupos acontece nativo
  // — padrão auth-flow da doc do React Navigation.
  //
  // O gate de verificação NÃO bloqueia mais o app inteiro (não existe mais
  // grupo "pending"/isGateOpen na navegação): um usuário logado e não
  // verificado já entra direto no grupo "app" e navega
  // livremente por Descobrir/Curtidas/Perfil. A checagem de `verified` agora
  // é pontual, só onde faz sentido — enviar mensagem (ver MatchesScreen.tsx
  // e ChatScreen.tsx) — e é reforçada no servidor (firestore.rules exige
  // verified==true no create de matches/{matchId}/messages). 'Verification'
  // fica no grupo "app" permanentemente, como ponto de entrada estável a
  // partir do ProfileScreen, em vez de existir só enquanto o usuário está
  // pendente.
  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={onNavigationReady}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{
                // S79-E2 — o "voltar por arrasto" do iOS captura por padrão
                // ~50px da borda esquerda da tela, e as bolhas RECEBIDAS
                // (mensagens do outro lado) ficam encostadas nessa borda —
                // sem reduzir essa distância, arrastar uma bolha recebida
                // pra responder aciona o voltar do iOS em vez do gesto de
                // resposta. A tela já tem botão de voltar visível no
                // header, então reduzir a área do gesto de borda é
                // aceitável.
                gestureResponseDistance: { start: 20 },
              }}
            />
            <Stack.Screen name="MatchProfile" component={MatchProfileScreen} />
            <Stack.Screen name="MatchesGrid" component={MatchesGridScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="MyTickets" component={MyTicketsScreen} />
            <Stack.Screen name="SupportThread" component={SupportThreadScreen} />
            <Stack.Screen name="MyReports" component={MyReportsScreen} />
            <Stack.Screen name="ReportThread" component={ReportThreadScreen} />
            {/* S95 — AdminVerifications/AdminSupport viraram Tab.Screen (ver
                MainTabs); só as telas de DETALHE seguem no Stack, e só pro
                admin — pra quem não é admin elas não têm como ser abertas
                mesmo (nenhum ponto de entrada aponta pra elas). */}
            {isAdmin && (
              <>
                <Stack.Screen
                  name="AdminVerificationDetail"
                  component={AdminVerificationDetailScreen}
                />
                <Stack.Screen name="AdminSupportDetail" component={AdminSupportDetailScreen} />
                <Stack.Screen name="AdminReportDetail" component={AdminReportDetailScreen} />
              </>
            )}
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
