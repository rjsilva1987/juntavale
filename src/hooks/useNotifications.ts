// src/hooks/useNotifications.ts
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { navigationRef } from '@/navigation/navigationRef';
import { registerForPushNotifications } from '@/services/notifications';
import { PushNotificationData } from '@/services/sendPushNotification';

export function useNotifications() {
  const { user } = useAuth();
  const receivedSubscription = useRef<Notifications.EventSubscription | null>(null);
  const responseSubscription = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!user) return;
    registerForPushNotifications(user.uid).catch(() => {});
  }, [user]);

  useEffect(() => {
    // App em foreground: o handler global (src/services/notifications.ts) já
    // exibe o alerta do sistema — aqui só existe um ponto de extensão futuro.
    receivedSubscription.current = Notifications.addNotificationReceivedListener(() => {});

    responseSubscription.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          Partial<PushNotificationData> | undefined;
        if (!data?.matchId || !navigationRef.isReady()) return;

        if (data.type === 'message') {
          navigationRef.navigate('Chat', {
            matchId: data.matchId,
            otherUid: data.otherUid ?? '',
            otherName: data.otherName ?? 'Usuário',
            otherPhoto: data.otherPhoto,
          });
        } else if (data.type === 'match') {
          navigationRef.navigate('Main', { screen: 'Conversas' });
        }
      },
    );

    return () => {
      receivedSubscription.current?.remove();
      responseSubscription.current?.remove();
    };
  }, []);
}
