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
import { ADMIN_UID } from '@/config/admin';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
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
import PendingApprovalScreen from '@/screens/PendingApprovalScreen';
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
  PendingApproval: undefined;
  Profile: undefined;
};

export type RootStackProps = NativeStackScreenProps<RootStackParamList>;

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

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
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, string> = {
            Descobrir: focused ? 'flame' : 'flame-outline',
            Curtidas: focused ? 'heart' : 'heart-outline',
            Conversas: focused ? 'chatbubble' : 'chatbubble-outline',
            Perfil: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
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
      <Tab.Screen name="Conversas">
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
  const { user, profile, loading } = useAuth();
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

  // O admin nunca pode cair no grupo pending: o doc dele também tem `verified`
  // ausente (nunca passou por revisão), e é ele quem aprova todo mundo — sem
  // essa exceção, o gate travaria o próprio admin fora do painel de aprovação.
  const isGateOpen = user != null && (profile?.verified === true || user.uid === ADMIN_UID);

  // Navigator raiz único: os grupos abaixo trocam o CONJUNTO de telas de um
  // mesmo Stack.Navigator, nunca o navigator inteiro. react-native-screens
  // gerencia uma única pilha nativa e o handoff entre grupos acontece nativo
  // — padrão auth-flow da doc do React Navigation. 'Verification' existe só
  // no grupo pending (de propósito: se aparecesse também no grupo app, a rota
  // focada sobreviveria à troca de grupo e o RN preservaria o foco nela em
  // vez de resetar pro initialRoute do grupo app — ver ProfileScreen.tsx pro
  // caso de usuário já verificado, que não navega mais pra cá).
  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={onNavigationReady}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        ) : !isGateOpen ? (
          <Stack.Group>
            <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="MatchProfile" component={MatchProfileScreen} />
            <Stack.Screen name="MatchesGrid" component={MatchesGridScreen} />
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
