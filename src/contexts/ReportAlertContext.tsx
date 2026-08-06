// src/contexts/ReportAlertContext.tsx
//
// S96-C — aviso in-app de resposta do admin na denúncia, mesmo papel do
// SupportAlertContext (S84) para reports. reports/{reportId} tem
// lastSenderId (S96-A), que support/{ticketId} não tinha na época do S84:
// filtrando por lastSenderId !== user.uid antes de tirar o maior
// lastMessageAt, o aviso só entra na conta quando quem respondeu por ÚLTIMO
// foi o admin — o próprio usuário escrevendo nunca acende o próprio aviso,
// sem precisar do contorno de markSeen() no handleSend (ver
// MyReportsScreen/ReportThreadScreen: useEffect reativo em showAlert, igual
// ao padrão do SupportAlertContext).
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listenMyReports } from '@/services/reportService';

const REPORT_SEEN_AT_KEY = '@juntavale:report_seen_at';

interface ReportAlertContextType {
  showAlert: boolean;
  markSeen: () => Promise<void>;
}

const ReportAlertContext = createContext<ReportAlertContextType>({
  showAlert: false,
  markSeen: async () => {},
});

export const useReportAlert = () => useContext(ReportAlertContext);

export const ReportAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [lastMessageAtMillis, setLastMessageAtMillis] = useState<number | null>(null);
  const [seenAtMillis, setSeenAtMillis] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setLastMessageAtMillis(null);
      return;
    }
    const unsub = listenMyReports(user.uid, (reports) => {
      // Só entram denúncias cuja última mensagem NÃO foi do próprio
      // usuário — na prática, do admin (denunciante e admin são os únicos
      // que escrevem na thread). Denúncia sem lastSenderId (nunca
      // respondida) também cai fora, mesmo raciocínio do filtro de
      // lastMessageAt ausente em SupportAlertContext.
      const millis = reports
        .filter((r) => r.lastSenderId != null && r.lastSenderId !== user.uid)
        .map((r) => r.lastMessageAt?.toMillis())
        .filter((m): m is number => m != null);
      setLastMessageAtMillis(millis.length > 0 ? Math.max(...millis) : null);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    AsyncStorage.getItem(REPORT_SEEN_AT_KEY).then((value) => {
      setSeenAtMillis(value ? Number(value) : null);
    });
  }, []);

  const markSeen = useCallback(async () => {
    if (lastMessageAtMillis == null) return;
    await AsyncStorage.setItem(REPORT_SEEN_AT_KEY, String(lastMessageAtMillis));
    setSeenAtMillis(lastMessageAtMillis);
  }, [lastMessageAtMillis]);

  const showAlert =
    lastMessageAtMillis != null && (seenAtMillis == null || lastMessageAtMillis > seenAtMillis);

  return (
    <ReportAlertContext.Provider value={{ showAlert, markSeen }}>
      {children}
    </ReportAlertContext.Provider>
  );
};
