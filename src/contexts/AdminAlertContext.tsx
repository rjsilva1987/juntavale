// src/contexts/AdminAlertContext.tsx
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { isAdminUid } from '@/config/admin';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { Report } from '@/services/reportService';
import { SupportTicket } from '@/services/supportService';

interface AdminAlertContextType {
  pendingVerifications: number;
  pendingTickets: number;
  pendingReports: number;
  pendingListings: number;
}

const AdminAlertContext = createContext<AdminAlertContextType>({
  pendingVerifications: 0,
  pendingTickets: 0,
  pendingReports: 0,
  pendingListings: 0,
});

export const useAdminAlert = () => useContext(AdminAlertContext);

// S94-B (+ S96-B: reports; S169: listings) — contador de pendencias pras
// abas Verificacoes/Chamados/Denuncias/Classificados do admin. GUARDA
// OBRIGATORIA:
// firestore.rules só libera list()/onSnapshot em verifications, support e
// reports pra quem bate com isAdmin() (uid in ADMIN_UIDS) — mesma checagem de
// getPendingVerifications em verificationService.ts. Montar estes listeners
// pra um usuário comum dispararia permission-denied em série a cada
// snapshot, então sem usuário logado OU com !isAdminUid(user?.uid) nenhum
// onSnapshot é montado: o Provider devolve 0/0/0 direto.
export const AdminAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isAdmin = isAdminUid(user?.uid);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [pendingTickets, setPendingTickets] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  const [pendingListings, setPendingListings] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      setPendingVerifications(0);
      return;
    }
    // Sem orderBy de propósito: where sozinho usa o índice single-field
    // automático, evitando exigir um índice composto novo.
    const q = query(collection(db, 'verifications'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      setPendingVerifications(snap.size);
    });
    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingTickets(0);
      return;
    }
    // Mesma razão do listener acima: sem orderBy, só where.
    const q = query(collection(db, 'support'), where('status', '==', 'open'));
    const unsub = onSnapshot(q, (snap) => {
      // lastSenderId só passou a ser gravado em 04/08 (S94-A, exclusivo do
      // Admin SDK — ver functions/src/index.ts). Chamado aberto ANTES dessa
      // data não tem o campo, e não pode ficar invisível aqui só por isso —
      // por isso doc SEM lastSenderId também conta como pendente. Só um
      // ticket cuja ÚLTIMA mensagem foi de QUALQUER admin (isAdminUid(lastSenderId))
      // fica de fora da contagem.
      const pending = snap.docs.filter((d) => {
        const { lastSenderId } = d.data() as SupportTicket;
        return !isAdminUid(lastSenderId);
      });
      setPendingTickets(pending.length);
    });
    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingReports(0);
      return;
    }
    // SEM where de status: ao contrário de verifications/support, `reports`
    // tem doc legado sem o campo `status` (client antigo do reportUser, S96-A)
    // — um where('status','==','open') simplesmente ignora doc sem o campo,
    // deixando denúncia legada de fora da contagem. Mesmo raciocínio de
    // listenReports (reportService.ts): sem where nenhum, filtra tudo
    // client-side. Volume baixo (painel admin), mesmo trade-off já aceito lá.
    const unsub = onSnapshot(
      collection(db, 'reports'),
      (snap) => {
        const pending = snap.docs.filter((d) => {
          const { status, lastSenderId } = d.data() as Report;
          const isPending = status === undefined || status === 'open';
          return isPending && !isAdminUid(lastSenderId);
        });
        setPendingReports(pending.length);
      },
      // S168-B2 — sem isso, uma falha do listener (índice faltando, regra
      // negando) passava batido: o badge só congelava no último número
      // visto, sem nenhum sinal em log — mesmo raciocínio do listener de
      // listings logo abaixo.
      (err) => console.error('[AdminAlertContext] reports listener:', err),
    );
    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingListings(0);
      return;
    }
    // S169 — badge da aba Classificados (fila de moderação, S168-A). Mesmo
    // molde de verifications: só where, sem orderBy (índice single-field
    // automático). firestore.rules libera list em `listings` pra isAdmin()
    // sem condição sobre o doc, então o admin enxerga todo pending.
    const q = query(collection(db, 'listings'), where('status', '==', 'pending'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingListings(snap.size);
      },
      (error) => {
        // Erro não é engolido: fica logado e o badge zera em vez de
        // congelar num número velho.
        console.warn('[AdminAlertContext] listener de listings falhou:', error);
        setPendingListings(0);
      },
    );
    return unsub;
  }, [isAdmin]);

  return (
    <AdminAlertContext.Provider
      value={{ pendingVerifications, pendingTickets, pendingReports, pendingListings }}
    >
      {children}
    </AdminAlertContext.Provider>
  );
};
