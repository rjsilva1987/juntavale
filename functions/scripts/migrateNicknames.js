// functions/scripts/migrateNicknames.js
//
// S135 — script de migração de dados, NÃO é Cloud Function. Fica fora de
// functions/src de propósito (tsconfig.json de functions só cobre "src" —
// ver include em functions/tsconfig.json), então NUNCA entra no `tsc` nem
// no `firebase deploy --only functions`.
//
// O QUE FAZ: pra cada conta em users/{uid} que ainda tem o campo `name`
// (nome completo, público, pré-S135) no doc público — INDEPENDENTE de já
// ter `nickname` ou não —, migra:
//   1. users/{uid}: SEMPRE remove `name` do doc público. Só define
//      `nickname = name` se o doc AINDA NÃO tiver `nickname` (nunca
//      sobrescreve um nickname que a pessoa já escolheu editando o perfil
//      na janela entre o deploy das rules novas e a execução deste script —
//      nessa janela o client grava `nickname` sem conseguir remover `name`
//      antigo, porque as rules novas não listam 'name' no hasOnly de
//      update).
//   2. users/{uid}/private/legalName: cria o subdocumento privado com o
//      nome real (copiado de `name`), se ainda não existir (não sobrescreve
//      um legalName que a pessoa já tenha gravado via ProfileScreen).
// Contas novas pós-S135 (nunca tiveram `name`) são puladas silenciosamente.
// Idempotente: rodar duas vezes não faz nada na segunda vez, porque `name`
// já não existe mais nos docs processados.
//
// É DESTRUTIVO: remove `name` do doc público pra valer. Sem flag de
// dry-run — script de propósito único, revisado antes de rodar.
//
// QUEM RODA: só Raphael, manualmente, fora do app e fora do deploy de
// functions — e só DEPOIS que as rules novas da S135 (firestore.rules)
// já estiverem deployadas (o isValidProfile novo tolera `nickname` ausente
// no update, mas as rules do subdocumento users/{uid}/private/legalName
// precisam existir antes deste script tentar escrever lá via Admin SDK —
// Admin SDK ignora rules, mas rodar antes do deploy deixaria o app (client,
// que RESPEITA rules) incoerente com o estado dos dados por uma janela
// maior que o necessário).
//
// Como rodar (de dentro de functions/, com credenciais válidas no ambiente
// — ex. GOOGLE_APPLICATION_CREDENTIALS apontando pra uma service account,
// ou gcloud auth application-default login):
//   node scripts/migrateNicknames.js

const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Página de leitura (getDocs paginado) — não precisa bater com o tamanho do
// lote de ESCRITA abaixo, são preocupações diferentes (custo de leitura vs.
// limite de operações do WriteBatch).
const FETCH_PAGE_SIZE = 300;

// Limite do Firestore é 500 operações por WriteBatch. Cada usuário elegível
// gera até 2 writes (users/{uid} sempre; users/{uid}/private/legalName só
// quando o subdocumento ainda não existe) — 150 usuários por commit fica
// bem abaixo do teto (300 ops no pior caso), com folga de propósito.
const BATCH_USER_LIMIT = 150;

async function migrateBatch(docs, counters) {
  // Pra cada doc elegível desta página, checa (fora do WriteBatch — get()
  // não pode ser misturado com batch.set/update no mesmo objeto) se o
  // subdocumento legalName já existe, decidindo se o passo 2 entra ou não.
  const eligible = [];
  for (const doc of docs) {
    const data = doc.data();
    // Correção pós-auditoria (rodada de correção da S135) — filtro é só
    // hasName, sem checar hasNickname: um doc que já tem `name` E `nickname`
    // coexistindo (conta editada na janela entre o deploy das rules e a
    // execução deste script) precisa continuar elegível, senão `name` nunca
    // é removido do doc público e a garantia de privacidade da sprint fica
    // quebrada pra sempre nessas contas.
    const hasName = typeof data.name === 'string' && data.name.length > 0;
    if (!hasName) {
      counters.skipped += 1;
      continue;
    }
    const hasNickname = typeof data.nickname === 'string' && data.nickname.length > 0;
    const legalNameSnap = await db.doc(`users/${doc.id}/private/legalName`).get();
    eligible.push({ doc, data, hasNickname, legalNameExists: legalNameSnap.exists });
  }

  for (let i = 0; i < eligible.length; i += BATCH_USER_LIMIT) {
    const chunk = eligible.slice(i, i + BATCH_USER_LIMIT);
    const batch = db.batch();

    for (const { doc, data, hasNickname, legalNameExists } of chunk) {
      const userRef = db.doc(`users/${doc.id}`);
      batch.update(userRef, {
        // `name` sempre sai do doc público. `nickname` só é definido a
        // partir de `name` quando o doc ainda não tem um — nunca sobrescreve
        // um nickname que a pessoa já escolheu editando o perfil.
        ...(hasNickname ? {} : { nickname: data.name }),
        name: admin.firestore.FieldValue.delete(),
      });

      if (!legalNameExists) {
        const legalNameRef = db.doc(`users/${doc.id}/private/legalName`);
        batch.set(legalNameRef, {
          name: data.name,
          createdAt: data.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    counters.migrated += chunk.length;
    console.log(`[migrateNicknames] lote de ${chunk.length} conta(s) migrada(s) — total até agora: ${counters.migrated}`);
  }
}

async function main() {
  const counters = { migrated: 0, skipped: 0 };
  let lastDoc = null;

  for (;;) {
    let query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(FETCH_PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    console.log(`[migrateNicknames] processando página de ${snap.docs.length} conta(s)...`);
    await migrateBatch(snap.docs, counters);

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < FETCH_PAGE_SIZE) break;
  }

  console.log('[migrateNicknames] concluído.');
  console.log(`[migrateNicknames] migradas: ${counters.migrated}`);
  console.log(`[migrateNicknames] puladas (já migradas ou conta nova): ${counters.skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrateNicknames] falhou:', err);
    process.exit(1);
  });
