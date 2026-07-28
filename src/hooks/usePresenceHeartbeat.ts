// src/hooks/usePresenceHeartbeat.ts
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';

// Intervalo da batida em primeiro plano.
export const PRESENCE_HEARTBEAT_MS = 2 * 60 * 1000;
// S79-C2-B consome isto pra decidir "online agora" (carimbo com menos que
// isso de idade) — mora aqui, junto de quem escreve o carimbo, pra escrita
// e leitura nunca divergirem sobre o que "recente" quer dizer.
export const PRESENCE_ONLINE_MS = 5 * 60 * 1000;

// S79-C2-A — heartbeat de presença (presence/{uid}.lastSeenAt), diferente
// de useActivityTracker (users/{uid}.lastActiveAt, throttle de 1h): aquele
// serve o cron de reengajamento, que só precisa saber "ativo neste mês" —
// não muda aqui. Este bate a cada PRESENCE_HEARTBEAT_MS só enquanto o app
// está em primeiro plano, pra alimentar o "visto há pouco" do chat (C2-B).
// Propósitos diferentes, os dois hooks continuam rodando lado a lado.
export function usePresenceHeartbeat() {
  const { user } = useAuth();
  // setTimeout recursivo em vez de setInterval: setInterval/clearInterval
  // não estão na allowlist de globals do eslint.config.js deste projeto
  // (só setTimeout/clearTimeout estão, mesmo padrão já usado em
  // useTypingIndicator.ts) — trocar de API evita alterar a config só por
  // causa deste hook.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const uid = user.uid;

    // setDoc (não updateDoc): presence/{uid} pode ainda não existir na
    // primeira batida de uma conta nova — updateDoc falharia nesse caso.
    // Fire-and-forget: falha aqui é só um lastSeenAt desatualizado, nunca
    // pode afetar a UX — catch silencioso (log leve), mesmo padrão de
    // useActivityTracker.
    const beat = () => {
      setDoc(doc(db, 'presence', uid), { lastSeenAt: serverTimestamp() }).catch((err) => {
        console.warn('[usePresenceHeartbeat] falha ao gravar lastSeenAt', err);
      });
    };

    const clearHeartbeat = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleNext = () => {
      timeoutRef.current = setTimeout(() => {
        beat();
        scheduleNext();
      }, PRESENCE_HEARTBEAT_MS);
    };

    const startHeartbeat = () => {
      clearHeartbeat();
      beat();
      scheduleNext();
    };

    startHeartbeat();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        startHeartbeat();
      } else {
        // Sai de primeiro plano: só limpa o intervalo, não grava nada — o
        // carimbo envelhece sozinho, que é como o "visto há" funciona (ver
        // PRESENCE_ONLINE_MS acima).
        clearHeartbeat();
      }
    });

    return () => {
      clearHeartbeat();
      subscription.remove();
    };
  }, [user]);
}
