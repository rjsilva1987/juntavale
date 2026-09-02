// src/utils/chatDebug.ts
// S166-0 — instrumentação de diagnóstico do chat 1:1 (client puro). Módulo de
// contadores em memória: SEM setState, SEM Firestore, SEM I/O. Quem lê o
// estado (ChatDebugOverlay) faz isso no próprio ritmo dele via getSnapshot(),
// nunca por callback/assinatura — este módulo nunca dispara re-render de
// ninguém sozinho.
//
// Semântica de "por segundo" de cada contador: currentCount acumula bumps do
// segundo corrente (Math.floor(Date.now()/1000)); ao bump() perceber que o
// segundo mudou, currentCount vira lastSecond (congelado) e um novo bucket
// começa do zero. getSnapshot() só expõe lastSecond (o último segundo JÁ
// fechado) + total, nunca o bucket parcial em andamento — evita mostrar um
// número que ainda está subindo.

interface CounterState {
  currentSecond: number;
  currentCount: number;
  lastSecond: number;
  total: number;
}

interface StallState {
  count: number;
  maxMs: number;
}

export interface ChatDebugSnapshot {
  counters: Record<string, { lastSecond: number; total: number }>;
  stalls: { count: number; maxMs: number };
}

const counters = new Map<string, CounterState>();

let stallState: StallState = { count: 0, maxMs: 0 };
let stallRunning = false;
let stallTimeoutId: ReturnType<typeof setTimeout> | null = null;
let lastStallTickAt = 0;

// Nunca setInterval (eslint.config.js não declara o global e no-undef
// quebra o lint) — laço recursivo de setTimeout, mesmo padrão de
// useOtherPresence.ts:70-75.
const STALL_TICK_MS = 100;
const STALL_THRESHOLD_MS = 200;

function bump(name: string): void {
  const nowSecond = Math.floor(Date.now() / 1000);
  const existing = counters.get(name);
  if (!existing) {
    counters.set(name, { currentSecond: nowSecond, currentCount: 1, lastSecond: 0, total: 1 });
    return;
  }
  if (existing.currentSecond === nowSecond) {
    existing.currentCount += 1;
    existing.total += 1;
    return;
  }
  existing.lastSecond = existing.currentCount;
  existing.currentSecond = nowSecond;
  existing.currentCount = 1;
  existing.total += 1;
}

function getSnapshot(): ChatDebugSnapshot {
  const snapshotCounters: Record<string, { lastSecond: number; total: number }> = {};
  counters.forEach((state, name) => {
    snapshotCounters[name] = { lastSecond: state.lastSecond, total: state.total };
  });
  return {
    counters: snapshotCounters,
    stalls: { count: stallState.count, maxMs: stallState.maxMs },
  };
}

function stallTick(): void {
  if (!stallRunning) return;
  const now = Date.now();
  const elapsed = now - lastStallTickAt;
  if (elapsed > STALL_THRESHOLD_MS) {
    stallState.count += 1;
    if (elapsed > stallState.maxMs) stallState.maxMs = elapsed;
  }
  lastStallTickAt = now;
  stallTimeoutId = setTimeout(stallTick, STALL_TICK_MS);
}

function startStallDetector(): void {
  // Idempotente: chamar duas vezes não duplica o laço.
  if (stallRunning) return;
  stallRunning = true;
  lastStallTickAt = Date.now();
  stallTimeoutId = setTimeout(stallTick, STALL_TICK_MS);
}

function stopStallDetector(): void {
  stallRunning = false;
  if (stallTimeoutId) {
    clearTimeout(stallTimeoutId);
    stallTimeoutId = null;
  }
}

function reset(): void {
  counters.clear();
  stallState = { count: 0, maxMs: 0 };
  // Não para o detector de stall se ele já estiver rodando — só zera as
  // estatísticas acumuladas.
}

export const chatDebug = {
  bump,
  getSnapshot,
  startStallDetector,
  stopStallDetector,
  reset,
};
