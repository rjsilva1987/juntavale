// src/navigation/navigationRef.ts
import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '@/navigation';

// Permite navegar (ex.: ao tocar numa notificação) fora da árvore de componentes.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
