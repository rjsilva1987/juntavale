// src/utils/matches.ts
import type { LastMessage, Match } from '@/services/firestoreService';

// Matches legados (pré-S27) podem ter lastMessage como STRING antiga ou nem
// ter o campo — tratados como "sem mensagem" até chegar uma mensagem nova
// (decisão de produto da S27). Só o objeto gravado pela Cloud Function
// onMessageCreated conta como válido.
export function hasValidLastMessage<T extends { lastMessage?: LastMessage }>(
  match: T,
): match is T & { lastMessage: LastMessage } {
  const lm = match.lastMessage as unknown;
  return (
    !!lm &&
    typeof lm === 'object' &&
    typeof (lm as LastMessage).text === 'string' &&
    typeof (lm as LastMessage).senderId === 'string'
  );
}

// Mesmo critério usado pelo badge da tab bar (useUnreadCount): sem mensagem
// válida ou última mensagem enviada pelo próprio uid nunca é "não lida".
// createdAt pode vir null enquanto o serverTimestamp() da Cloud Function
// ainda não resolveu no listener — nesse caso, se quem mandou não fui eu,
// trato como não lida (não dá pra comparar com lastReadAt sem createdAt).
export function isMatchUnread(match: Match, uid: string): boolean {
  if (!hasValidLastMessage(match)) return false;
  const { lastMessage } = match;
  if (lastMessage.senderId === uid) return false;
  if (!lastMessage.createdAt) return true;

  const readAt = match.lastReadAt?.[uid];
  if (!readAt) return true;
  return lastMessage.createdAt.toMillis() > readAt.toMillis();
}
