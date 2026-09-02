// src/components/ChatDebugOverlay.tsx
// S166-0 — overlay de diagnóstico do chat 1:1. CHAT_DEBUG_OVERLAY (ver
// ChatScreen.tsx) é o ÚNICO cadeado, nunca deve ir a `true` no repo. Lê
// chatDebug.getSnapshot() no PRÓPRIO
// ritmo (tick de 1s isolado aqui dentro, nunca via setInterval — ver
// justificativa em chatDebug.ts) — nunca se inscreve em nada do ChatScreen,
// então o setState deste componente nunca propaga re-render pro pai. Sem
// props obrigatórias: tudo vem do módulo chatDebug.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/constants/theme';
import { chatDebug, ChatDebugSnapshot } from '@/utils/chatDebug';

const TICK_MS = 1000;

const EMPTY_SNAPSHOT: ChatDebugSnapshot = { counters: {}, stalls: { count: 0, maxMs: 0 } };

export function ChatDebugOverlay() {
  const [snapshot, setSnapshot] = useState<ChatDebugSnapshot>(EMPTY_SNAPSHOT);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chatDebug.startStallDetector();

    const tick = () => {
      setSnapshot(chatDebug.getSnapshot());
      timeoutRef.current = setTimeout(tick, TICK_MS);
    };
    timeoutRef.current = setTimeout(tick, TICK_MS);

    return () => {
      chatDebug.stopStallDetector();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const counterNames = Object.keys(snapshot.counters);

  return (
    <Pressable style={styles.container} onPress={() => chatDebug.reset()}>
      <Text style={styles.line}>
        stalls: {snapshot.stalls.count} (max {snapshot.stalls.maxMs}ms)
      </Text>
      {counterNames.length === 0 ? (
        <Text style={styles.line}>(sem contadores ainda)</Text>
      ) : (
        counterNames.map((name) => {
          const counter = snapshot.counters[name];
          return (
            <Text key={name} style={styles.line}>
              {name}: {counter.lastSecond}/s (total {counter.total})
            </Text>
          );
        })
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    maxWidth: 220,
  },
  line: {
    color: theme.colors.white,
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
});
