// src/hooks/useTypingIndicator.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { listenTypingStatus, setTypingStatus } from '@/services/firestoreService';
import { chatDebug } from '@/utils/chatDebug';

// S89 — este debounce é QUEM de fato faz o "digitando..." sumir no caminho
// normal: ele grava isTyping:false 1200ms depois da última tecla. O
// TYPING_STALE_MS de 5s (firestoreService.ts) é só a rede de segurança pra
// client que morreu sem limpar (crash/kill do OS) — não é ele que governa o
// tempo percebido. Se alguém quiser acelerar mais, mexa AQUI, não lá:
// derrubar o STALE pra perto do THROTTLE abaixo faz o rótulo piscar durante
// digitação longa, porque o carimbo renovado chega depois do timer expirar.
const TYPING_STOP_DEBOUNCE_MS = 1200;
// S79-C1 — o carimbo agora expira sozinho no reader (TYPING_STALE_MS =
// 5000ms, ver firestoreService.ts), então uma digitação contínua precisa
// renovar o carimbo periodicamente, senão a janela do reader esgota no meio
// de uma digitação longa. Guarda antiga (`isTypingRef.current === typing`)
// bloqueava QUALQUER regravação enquanto typing permanecia true — virou
// throttle: renova no máximo a cada TYPING_REFRESH_THROTTLE_MS, valor bem
// abaixo de TYPING_STALE_MS pra sobrar margem.
const TYPING_REFRESH_THROTTLE_MS = 2000;

interface UseTypingIndicatorReturn {
  isOtherTyping: boolean;
  handleTyping: () => void;
}

export function useTypingIndicator(
  matchId: string,
  currentUid: string,
  debugEnabled?: boolean,
): UseTypingIndicatorReturn {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const isTypingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendStop = useCallback(() => {
    if (!currentUid || !isTypingRef.current) return;
    isTypingRef.current = false;
    if (debugEnabled) chatDebug.bump('setTypingStatus');
    setTypingStatus(matchId, currentUid, false).catch(() => {});
  }, [matchId, currentUid, debugEnabled]);

  const handleTyping = useCallback(() => {
    if (!currentUid) return;

    const now = Date.now();
    if (!isTypingRef.current || now - lastSentAtRef.current >= TYPING_REFRESH_THROTTLE_MS) {
      isTypingRef.current = true;
      lastSentAtRef.current = now;
      if (debugEnabled) chatDebug.bump('setTypingStatus');
      setTypingStatus(matchId, currentUid, true).catch(() => {});
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(sendStop, TYPING_STOP_DEBOUNCE_MS);
  }, [matchId, currentUid, sendStop, debugEnabled]);

  useEffect(() => {
    const unsub = listenTypingStatus(matchId, currentUid, (typing) => {
      if (debugEnabled) chatDebug.bump('listenTypingStatus');
      setIsOtherTyping(typing);
    });
    return unsub;
  }, [matchId, currentUid, debugEnabled]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // S79-C1 — isto agora é só cortesia. Se o app morrer antes deste
      // cleanup rodar (crash, kill do OS), o carimbo fica sem ser limpo,
      // mas o reader (listenTypingStatus) expira sozinho em TYPING_STALE_MS
      // porque o carimbo para de ser renovado — esse auto-expire no lado do
      // leitor é o que substitui a dependência antiga de um cleanup
      // perfeito, que era o bug desta sprint.
      sendStop();
    };
  }, [sendStop]);

  return { isOtherTyping, handleTyping };
}
