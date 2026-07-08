// src/linking.ts
import { LinkingOptions } from '@react-navigation/native';

import { RootStackParamList } from '@/navigation';

// Deep links declarativos: só rotas que funcionam com os dados vindos direto
// da URL (sem precisar buscar nada no Firestore antes de navegar).
//
// 'Chat' fica de fora de propósito — ChatScreen exige otherUid/otherName
// resolvidos (ver src/navigation/useChatDeepLink.ts), então esse caso é
// tratado à parte, de forma imperativa via navigationRef.
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['juntavale://'],
  config: {
    screens: {
      Main: {
        screens: {
          Conversas: 'matches',
        },
      },
      MatchProfile: 'profile/:uid',
    },
  },
};
