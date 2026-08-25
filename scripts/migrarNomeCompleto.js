// S138 — Copia o `nickname` de cada users/{uid} pra
// users/{uid}/private/legalName.name, em TODA a base existente. Decisão já
// tomada por Raphael ("copiar, em toda a base existente"): sobrescreve
// incondicionalmente, sem checar se private/legalName.name já tinha um
// valor diferente (nome real digitado no cadastro/verificação) — depois
// desta sprint, nickname e legalName são os dois travados pelas mesmas
// rules, e a decisão de produto foi igualar o conteúdo dos dois na base
// legada em vez de preservar o que já existia.
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

// set(..., { merge: true }) em vez de update(): private/legalName pode não
// existir ainda pra boa parte da base (subdocumento só nasce no cadastro ou
// na 1ª edição de perfil via ProfileScreen) — update() falharia com "no
// document to update" nesses casos. merge:true também preserva `createdAt`
// quando o doc já existe, e cria o doc só com `name` quando não existe
// (sem inventar um createdAt que não teria significado real).
async function writeLegalNameInBatches(db, entries, confirm) {
  for (let i = 0; i < entries.length; i += USERS_BATCH_LIMIT) {
    const slice = entries.slice(i, i + USERS_BATCH_LIMIT);
    if (!confirm) continue;
    const batch = db.batch();
    for (const { uid, nickname } of slice) {
      const ref = db.collection('users').doc(uid).collection('private').doc('legalName');
      batch.set(ref, { name: nickname }, { merge: true });
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

  const entries = [];
  let semNickname = 0;
  for (const doc of usersSnap.docs) {
    const nickname = doc.data().nickname;
    if (typeof nickname !== 'string' || nickname.length === 0) {
      semNickname += 1;
      continue;
    }
    entries.push({ uid: doc.id, nickname });
  }

  console.log(`Com nickname (serão migrados): ${entries.length}`);
  console.log(`Sem nickname (pulados, nada a copiar): ${semNickname}`);

  if (!confirm) {
    console.log('Dry-run: 0 escritos. Rode de novo com --confirm para escrever de fato.');
    return;
  }

  await writeLegalNameInBatches(db, entries, confirm);
  console.log(`Escritos: ${entries.length} doc(s) de private/legalName.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
