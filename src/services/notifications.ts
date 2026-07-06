// src/services/notifications.ts
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { updateUserProfile } from '@/services/firestoreService';

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
    lightColor: '#FD3A69',
  }).catch(() => {});
}

export async function savePushToken(uid: string, token: string): Promise<void> {
  await updateUserProfile(uid, { pushToken: token });
}

export async function removePushToken(uid: string): Promise<void> {
  await updateUserProfile(uid, { pushToken: null });
}

export async function registerForPushNotifications(uid: string): Promise<string | null> {
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
