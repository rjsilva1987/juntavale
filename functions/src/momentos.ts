import { Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { bucket, db, REGION } from './shared';

// S121 — expira momentos (story de 24h). Roda de hora em hora, mesmo
// timeZone do padrão de staleMatchReminder (agendadas.ts). A transação por
// doc (em vez de deleteDocsInBatches direto na lista da query) é necessária
// porque a lista da query, coletada no passo 1, pode ficar desatualizada:
// um usuário que sobrescreve o próprio momento (setDoc) entre a query e o
// commit teria o NOVO momento apagado por engano, já que a query capturou o
// doc ANTIGO antes da sobrescrita. A releitura dentro da transação garante
// que só apaga o que ainda está realmente expirado no momento do delete.
export const expireMomentos = onSchedule(
  { schedule: '0 * * * *', timeZone: 'America/Sao_Paulo', region: REGION },
  async () => {
    const now = Timestamp.now();
    const snap = await db.collection('momentos').where('expiresAt', '<=', now).get();

    let deletedCount = 0;
    for (const momentoDoc of snap.docs) {
      const ref = momentoDoc.ref;
      let deleted = false;
      let type: string | undefined;
      try {
        await db.runTransaction(async (transaction) => {
          deleted = false;
          type = undefined;
          const fresh = await transaction.get(ref);
          if (!fresh.exists) return;
          const data = fresh.data() as { expiresAt?: Timestamp; type?: string };
          if (data.expiresAt && data.expiresAt.toMillis() <= Timestamp.now().toMillis()) {
            type = data.type;
            transaction.delete(ref);
            deleted = true;
          }
        });
      } catch (error) {
        console.error('[expireMomentos] falha na transação:', ref.id, error);
        continue;
      }

      if (deleted) {
        deletedCount++;
        if (type === 'photo') {
          try {
            await bucket.deleteFiles({ prefix: `images/momentos/${ref.id}/` });
          } catch (error) {
            console.error('[expireMomentos] falha ao apagar fotos do momento:', ref.id, error);
          }
        }
      }
    }

    console.log(`[expireMomentos] varridos: ${snap.size}, apagados: ${deletedCount}`);
  },
);
