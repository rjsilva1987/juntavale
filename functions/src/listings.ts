import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { ADMIN_UID, getPushToken, isAdminUid, REGION, sendExpoNotifications } from './shared';

// S170 — avisa o admin quando um anúncio de classificados entra na fila de
// moderação. onDocumentWritten de propósito, NÃO onDocumentCreated: além
// do create (createListing, sempre `pending`), a edição de conteúdo pelo
// dono (updateListingContent) faz updateDoc no MESMO doc e devolve
// `approved`/`rejected` pra `pending` — pro Firestore isso é UPDATE, e um
// onDocumentCreated perderia toda re-submissão. Mesmo raciocínio de
// onVerificationSubmitted (admin.ts). A guarda `before?.status ===
// 'pending'` é a dedup: edição de anúncio AINDA pendente (pending→pending)
// não gera push — um push por entrada na fila, nunca por edição.
//
// Texto sem o título do anúncio (privacidade na tela de bloqueio, mesma
// regra do push de resultado de verificação — ver comentário S58 em
// admin.ts): só o nickname do anunciante, como em `verification_new`.
// Destinatário: só ADMIN_UID, igual a todas as functions de admin hoje.
export const onListingSubmitted = onDocumentWritten(
  { document: 'listings/{listingId}', region: REGION },
  async (event) => {
    const listingId = event.params.listingId;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;

    if (!after) return; // doc apagado
    if (after.status !== 'pending') return; // revisão do admin, vendido, removido
    if (before?.status === 'pending') return; // já estava na fila: edição sem mudança de estado
    if (isAdminUid(after.ownerId as string | undefined)) return; // admin anunciando: modera o próprio

    const token = await getPushToken(ADMIN_UID);
    if (!token) return;

    const name = (after.ownerNickname as string | undefined) || 'Alguém';
    // before === null → anúncio novo; before existente (approved/rejected) →
    // edição que voltou pra fila. O admin sabe por que recebeu o push de novo.
    const body = before
      ? `${name} editou um anúncio, que voltou para a fila`
      : `${name} enviou um anúncio para revisão`;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Novo anúncio para aprovar',
        body,
        data: { type: 'listing_new', listingId },
      },
    ]);
  },
);
