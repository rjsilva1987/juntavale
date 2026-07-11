// src/hooks/useNotifications.ts
import type * as NotificationsType from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { navigationRef } from '@/navigation/navigationRef';
import {
  isExpoGo,
  PushNotificationData,
  registerForPushNotifications,
} from '@/services/notifications';

export function useNotifications() {
  const { user } = useAuth();
  const receivedSubscription = useRef<NotificationsType.EventSubscription | null>(null);
  const responseSubscription = useRef<NotificationsType.EventSubscription | null>(null);

  useEffect(() => {
    if (isExpoGo || !user) return;
    registerForPushNotifications(user.uid).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (isExpoGo) return;

    let cancelled = false;

    import('expo-notifications').then((Notifications) => {
      if (cancelled) return;

      // App em foreground: o handler global (src/services/notifications.ts) já
      // exibe o alerta do sistema — aqui só existe um ponto de extensão futuro.
      receivedSubscription.current = Notifications.addNotificationReceivedListener(() => {});

      responseSubscription.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as
            Partial<PushNotificationData> | undefined;
          if (!data?.type || !navigationRef.isReady()) return;

          if (data.type === 'message' && data.matchId) {
            navigationRef.navigate('Chat', {
              matchId: data.matchId,
              otherUid: data.otherUid ?? '',
              otherName: data.otherName ?? 'Usuário',
              otherPhoto: data.otherPhoto,
            });
          } else if (data.type === 'match') {
            navigationRef.navigate('Main', { screen: 'Conversas' });
          } else if (data.type === 'superlike') {
            navigationRef.navigate('Main', { screen: 'Curtidas' });
          }
        },
      );
    });

    return () => {
      cancelled = true;
      receivedSubscription.current?.remove();
      responseSubscription.current?.remove();
    };
  }, []);
}
