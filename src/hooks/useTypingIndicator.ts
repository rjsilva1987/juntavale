// src/hooks/useTypingIndicator.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { listenTypingStatus, setTypingStatus } from '@/services/firestoreService';

const TYPING_DEBOUNCE_MS = 2000;

interface UseTypingIndicatorReturn {
  isOtherTyping: boolean;
  handleTyping: () => void;
}

export function useTypingIndicator(matchId: string, currentUid: string): UseTypingIndicatorReturn {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const isTypingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateTyping = useCallback(
    (typing: boolean) => {
      if (!currentUid || isTypingRef.current === typing) return;
      isTypingRef.current = typing;
      setTypingStatus(matchId, currentUid, typing).catch(() => {});
    },
    [matchId, currentUid],
  );

  const handleTyping = useCallback(() => {
    updateTyping(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateTyping(false), TYPING_DEBOUNCE_MS);
  }, [updateTyping]);

  useEffect(() => {
    const unsub = listenTypingStatus(matchId, currentUid, setIsOtherTyping);
    return unsub;
  }, [matchId, currentUid]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      updateTyping(false);
    };
  }, [updateTyping]);

  return { isOtherTyping, handleTyping };
}
