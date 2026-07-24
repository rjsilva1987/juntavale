// src/constants/authErrors.ts
//
// Fonte única das mensagens de erro de autenticação (S62). Mesmo espírito de
// lookingFor.ts/supportCategories.ts (fonte única, sem strings soltas nas
// telas) — mas aqui a forma é mapa de código de erro -> mensagem, não uma
// lista de opções com label, porque o conjunto de códigos vem do Firebase
// (fora do nosso controle), não de um catálogo que nós definimos.
import { FirebaseError } from 'firebase/app';

export type AuthErrorContext = 'login' | 'register' | 'reauth' | 'reset';

// Mensagens iguais nos quatro contextos — evita repetir a mesma string 3x.
const SHARED_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido. Confira o endereço digitado.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet e tente de novo.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/user-disabled': 'Esta conta foi desativada. Fale com o suporte.',
};

// Login — decisão fechada (S62): os três códigos abaixo dão a MESMA mensagem
// genérica de propósito. Não é preguiça de mapear, é proteção contra
// enumeração de e-mail — num app de comunidade fechada, dar uma mensagem
// diferente para "e-mail não existe" vs. "senha errada" permite descobrir
// quem tem conta, o que aqui é risco de privacidade, não só de segurança.
// Nunca especializar esses três de volta sem reabrir essa decisão.
const LOGIN_AUTH_ERRORS: Record<string, string> = {
  ...SHARED_AUTH_ERRORS,
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
};

// Cadastro — aqui PODE ser específico: o fluxo de criar conta precisa dizer
// que o e-mail já existe (pra orientar "tenta entrar") ou que a senha é
// fraca, então não faz sentido generalizar como no login.
const REGISTER_AUTH_ERRORS: Record<string, string> = {
  ...SHARED_AUTH_ERRORS,
  'auth/email-already-in-use': 'Esse e-mail já tem uma conta. Tente entrar.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
};

// Reautenticação (DeleteAccountModal, S53) — o usuário já está logado e está
// confirmando a própria senha antes de uma ação destrutiva, então não há
// risco de enumeração aqui: pode dizer "senha incorreta" com segurança.
const REAUTH_AUTH_ERRORS: Record<string, string> = {
  ...SHARED_AUTH_ERRORS,
  'auth/invalid-credential': 'Senha incorreta. Confira e tente de novo.',
  'auth/wrong-password': 'Senha incorreta. Confira e tente de novo.',
};

// Reset de senha (ForgotPasswordModal, S69) — 'auth/user-not-found' NÃO é
// mapeado aqui de propósito: o modal trata esse código como sucesso (mesmo
// Alert de "verifique seu e-mail"), não como erro deste catálogo. Mesma
// proteção contra enumeração de e-mail do S62, aplicada no nível da chamada
// em vez de aqui.
const RESET_AUTH_ERRORS: Record<string, string> = {
  ...SHARED_AUTH_ERRORS,
  'auth/missing-email': 'Informe o e-mail cadastrado.',
};

const AUTH_ERROR_CATALOG: Record<AuthErrorContext, Record<string, string>> = {
  login: LOGIN_AUTH_ERRORS,
  register: REGISTER_AUTH_ERRORS,
  reauth: REAUTH_AUTH_ERRORS,
  reset: RESET_AUTH_ERRORS,
};

// Usado quando o código não está mapeado acima OU o erro nem é um
// FirebaseError (ex.: falha de rede genérica, erro do próprio app) — nunca
// devolve e.message cru, mesmo nesses casos.
const FALLBACK_MESSAGES: Record<AuthErrorContext, string> = {
  login: 'Não foi possível entrar. Tente de novo.',
  register: 'Não foi possível criar a conta. Tente de novo.',
  reauth: 'Não foi possível confirmar sua senha. Tente de novo.',
  reset: 'Não foi possível enviar o e-mail. Tente de novo.',
};

// Recebe o erro capturado no catch (tipo unknown — este projeto não roda com
// strict/useUnknownInCatchVariables, mas tipamos explicitamente aqui em vez
// de confiar no any implícito) e devolve a mensagem pronta para o Alert.
// e instanceof FirebaseError (não any, não cast) é o jeito correto de ler
// error.code com segurança de tipo — ver firebase/app, que re-exporta a
// classe de @firebase/util.
export const getAuthErrorMessage = (error: unknown, context: AuthErrorContext): string => {
  if (error instanceof FirebaseError) {
    const message = AUTH_ERROR_CATALOG[context][error.code];
    if (message) return message;
  }
  return FALLBACK_MESSAGES[context];
};
