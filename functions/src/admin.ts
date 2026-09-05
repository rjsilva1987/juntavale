import { Timestamp } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';

import {
  bucket,
  db,
  GMAIL_APP_PASSWORD,
  getAdminPushTokens,
  getPushToken,
  isAdminUid,
  REGION,
  sendExpoNotifications,
} from './shared';

// Réplica mínima de SUPPORT_CATEGORY_LABELS (src/constants/supportCategories.ts)
// — functions não importa código do app, então este mapa precisa ficar em
// sincronia manual se as categorias mudarem.
const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  duvida: 'Dúvida',
  problema_tecnico: 'Problema técnico',
  denuncia: 'Denúncia',
  sugestao: 'Sugestão',
  conta: 'Conta e cadastro',
};

// verified (S20) é escrito só por aqui (Admin SDK) — o client nunca consegue
// setá-lo, ver firestore.rules (users/{userId} não tem 'verified' na
// hasOnly() de create/update). O client só consegue mudar o status do pedido
// pra 'pending'; só o admin consegue mudar pra 'approved'/'rejected' (ver
// firestore.rules, match /verifications/{uid}) — esta function reage a essa
// mudança e sincroniza o booleano no perfil.
export const onVerificationReviewed = onDocumentUpdated(
  { document: 'verifications/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;

    if (after.status === 'approved') {
      await db.doc(`users/${event.params.uid}`).update({ verified: true });
    } else if (after.status === 'rejected') {
      await db.doc(`users/${event.params.uid}`).update({ verified: false });
    }

    // S53 — a selfie só serve pra decidir o status; uma vez decidido
    // (approved OU rejected), o arquivo não tem mais função e é apagado do
    // Storage. O doc verifications/{uid} permanece (status, selfieUrl morto,
    // createdAt, reviewedAt, reviewedBy) — só o arquivo em si some.
    try {
      await bucket.deleteFiles({ prefix: `verifications/${event.params.uid}/` });
    } catch (error) {
      console.error(
        '[onVerificationReviewed] falha ao apagar a selfie:',
        event.params.uid,
        error,
      );
    }

    // S58 — push de resultado. Transacional (resultado direto de uma ação
    // do próprio usuário — enviar a selfie), por isso NÃO passa pelo filtro
    // de reengagementOptOut (esse existe só pra campanhas de reengajamento,
    // ver skippedOptOut em staleMatchReminder, agendadas.ts). O motivo da
    // rejeição fica de fora do texto de propósito (privacidade na tela de
    // bloqueio) — quem quiser saber qual foi, abre o app. Falha de push não
    // pode derrubar a function nem a atualização de verified acima, mesmo
    // padrão do catch da selfie logo em cima.
    try {
      const token = await getPushToken(event.params.uid);
      if (token) {
        const { title, body } =
          after.status === 'approved'
            ? { title: 'Verificação aprovada!', body: 'Seu selo ✓ já está no seu perfil.' }
            : {
                title: 'Sua verificação não passou',
                body: 'Toque para ver o motivo e reenviar sua selfie.',
              };
        await sendExpoNotifications([
          {
            to: token,
            sound: 'default',
            title,
            body,
            data: { type: 'verification_reviewed' },
          },
        ]);
      }
    } catch (error) {
      console.error('[onVerificationReviewed] falha ao enviar push:', event.params.uid, error);
    }
  },
);

// S94-A — onDocumentWritten de propósito, NÃO onDocumentCreated: o reenvio
// de selfie (submitVerification, client) faz setDoc SEM merge num doc que
// já existe quando a pessoa foi rejeitada antes — firestore.rules exige que
// o write do dono seja sempre hasOnly(['status','selfieUrl','createdAt']),
// então o reenvio não pode ser um updateDoc parcial, tem que ser o mesmo
// setDoc sem merge da 1ª submissão. Pro Firestore isso é um evento de
// UPDATE (o doc já existia), não de CREATE — um onDocumentCreated aqui
// perderia todo reenvio depois de uma rejeição. NÃO troque pra
// onDocumentCreated sem entender isso.
export const onVerificationSubmitted = onDocumentWritten(
  { document: 'verifications/{uid}', region: REGION },
  async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;

    if (!after) return; // doc apagado
    if (after.status !== 'pending') return; // revisão do admin (approved/rejected)
    if (before?.status === 'pending') return; // já estava pendente: sem mudança de estado
    if (isAdminUid(uid)) return; // admin verificando a si mesmo

    const userSnap = await db.doc(`users/${uid}`).get();
    // S135 — mesmo fallback nickname ?? name (legado) de getUserBasicInfo
    // (shared/index.ts): leitura direta do doc, fora daquela função (não
    // notifica o usuário, notifica o ADMIN sobre um pedido novo — fora do
    // escopo original da S135, mas sem este fallback toda conta
    // pós-migração apareceria como "Alguém" pra sempre, já que `name`
    // deixou de existir no doc público).
    const userData = userSnap.data();
    const name = ((userData?.nickname ?? userData?.name) as string | undefined) ?? 'Alguém';

    // S168-B2 — um push por admin (getAdminPushTokens), não só ADMIN_UID.
    const tokens = await getAdminPushTokens();
    if (tokens.length === 0) return;

    await sendExpoNotifications(
      tokens.map((to) => ({
        to,
        sound: 'default',
        title: 'Novo pedido de verificação',
        body: `${name} enviou uma selfie para revisão`,
        data: { type: 'verification_new' },
      })),
    );
  },
);

// lastMessageAt (S40) é escrito só aqui (Admin SDK), nunca pelo client — ver
// firestore.rules (support/{ticketId} não libera mais esse campo em create
// nem em update). Usa o createdAt da MENSAGEM em vez de serverTimestamp():
// isso torna a function idempotente numa re-execução, mesmo padrão de
// intenção de lastMessage em matches/{matchId} (chat.ts), só que ali é um
// objeto e aqui é o timestamp puro do doc pai.
// lastSenderId (S94-A) segue o mesmo padrão: só o Admin SDK escreve, serve
// pro contador do admin distinguir "esperando resposta do admin" (última
// mensagem é do usuário) de "já respondido" (última mensagem é do admin).
export const onSupportMessageCreated = onDocumentCreated(
  { document: 'support/{ticketId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { ticketId } = event.params;
    const message = snap.data() as {
      senderId: string;
      text?: string;
      createdAt?: Timestamp;
    };

    const ticketSnap = await db.doc(`support/${ticketId}`).get();
    const ticket = ticketSnap.data() as
      | { uid: string; category: string; createdAt?: Timestamp }
      | undefined;
    if (!ticket) {
      console.warn('[onSupportMessageCreated] ticket pai não encontrado:', ticketId);
      return;
    }

    const messageCreatedAt = message.createdAt ?? Timestamp.fromDate(new Date(event.time));

    try {
      await ticketSnap.ref.update({
        lastMessageAt: messageCreatedAt,
        lastSenderId: message.senderId,
      });
    } catch (error) {
      console.error('[onSupportMessageCreated] falha ao atualizar lastMessageAt:', error);
    }

    // Mesmo writeBatch em submitSupportTicket resolve o serverTimestamp() do
    // ticket e da 1ª mensagem pro MESMO valor — createdAt igual identifica
    // "é a 1ª mensagem de um chamado novo" sem precisar de um campo à parte.
    const isNewTicket = !!ticket.createdAt && ticket.createdAt.isEqual(messageCreatedAt);

    // S168-B2 — `tokens` no lugar de um `token` só: ramo admin continua um
    // destinatário único (o dono do ticket); ramo usuário agora manda pra
    // TODOS os admins (getAdminPushTokens), não só ADMIN_UID.
    let tokens: string[];
    let title: string;
    let body: string;
    if (isAdminUid(message.senderId)) {
      const recipientUid = ticket.uid;
      // Admin abrindo/respondendo chamado na própria conta: não notifica a si
      // mesmo, mas o update do lastMessageAt acima já aconteceu de qualquer forma.
      if (recipientUid === message.senderId) return;
      title = 'Equipe JuntaVale';
      body = 'Sua solicitação foi respondida';
      const t = await getPushToken(recipientUid);
      tokens = t ? [t] : [];
    } else {
      tokens = await getAdminPushTokens();
      const categoryLabel = SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category;
      title = isNewTicket ? 'Novo chamado de suporte' : 'Nova resposta em chamado';
      body = categoryLabel;
    }

    if (tokens.length === 0) return;

    await sendExpoNotifications(
      tokens.map((to) => ({
        to,
        sound: 'default',
        title,
        body,
        data: { type: 'support', ticketId },
      })),
    );
  },
);

// S96-A — mesmo papel de onSupportMessageCreated acima (mantém
// lastMessageAt/lastSenderId no doc pai em sincronia com a última mensagem
// da thread), mas para reports/{reportId}/messages.
// S96-C — push adicionado agora, só na direção admin → denunciante (o
// denunciante escrevendo NÃO notifica o admin por push nesta etapa; o
// painel do admin já tem o contador pendingReports pra isso, ver
// AdminAlertContext). Mesmo padrão de recipientUid/token/sendExpoNotifications
// de onSupportMessageCreated acima, sem helper novo.
export const onReportMessageCreated = onDocumentCreated(
  { document: 'reports/{reportId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { reportId } = event.params;
    const message = snap.data() as {
      senderId: string;
      text?: string;
      createdAt?: Timestamp;
    };

    const reportSnap = await db.doc(`reports/${reportId}`).get();
    const report = reportSnap.data() as { reporterId: string } | undefined;
    if (!report) {
      console.warn('[onReportMessageCreated] denúncia pai não encontrada:', reportId);
      return;
    }

    const messageCreatedAt = message.createdAt ?? Timestamp.fromDate(new Date(event.time));

    try {
      await reportSnap.ref.update({
        lastMessageAt: messageCreatedAt,
        lastSenderId: message.senderId,
      });
    } catch (error) {
      console.error('[onReportMessageCreated] falha ao atualizar lastMessageAt:', error);
    }

    // Só o admin dispara push nesta etapa — mensagem do próprio denunciante
    // nunca chega aqui (guarda abaixo também cobriria, mas nem monta o
    // payload à toa).
    if (!isAdminUid(message.senderId)) return;

    const recipientUid = report.reporterId;
    if (recipientUid === message.senderId) return;

    const token = await getPushToken(recipientUid);
    if (!token) return;

    await sendExpoNotifications([
      {
        to: token,
        sound: 'default',
        title: 'Equipe JuntaVale',
        body: 'Sua denúncia foi respondida',
        data: { type: 'report', reportId },
      },
    ]);
  },
);

// S174 — avisa TODOS os admins (getAdminPushTokens, S168-B2) quando uma
// denúncia nova entra em reports/{reportId}. Molde de onListingSubmitted
// (listings.ts). onDocumentCreated basta: denúncia comum é addDoc (sempre
// create) e a de classificado (S168-B2) tem id determinístico — a 2ª do
// mesmo par vira UPDATE, negado nas rules, nunca um create novo. Um push
// por denúncia por admin. Texto FIXO, sem nenhum dado da denúncia
// (privacidade na tela de bloqueio, mesma regra de listing_new/
// verification_new). Denúncia feita por um admin não notifica ninguém —
// mesma guarda isAdminUid de onListingSubmitted ("admin modera o próprio").
export const onReportCreated = onDocumentCreated(
  { document: 'reports/{reportId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const reportId = event.params.reportId;
    const report = snap.data() as { reporterId?: string };
    if (isAdminUid(report.reporterId)) return;

    const tokens = await getAdminPushTokens();
    if (tokens.length === 0) return;

    await sendExpoNotifications(
      tokens.map((to) => ({
        to,
        sound: 'default',
        title: 'Nova denúncia para revisar',
        body: 'Abra a fila de denúncias para analisar.',
        data: { type: 'report_new', reportId },
      })),
    );
  },
);

// S117 — notifica por e-mail (via Gmail) toda vez que a landing (site/index.html)
// grava um novo cadastro em testerSignups. Mesmo padrão estrutural do
// onReportMessageCreated acima: event.data/snap.data() com cast de tipo
// inline, try/catch não-fatal em torno do efeito colateral (lá é push, aqui
// é e-mail) — falha de envio não deve derrubar a function.
export const onTesterSignupCreated = onDocumentCreated(
  { document: 'testerSignups/{signupId}', region: REGION, secrets: [GMAIL_APP_PASSWORD] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as { email: string; createdAt?: Timestamp; source?: string };

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'contato.juntavale@gmail.com',
        pass: GMAIL_APP_PASSWORD.value(),
      },
    });

    try {
      await transporter.sendMail({
        from: 'JuntaVale <contato.juntavale@gmail.com>',
        to: 'contato.juntavale@gmail.com',
        subject: 'Novo testador quer participar do JuntaVale',
        text: `Novo cadastro na landing:\n\nE-mail: ${data.email}\n\nConfira e envie o convite pelo Play Console (Testadores internos/fechados).`,
      });
    } catch (error) {
      console.error('[onTesterSignupCreated] falha ao enviar e-mail:', error);
    }
  },
);

// S180-B — admin apaga de vez um grupo, evento ou anúncio (Admin SDK: doc +
// subcoleções via recursiveDelete + fotos no Storage). Molde onCall de
// deleteAccount (account.ts): auth-check + uid SEMPRE de request.auth,
// nunca de request.data. "Encerrar"/"Cancelar" (status removed/cancelled)
// são update DIRETO do client, sob o ramo admin novo do firestore.rules
// (ver adminService.ts) — esta callable é só pro botão "Excluir", que o
// client não consegue fazer sozinho (rules não liberam apagar em cascata).
// listingChats e reports NUNCA são tocados aqui (mesmo raciocínio do S176 —
// a conversa fica, só o anúncio em si some).
export const adminDeleteContent = onCall(
  { region: REGION, memory: '512MiB', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
    }
    if (!isAdminUid(request.auth.uid)) {
      throw new HttpsError('permission-denied', 'Só admin pode excluir conteúdo.');
    }

    const data = request.data as { kind?: unknown; id?: unknown };
    const { kind, id } = data;
    // S180-B (correção pós-auditoria, rodada 1) — id com "/" formaria um
    // path aninhado (ex.: db.doc(`groups/${id}/messages/{msgId}`)) e
    // recursiveDelete apagaria um doc que as próprias rules dizem
    // `allow delete: if false`; teto de tamanho é só sanidade extra.
    if (
      (kind !== 'group' && kind !== 'event' && kind !== 'listing') ||
      typeof id !== 'string' ||
      id.length === 0 ||
      id.length > 200 ||
      id.includes('/')
    ) {
      throw new HttpsError('invalid-argument', 'kind/id inválidos.');
    }

    console.log(`[adminDeleteContent] ${kind} ${id} por ${request.auth.uid}`);

    if (kind === 'group' || kind === 'event') {
      const ref = db.doc(`${kind === 'group' ? 'groups' : 'events'}/${id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new HttpsError(
          'not-found',
          kind === 'group' ? 'Grupo não encontrado.' : 'Evento não encontrado.',
        );
      }
      await db.recursiveDelete(ref);
      if (kind === 'group') {
        try {
          await bucket.deleteFiles({ prefix: `images/groupChats/${id}/` });
        } catch (error) {
          console.error('[adminDeleteContent] falha ao apagar fotos do grupo:', id, error);
        }
      }
      return { ok: true };
    }

    // kind === 'listing' — apaga as fotos por URL (nunca por prefixo: o
    // path é images/listings/{uid}/{fileName}, sem listingId, apagar por
    // prefixo levaria fotos de OUTROS anúncios do mesmo dono, mesmo
    // raciocínio de deleteListingPhotosBestEffort no client).
    const ref = db.doc(`listings/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Anúncio não encontrado.');
    }
    const listing = snap.data() as { photos?: string[]; ownerId?: unknown } | undefined;
    const ownerId = typeof listing?.ownerId === 'string' ? listing.ownerId : null;
    if (!ownerId) {
      // S180-B (correção pós-auditoria, rodada 1) — sem ownerId não dá pra
      // validar o path com segurança; melhor não apagar foto nenhuma do que
      // arriscar apagar arquivo de outra pessoa.
      console.warn('[adminDeleteContent] anúncio sem ownerId, fotos não apagadas:', id);
    } else {
      for (const url of listing?.photos ?? []) {
        const path = listingPhotoPathForOwner(url, ownerId);
        if (!path) {
          console.warn('[adminDeleteContent] foto fora do path do dono, ignorada:', id);
          continue;
        }
        try {
          await bucket.file(path).delete();
        } catch (error) {
          console.error('[adminDeleteContent] falha ao apagar foto do anúncio:', id, error);
        }
      }
    }
    await ref.delete();
    return { ok: true };
  },
);

// S180-B (correção pós-auditoria, rodada 1) — o DONO controla `photos[]` do
// próprio anúncio livremente (firestore.rules só valida `is list` e
// `size() <= 3`, nunca o conteúdo das URLs em si); esta callable roda com
// Admin SDK, que IGNORA storage.rules — sem esta guarda, um dono mal-
// intencionado podia plantar em `photos[]` uma download URL de QUALQUER
// outro path (ex.: `verifications/{outroUid}/...`) e um admin, ao
// "Excluir" o anúncio, apagaria o arquivo de um terceiro sem querer. A
// guarda replica manualmente o que `storage.rules` já garante pro delete
// de foto de anúncio (só o dono, só dentro do PRÓPRIO prefixo
// `images/listings/{uid}/`, um nome de arquivo só, sem subpasta).
function listingPhotoPathForOwner(url: string, ownerId: string): string | null {
  const path = storagePathFromDownloadUrl(url);
  if (!path) return null;
  const prefix = `images/listings/${ownerId}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes('/') || rest.includes('..')) return null;
  return path;
}

// Formato de download URL do Storage (client/Admin SDK, getDownloadURL):
// https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path-url-encoded}?alt=media&token=...
// Devolve o PATH decodificado (ex.: images/listings/{uid}/171234.jpg) — null
// se a URL não tiver o marcador "/o/" (formato inesperado).
export function storagePathFromDownloadUrl(url: string): string | null {
  const marker = '/o/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  const end = url.indexOf('?', start);
  const encoded = end === -1 ? url.slice(start) : url.slice(start, end);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}
