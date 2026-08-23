// Apaga em lote documentos da collection `swipes` no Firestore do projeto
// bbmatch-9ede5, filtrados por UID(s) passados via linha de comando. Não
// apaga `matches` correspondentes — mesmo desacoplamento que já existe hoje
// entre `unmatch` e `swipes` (decisão deliberada, não é bug).
// Dry-run por padrão: só apaga de fato com a flag --confirm, que por sua vez
// exige --project=<id> batendo com o project_id da chave de serviço — trava
// contra apagar no projeto errado por engano.
// Uso: node scripts/limpeza.js <uid1> [uid2] [...] [--confirm --project=<id>]
'use strict';

const fs = require('fs');
const path = require('path');

// Mesmo teto de DELETE_ACCOUNT_BATCH_LIMIT em functions/src/index.ts:1092 —
// writeBatch tem limite de 500 operações; 400 dá folga sem precisar
// calcular o tamanho exato de cada delete.
const SWIPES_BATCH_LIMIT = 400;

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../serviceAccountKey.json');

function printUsage() {
  console.log('Uso: node scripts/limpeza.js <uid1> [uid2] [...] [--confirm --project=<id>]');
  console.log('');
  console.log('Sem --confirm: dry-run — só lista quantos docs de swipes seriam apagados.');
  console.log('Com --confirm: apaga de fato os docs encontrados. Exige --project=<id> igual');
  console.log('ao project_id da chave de serviço, como trava contra apagar no projeto errado.');
}

function requireServiceAccount() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`ERRO: serviceAccountKey.json não encontrado em ${SERVICE_ACCOUNT_PATH}`);
    console.error('');
    console.error('Baixe a chave de serviço do console Firebase do projeto bbmatch-9ede5:');
    console.error('  Configurações do projeto → Contas de serviço → Gerar nova chave privada');
    console.error('E salve o arquivo como serviceAccountKey.json na raiz do repositório.');
    process.exit(1);
  }
  return require('../serviceAccountKey.json');
}

// Busca em `swipes` os docs onde from == uid OU to == uid, mesmo padrão de
// deleteAccount em functions/src/index.ts:1188-1193.
async function findSwipesForUid(db, uid) {
  const [fromSnap, toSnap] = await Promise.all([
    db.collection('swipes').where('from', '==', uid).get(),
    db.collection('swipes').where('to', '==', uid).get(),
  ]);
  return [...fromSnap.docs, ...toSnap.docs];
}

async function deleteDocsInBatches(db, refs) {
  for (let i = 0; i < refs.length; i += SWIPES_BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + SWIPES_BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const confirm = rawArgs.includes('--confirm');
  let projectFlag = null;
  const uids = [];
  for (const arg of rawArgs) {
    if (arg === '--confirm') continue;
    if (arg.startsWith('--project=')) {
      projectFlag = arg.slice('--project='.length);
      continue;
    }
    uids.push(arg);
  }

  if (uids.length === 0) {
    printUsage();
    process.exit(1);
  }

  const blankUid = uids.find((uid) => uid.trim() === '');
  if (blankUid !== undefined) {
    console.error('ERRO: UID vazio ou só espaço não é permitido.');
    process.exit(1);
  }

  const serviceAccount = requireServiceAccount();
  console.log(`Projeto da chave de serviço: ${serviceAccount.project_id}`);

  if (confirm) {
    if (!projectFlag) {
      console.error('ERRO: --confirm exige --project=<id> igual ao project_id da chave de serviço.');
      console.error(`Chave carregada aponta para: ${serviceAccount.project_id}`);
      process.exit(1);
    }
    if (projectFlag !== serviceAccount.project_id) {
      console.error(
        `ERRO: --project=${projectFlag} não bate com o project_id da chave (${serviceAccount.project_id}). Abortando sem tocar em nada.`,
      );
      process.exit(1);
    }
  }

  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(`UIDs recebidos (${uids.length}): ${uids.join(', ')}`);
  console.log(confirm ? 'Modo: EXECUÇÃO REAL (--confirm)' : 'Modo: DRY-RUN (nenhum doc será apagado)');

  // Dedup por doc.id: um doc de swipe pode bater em dois UIDs diferentes da
  // lista (ex.: A→B e B→A quando A e B estão ambos na lista de argumentos).
  const refsById = new Map();

  for (const uid of uids) {
    const docs = await findSwipesForUid(db, uid);
    console.log(`  ${uid}: ${docs.length} doc(s) encontrado(s)`);
    for (const doc of docs) {
      refsById.set(doc.id, doc.ref);
    }
  }

  const refs = [...refsById.values()];
  console.log(`Total de docs únicos de swipes: ${refs.length}`);

  if (!confirm) {
    console.log('Dry-run: 0 apagados. Rode de novo com --confirm para apagar de fato.');
    return;
  }

  await deleteDocsInBatches(db, refs);
  console.log(`Apagados: ${refs.length} doc(s) de swipes.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
