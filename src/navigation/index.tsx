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
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { linking } from '@/linking';
import { navigationRef } from '@/navigation/navigationRef';
import { useChatDeepLink } from '@/navigation/useChatDeepLink';
import AdminVerificationDetailScreen from '@/screens/AdminVerificationDetailScreen';
import AdminVerificationsScreen from '@/screens/AdminVerificationsScreen';
import BlockedUsersScreen from '@/screens/BlockedUsersScreen';
import ChatScreen from '@/screens/ChatScreen';
import LikesScreen from '@/screens/LikesScreen';
import LoginScreen from '@/screens/LoginScreen';
import MatchesGridScreen from '@/screens/MatchesGridScreen';
import MatchesScreen from '@/screens/MatchesScreen';
import MatchProfileScreen from '@/screens/MatchProfileScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import SwipeScreen from '@/screens/SwipeScreen';
import VerificationScreen from '@/screens/VerificationScreen';

const ONBOARDING_SEEN_KEY = '@juntavale:onboarding_seen';

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: undefined | { screen: 'Descobrir' | 'Curtidas' | 'Conversas' | 'Perfil' };
  Chat: { matchId: string; otherUid: string; otherName: string; otherPhoto?: string };
  MatchProfile: {
    uid: string;
    matchId?: string;
    name: string;
    photoURL?: string;
    fromLikes?: boolean;
  };
  MatchesGrid: undefined;
  BlockedUsers: undefined;
  Verification: undefined;
  AdminVerifications: undefined;
  AdminVerificationDetail: { uid: string };
  Profile: undefined;
  // Não registrada em nenhum Stack.Group abaixo (gate deixou de bloquear o
  // app inteiro — ver Navigation() mais abaixo). Mantida só pra
  // PendingApprovalScreen.tsx (arquivo preservado, não deletado) continuar
  // type-checando como componente órfão; remover os dois juntos se um dia a
  // tela for apagada de vez.
  PendingApproval: undefined;
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
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  const unreadCount = useUnreadCount();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: {
          backgroundColor: theme.colors.white,
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
      <Tab.Screen name="Perfil">
        {() => (
          <ErrorBoundary>
            <ProfileScreen />
          </ErrorBoundary>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { user, loading } = useAuth();
  useNotifications();
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
  // grupo "pending"/isGateOpen nem PendingApprovalScreen na navegação): um
  // usuário logado e não verificado já entra direto no grupo "app" e navega
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
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="MatchProfile" component={MatchProfileScreen} />
            <Stack.Screen name="MatchesGrid" component={MatchesGridScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
            <Stack.Screen name="AdminVerifications" component={AdminVerificationsScreen} />
            <Stack.Screen name="AdminVerificationDetail" component={AdminVerificationDetailScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
