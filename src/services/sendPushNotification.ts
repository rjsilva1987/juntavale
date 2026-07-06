// src/services/sendPushNotification.ts
import { getUserProfile } from '@/services/firestoreService';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export type PushNotificationData = {
  type: 'match' | 'message';
  matchId: string;
  otherUid: string;
  otherName: string;
  otherPhoto?: string;
};

interface SendPushNotificationParams {
  to: string;
  title: string;
  body: string;
  data: PushNotificationData;
}

// Envia diretamente pela API do Expo Push. Sem backend próprio, qualquer
// cliente autenticado consegue disparar pushes para tokens que conheça —
// ver limitações explicadas ao usuário (migrar para Cloud Functions no futuro).
export async function sendPushNotification({
  to,
  title,
  body,
  data,
}: SendPushNotificationParams): Promise<void> {
  try {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
  } catch (_) {
    // Best-effort: o match/mensagem já foi salvo no Firestore, então uma
    // falha de push não deve interromper o fluxo do usuário.
  }
}

export async function notifyNewMatch(params: {
  toUid: string;
  matchId: string;
  otherUid: string;
  otherName: string;
  otherPhoto?: string;
}): Promise<void> {
  const recipient = await getUserProfile(params.toUid);
  if (!recipient?.pushToken) return;

  await sendPushNotification({
    to: recipient.pushToken,
    title: 'Novo match! 🎉',
    body: `Você e ${params.otherName} curtiram um ao outro!`,
    data: {
      type: 'match',
      matchId: params.matchId,
      otherUid: params.otherUid,
      otherName: params.otherName,
      otherPhoto: params.otherPhoto,
    },
  });
}

export async function notifyNewMessage(params: {
  toUid: string;
  matchId: string;
  senderUid: string;
  senderName: string;
  senderPhoto?: string;
  preview: string;
}): Promise<void> {
  const recipient = await getUserProfile(params.toUid);
  if (!recipient?.pushToken) return;

  await sendPushNotification({
    to: recipient.pushToken,
    title: params.senderName,
    body: params.preview,
    data: {
      type: 'message',
      matchId: params.matchId,
      otherUid: params.senderUid,
      otherName: params.senderName,
      otherPhoto: params.senderPhoto,
    },
  });
}
