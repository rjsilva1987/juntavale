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
import { linking } from '@/linking';
import { navigationRef } from '@/navigation/navigationRef';
import { useChatDeepLink } from '@/navigation/useChatDeepLink';
import AdminVerificationDetailScreen from '@/screens/AdminVerificationDetailScreen';
import AdminVerificationsScreen from '@/screens/AdminVerificationsScreen';
import BlockedUsersScreen from '@/screens/BlockedUsersScreen';
import ChatScreen from '@/screens/ChatScreen';
import LikesScreen from '@/screens/LikesScreen';
import LoginScreen from '@/screens/LoginScreen';
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
  MatchProfile: { uid: string; matchId: string; name: string; photoURL?: string };
  BlockedUsers: undefined;
  Verification: undefined;
  AdminVerifications: undefined;
  AdminVerificationDetail: { uid: string };
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

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="MatchProfile" component={MatchProfileScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <Stack.Screen name="Verification" component={VerificationScreen} />
      <Stack.Screen name="AdminVerifications" component={AdminVerificationsScreen} />
      <Stack.Screen name="AdminVerificationDetail" component={AdminVerificationDetailScreen} />
    </Stack.Navigator>
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

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={onNavigationReady}>
      {user ? <AppStack /> : <AuthStack />}
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
