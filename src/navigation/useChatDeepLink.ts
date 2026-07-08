// src/navigation/useChatDeepLink.ts
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import { navigationRef } from '@/navigation/navigationRef';
import { getMatchById, getUserProfile } from '@/services/firestoreService';

const CHAT_PATH_RE = /^juntavale:\/\/chat\/([^/?#]+)/;

// ChatScreen exige otherUid/otherName resolvidos (sem fallback na UI), então
// esse deep link não pode ser declarativo como os de src/linking.ts — precisa
// buscar o match e o perfil do outro usuário antes de navegar. Mesmo padrão
// de navigationRef imperativo já usado em useNotifications.ts.
export function useChatDeepLink(currentUid: string | undefined) {
  const currentUidRef = useRef(currentUid);
  const pendingMatchId = useRef<string | null>(null);

  // Decisão v1: se o link chegar sem sessão ativa (auth ainda resolvendo)
  // ou antes do NavigationContainer terminar de montar (ex.: gate de
  // onboarding do S21 ainda na tela), o matchId fica pendente só em
  // memória — nunca persiste em disco. `flush` é chamado de novo tanto
  // quando o uid muda quanto quando a navegação fica pronta (onReady, ver
  // src/navigation/index.tsx). Se o usuário nunca logar, o pendente some
  // com o componente — descartado com graça.
  const flush = () => {
    const uid = currentUidRef.current;
    if (!uid || !pendingMatchId.current || !navigationRef.isReady()) return;
    const matchId = pendingMatchId.current;
    pendingMatchId.current = null;
    resolveChatDeepLink(matchId, uid).catch(() => {});
  };

  useEffect(() => {
    currentUidRef.current = currentUid;
    flush();
  }, [currentUid]);

  useEffect(() => {
    const tryResolve = (url: string) => {
      const match = url.match(CHAT_PATH_RE);
      if (!match) return;
      pendingMatchId.current = match[1];
      flush();
    };

    Linking.getInitialURL().then((url) => {
      if (url) tryResolve(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => tryResolve(url));
    return () => subscription.remove();
  }, []);

  return { onNavigationReady: flush };
}

async function resolveChatDeepLink(matchId: string, currentUid: string) {
  const match = await getMatchById(matchId).catch(() => null);
  // null tanto se o match não existe quanto se as rules negaram o read
  // (currentUid fora de match.users) — em ambos os casos, descarta.
  if (!match) return;

  // Coerente com o arquivamento de chats bloqueados (S19): não abre.
  if (match.blockedBy && match.blockedBy.length > 0) return;

  const otherUid = match.users.find((uid) => uid !== currentUid);
  if (!otherUid) return;

  const otherProfile = await getUserProfile(otherUid).catch(() => null);

  navigationRef.navigate('Chat', {
    matchId,
    otherUid,
    otherName: otherProfile?.name ?? 'Usuário',
    otherPhoto: otherProfile?.photoURL,
  });
}
