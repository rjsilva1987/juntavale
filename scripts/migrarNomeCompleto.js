// S138 — Copia o `nickname` (ou, na ausência dele, o `name`) de cada
// users/{uid} pra users/{uid}/private/legalName.name, na base existente que
// ainda não tenha um legalName.name válido.
// S138-correção: a versão original desta sprint sobrescrevia
// incondicionalmente e só olhava `nickname`. A correção passou a: (1) usar
// `name` como origem quando não há `nickname`; (2) NUNCA sobrescrever um
// private/legalName.name que já exista como string não-vazia — preserva
// tanto migrações anteriores quanto nome real digitado no
// cadastro/verificação, em vez de igualar incondicionalmente.
// Não usa functions/src/scripts/migrateNicknames.js como base: aquele
// script não segue o molde dry-run/--confirm/--project deste aqui (scripts/
// limpeza.js) e não é tocado por esta sprint.
// Dry-run por padrão: só loga o que faria. Escreve de fato só com a flag
// --confirm, que por sua vez exige --project=<id> batendo com o project_id
// da chave de serviço — trava contra rodar no projeto errado por engano.
// Uso: node scripts/migrarNomeCompleto.js [--confirm --project=<id>]
'use strict';

const fs = require('fs');
const path = require('path');

// Mesmo teto de SWIPES_BATCH_LIMIT em scripts/limpeza.js — writeBatch tem
// limite de 500 operações; 400 dá folga sem precisar calcular o tamanho
// exato de cada write.
const USERS_BATCH_LIMIT = 400;

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../serviceAccountKey.json');

function printUsage() {
  console.log('Uso: node scripts/migrarNomeCompleto.js [--confirm --project=<id>]');
  console.log('');
  console.log('Sem --confirm: dry-run — só lista quantos docs de legalName seriam escritos.');
  console.log('Com --confirm: escreve de fato. Exige --project=<id> igual ao project_id da');
  console.log('chave de serviço, como trava contra rodar no projeto errado.');
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

// set(...) sem merge: só é chamado (main()) para uids cujo
// private/legalName ainda não tem `name` válido — já checado antes desta
// função. O doc final tem que ter exatamente { name, createdAt }, batendo
// com keys().hasOnly(['name','createdAt']) das rules; merge:true não é
// necessário aqui porque não há nada útil pra preservar num doc que não
// tinha `name` válido, e createdAt é sempre gravado via serverTimestamp()
// neste passo (doc novo ou doc existente sem name válido).
async function writeLegalNameInBatches(admin, db, entries, confirm) {
  for (let i = 0; i < entries.length; i += USERS_BATCH_LIMIT) {
    const slice = entries.slice(i, i + USERS_BATCH_LIMIT);
    if (!confirm) continue;
    const batch = db.batch();
    for (const { uid, value } of slice) {
      const ref = db.collection('users').doc(uid).collection('private').doc('legalName');
      batch.set(ref, { name: value, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const confirm = rawArgs.includes('--confirm');
  let projectFlag = null;
  for (const arg of rawArgs) {
    if (arg === '--confirm') continue;
    if (arg.startsWith('--project=')) {
      projectFlag = arg.slice('--project='.length);
      continue;
    }
    console.error(`ERRO: argumento desconhecido: ${arg}`);
    printUsage();
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

  console.log(confirm ? 'Modo: EXECUÇÃO REAL (--confirm)' : 'Modo: DRY-RUN (nenhum doc será escrito)');

  const usersSnap = await db.collection('users').get();
  console.log(`users/{uid} encontrados: ${usersSnap.size}`);

  // Origem: nickname primeiro; na ausência dele (não-string ou vazio), cai
  // pra name; se nenhum dos dois existir, não há nada a copiar.
  const entries = [];
  const accounts = [];
  let semNicknameSemName = 0;
  for (const doc of usersSnap.docs) {
    const nickname = doc.data().nickname;
    const name = doc.data().name;
    let value = null;
    let source = null;
    if (typeof nickname === 'string' && nickname.length > 0) {
      value = nickname;
      source = 'nickname';
    } else if (typeof name === 'string' && name.length > 0) {
      value = name;
      source = 'name';
    }
    if (value === null) {
      semNicknameSemName += 1;
      accounts.push({ uid: doc.id, source: '-', value: '-', motivo: 'sem nickname e sem name' });
      continue;
    }
    const account = { uid: doc.id, source, value, motivo: null };
    accounts.push(account);
    entries.push({ uid: doc.id, value, source, account });
  }

  console.log(`Candidatos (com nickname ou name): ${entries.length}`);
  console.log(`Sem nickname e sem name (pulados, nada a copiar): ${semNicknameSemName}`);

  // Idempotência/não-destruição (S138-correção): não sobrescreve quem já
  // tem private/legalName.name válido — nem migração anterior, nem nome
  // real digitado no cadastro/verificação.
  const toWrite = [];
  let jaMigrado = 0;
  for (const entry of entries) {
    const legalRef = db.collection('users').doc(entry.uid).collection('private').doc('legalName');
    const legalSnap = await legalRef.get();
    const existingName = legalSnap.exists ? legalSnap.data().name : undefined;
    if (typeof existingName === 'string' && existingName.length > 0) {
      jaMigrado += 1;
      entry.account.source = '-';
      entry.account.value = '-';
      entry.account.motivo = 'já migrado, pulado';
      continue;
    }
    toWrite.push(entry);
  }

  console.log(`Já migrado (private/legalName.name já preenchido, pulados): ${jaMigrado}`);
  console.log(`Serão migrados (escrita nova): ${toWrite.length}`);

  console.log('');
  console.log('Detalhe por conta:');
  for (const row of accounts) {
    const uidShort = `${row.uid.slice(0, 8)}...`;
    const motivoSuffix = row.motivo ? ` (${row.motivo})` : '';
    console.log(`  ${uidShort} | origem: ${row.source} | valor: ${row.value}${motivoSuffix}`);
  }

  if (!confirm) {
    console.log('');
    console.log('Dry-run: 0 escritos. Rode de novo com --confirm para escrever de fato.');
    return;
  }

  await writeLegalNameInBatches(admin, db, toWrite, confirm);
  console.log(`Escritos: ${toWrite.length} doc(s) de private/legalName.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
