// src/services/notifications.ts
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '@/services/firebase';

// Payload enviado no campo `data` dos pushes disparados pelas Cloud Functions
// (functions/src/index.ts) — usado no client só pra rotear o deep-link ao
// tocar na notificação (ver useNotifications.ts).
export type PushNotificationData = {
  type: 'match' | 'message';
  matchId: string;
  otherUid: string;
  otherName: string;
  otherPhoto?: string;
};

// expo-notifications não tem módulo nativo no Expo Go (SDK 53+); qualquer
// chamada nele derruba o app com "Cannot assign to read-only property 'NONE'".
// Todo acesso ao módulo precisa passar por este guard e por import dinâmico,
// para que o código nem seja carregado quando rodando no Expo Go.
console.log(
  '[notifications] Constants.executionEnvironment:',
  Constants.executionEnvironment,
  '| Constants.appOwnership:',
  Constants.appOwnership,
);

// appOwnership foi deprecated no SDK 54 e pode vir null no Expo Go;
// executionEnvironment === 'storeClient' é a forma robusta de detectar o Expo Go.
export const isExpoGo =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

let notificationsModule: typeof NotificationsType | null = null;
let notificationsPromise: Promise<typeof NotificationsType | null> | null = null;

function loadNotifications(): Promise<typeof NotificationsType | null> {
  if (isExpoGo) return Promise.resolve(null);
  if (notificationsModule) return Promise.resolve(notificationsModule);
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').then((mod) => {
      notificationsModule = mod;
      return mod;
    });
  }
  return notificationsPromise;
}

if (isExpoGo) {
  console.warn(
    '[notifications] Expo Go detectado: push notifications desativadas (use um development build).',
  );
} else {
  loadNotifications().then((Notifications) => {
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      }).catch(() => {});
    }
  });
}

export async function savePushToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'private', 'push'), {
    token,
    updatedAt: serverTimestamp(),
  });
}

export async function removePushToken(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'private', 'push'));
}

export async function registerForPushNotifications(uid: string): Promise<string | null> {
  if (isExpoGo) return null;

  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  if (!Device.isDevice) {
    console.warn('[notifications] Push notifications não funcionam em emuladores/simuladores.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[notifications] Permissão de notificações negada pelo usuário.');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn(
      '[notifications] projectId do EAS não encontrado (expo.extra.eas.projectId no app.json).',
    );
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await savePushToken(uid, token);
    return token;
  } catch (error) {
    console.warn('[notifications] Falha ao obter o Expo push token:', error);
    return null;
  }
}
