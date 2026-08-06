import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AdminAlertProvider } from './src/contexts/AdminAlertContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { ReportAlertProvider } from './src/contexts/ReportAlertContext';
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
              {/* S96-C — mesma razão dos dois acima (depende de useAuth via
                  listenMyReports); irmão deles, dentro do AuthProvider, sem
                  depender de nenhum dos outros. */}
              <ReportAlertProvider>
                {/* S94-B — mesma razão dos três acima (depende de useAuth pro
                    uid do admin); irmão deles, dentro do AuthProvider, sem
                    depender de nenhum dos outros três. */}
                <AdminAlertProvider>
                  <StatusBar style="light" />
                  <Navigation />
                </AdminAlertProvider>
              </ReportAlertProvider>
            </SupportAlertProvider>
          </VerificationAlertProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}