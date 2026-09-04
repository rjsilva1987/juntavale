import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';

initializeApp();

export const db = getFirestore();
export const bucket = getStorage().bucket();
export const expo = new Expo();
export const REGION = 'southamerica-east1';
export const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

// S115 — dois uids admin, hardcoded de propósito — mesmo padrão de
// src/config/admin.ts e dos literais em firestore.rules/storage.rules: nenhum
// destes arquivos importa o outro, então precisam ficar em sincronia manual.
// S168-B2 — ADMIN_UID já NÃO é destinatário de push em nenhuma function
// (getAdminPushTokens abaixo substituiu getPushToken(ADMIN_UID) em todas);
// segue exportado só por compatibilidade com quem ainda o usa como VALOR
// fora de push (ex.: comparações pontuais) — sem "qual dos dois admins" pra
// decidir ali.
export const ADMIN_UIDS = ['Gd0pJi8WjYS60JHOnhIx9R6vktJ3', '358dfiUwFlbFV0Z3KCyvKXwGGxD3'];
export const ADMIN_UID = ADMIN_UIDS[0];
export const isAdminUid = (uid?: string | null): boolean => !!uid && ADMIN_UIDS.includes(uid);

export async function getPushToken(uid: string): Promise<string | null> {
  const snap = await db.doc(`users/${uid}/private/push`).get();
  const token = snap.data()?.token as string | undefined;
  return token && Expo.isExpoPushToken(token) ? token : null;
}

// S168-B2 — um push por admin por evento: itera ADMIN_UIDS (mesma lista de
// isAdminUid), pula admin sem token e o uid excluído (ex.: o próprio
// remetente). Substitui getPushToken(ADMIN_UID) em todas as functions de
// admin — ADMIN_UID segue exportado só por compatibilidade.
export async function getAdminPushTokens(excludeUid?: string): Promise<string[]> {
  const tokens = await Promise.all(
    ADMIN_UIDS.filter((uid) => uid !== excludeUid).map((uid) => getPushToken(uid)),
  );
  return tokens.filter((t): t is string => !!t);
}

export async function getUserBasicInfo(
  uid: string,
): Promise<{ name: string; photoURL?: string } | null> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!data) return null;
  // S135 — nome público passa a ser `nickname`; `name` vira fallback pra
  // conta legada ainda não migrada (functions/scripts/migrateNicknames.js).
  // Cloud Functions não importa src/, então não dá pra reusar getDisplayName
  // (src/utils/profile.ts) — mesma lógica replicada aqui à mão. Chave
  // retornada continua `name` de propósito: só a FONTE no doc muda, os
  // vários call sites que leem `.name` no objeto retornado não precisam
  // mudar.
  return {
    name: (data.nickname ?? data.name) as string,
    photoURL: data.photoURL as string | undefined,
  };
}

export async function sendExpoNotifications(messages: ExpoPushMessage[]): Promise<void> {
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket) => {
        if (ticket.status === 'error') {
          // TODO: se ticket.details?.error === 'DeviceNotRegistered', apagar o
          // token em users/{uid}/private/push. Exige mapear ticket -> uid via
          // getReceiptsAsync (assíncrono, chega minutos depois) — fora de
          // escopo desta sessão.
          console.error('[push] ticket error:', ticket.message, ticket.details?.error);
        }
      });
    } catch (error) {
      console.error('[push] falha ao enviar chunk:', error);
    }
  }
}
