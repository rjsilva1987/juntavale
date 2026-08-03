import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { SupportAlertProvider } from './src/contexts/SupportAlertContext';
import { VerificationAlertProvider } from './src/contexts/VerificationAlertContext';
import Navigation from './src/navigation';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          {/* S78-correção — depende de useAuth (uid do usuário logado pro
              onSnapshot de verifications/{uid}), então fica DENTRO do
              AuthProvider, nunca antes dele. */}
          <VerificationAlertProvider>
            {/* S84 — mesma razão do VerificationAlertProvider acima (depende
                de useAuth via subscribeMyTickets): irmão dele, dentro do
                AuthProvider, sem depender um do outro. */}
            <SupportAlertProvider>
              <StatusBar style="light" />
              <Navigation />
            </SupportAlertProvider>
          </VerificationAlertProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}