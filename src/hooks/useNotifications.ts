// src/hooks/useNotifications.ts
import type * as NotificationsType from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { isAdminUid } from '@/config/admin';
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
  // S95 — o listener abaixo é montado uma vez só (effect com deps `[]`, não
  // resubscreve por usuário); pra saber se é admin no momento em que a
  // notificação chega (não no momento do mount) sem re-subscrever, o uid
  // atual fica num ref atualizado a cada render.
  const userRef = useRef(user);
  userRef.current = user;

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

          // S95 — o admin não tem mais as abas Descobrir/Curtidas/Conversas
          // (só Verificações/Chamados/Perfil, ver MainTabs em
          // navigation/index.tsx); pushes desses tipos apontam pra rotas que
          // não existem na sessão dele, então são ignorados nesse caso.
          const isAdmin = isAdminUid(userRef.current?.uid);
          if (
            isAdmin &&
            (data.type === 'match' ||
              data.type === 'superlike' ||
              data.type === 'message' ||
              data.type === 'match_reminder' ||
              data.type === 'weekly_prompt')
          ) {
            return;
          }

          if ((data.type === 'message' || data.type === 'match_reminder') && data.matchId) {
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
          } else if (data.type === 'support' && data.ticketId) {
            navigationRef.navigate('SupportThread', { ticketId: data.ticketId });
          } else if (data.type === 'report' && data.reportId) {
            navigationRef.navigate('ReportThread', { reportId: data.reportId });
          } else if (data.type === 'weekly_prompt') {
            navigationRef.navigate('Main', { screen: 'Perfil' });
          } else if (data.type === 'verification_reviewed') {
            navigationRef.navigate('Verification');
          } else if (data.type === 'verification_new') {
            // Só o admin recebe esse tipo de push; a rota antiga
            // ('AdminVerifications' como Stack.Screen) não existe mais —
            // virou a aba 'Verificacoes' dentro de Main (ver item 1/2 desta
            // sprint em navigation/index.tsx).
            navigationRef.navigate('Main', { screen: 'Verificacoes' });
          } else if (data.type === 'listing_new') {
            // S170 — só o admin recebe; a fila de classificados é a aba
            // 'Classificados' dentro de Main desde a S169 (navigation/index.tsx).
            navigationRef.navigate('Main', { screen: 'Classificados' });
          } else if (data.type === 'listing_expired') {
            // S172 — dono do anúncio expirado; admin também pode ter
            // anúncio, então este tipo fica FORA do bloco isAdmin acima.
            navigationRef.navigate('MyListings');
          } else if (
            data.type === 'listing_message' &&
            data.listingId &&
            data.ownerId &&
            data.interestedId
          ) {
            // S168-B — mensagem nova no chat interessado↔anunciante; NÃO
            // entra no bloco isAdmin acima (o admin também pode ser
            // interessado/dono de um anúncio, então este tipo não é
            // ignorado pra ele).
            navigationRef.navigate('ListingChat', {
              listingId: data.listingId,
              ownerId: data.ownerId,
              interestedId: data.interestedId,
              listingTitle: data.listingTitle ?? 'Anúncio',
            });
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
