// src/constants/achievements.ts
//
// S127 — Marcos e selos: catálogo estático das 3 conquistas desta sprint,
// todas determinísticas (sem sorte) — firstMatch, profileComplete,
// tenDaysInApp. unlockedAt é escrito SÓ por Cloud Function (Admin SDK) em
// users/{uid}/achievements/{id} (ver functions/src/index.ts e
// firestore.rules — allow write: if false pro client). Este arquivo é só
// metadado de EXIBIÇÃO (título/descrição/ícone) — nenhum valor calculado em
// runtime, nenhuma aleatoriedade; quem decide o desbloqueio é sempre a
// Cloud Function, nunca o client.
import { Ionicons } from '@expo/vector-icons';

export const ACHIEVEMENT_IDS = ['firstMatch', 'profileComplete', 'tenDaysInApp'] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'firstMatch',
    title: 'Primeiro match',
    description: 'Você deu o seu primeiro match no JuntaVale.',
    icon: 'heart',
  },
  {
    id: 'profileComplete',
    title: 'Perfil completo',
    description: 'Você preencheu sua bio ou o "Sobre mim", com mais de uma foto.',
    icon: 'person-circle',
  },
  {
    id: 'tenDaysInApp',
    title: '10 dias de JuntaVale',
    description: 'Você faz parte do JuntaVale há 10 dias ou mais.',
    icon: 'ribbon',
  },
];
