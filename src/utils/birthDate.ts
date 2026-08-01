// src/utils/birthDate.ts
// Import type-only e direto do SDK, não via firestoreService: o
// firestoreService importa getDisplayAge daqui, então puxar o tipo de lá
// fecharia uma dependência circular.
import type { Timestamp } from 'firebase/firestore';

export const MIN_AGE = 18;
export const MAX_AGE = 100;

const BIRTH_INPUT_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// Data de nascimento é uma data CIVIL, sem horário — construir à
// meia-noite UTC faz qualquer fuso negativo (as Américas inteiras) renderizar
// o dia ANTERIOR ao reconverter pro calendário local do aparelho. Meio-dia UTC
// dá folga de ±12h antes de cruzar a virada do dia em qualquer fuso do mundo.
export function toBirthTimestamp(day: number, month: number, year: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

// Anos completos, considerando mês/dia (não só o ano) — usa getters UTC pra
// ficar consistente com toBirthTimestamp, que constrói em UTC.
export function calculateAge(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export type BirthParseReason = 'incomplete' | 'invalid' | 'underage' | 'overage';

export type BirthParseResult = { ok: true; date: Date } | { ok: false; reason: BirthParseReason };

// ÚNICA função que decide se a data presta — formato, data impossível/futura
// e faixa de idade. Nenhuma dessas checagens deve ser replicada em outro
// arquivo (ver RegisterScreen.tsx, que só traduz o `reason` em mensagem).
export function parseBirthInput(text: string, now: Date = new Date()): BirthParseResult {
  const match = BIRTH_INPUT_PATTERN.exec(text);
  if (!match) return { ok: false, reason: 'incomplete' };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const birth = toBirthTimestamp(day, month, year);

  // Date.UTC "rola" datas impossíveis (ex.: 31/02 vira 03/03) em vez de
  // rejeitar — reconstruir os componentes UTC e comparar com o que foi
  // digitado é o jeito de pegar isso.
  const isImpossibleDate =
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day;

  if (isImpossibleDate || birth.getTime() > now.getTime()) {
    return { ok: false, reason: 'invalid' };
  }

  const age = calculateAge(birth, now);
  if (age < MIN_AGE) return { ok: false, reason: 'underage' };
  if (age > MAX_AGE) return { ok: false, reason: 'overage' };

  return { ok: true, date: birth };
}

// S76-B2 — ponto ÚNICO de onde sai a idade exibida no app. Antes disto, os 8
// pontos de exibição liam o campo `age` gravado, que só era calculado uma vez
// no cadastro (AuthContext.register) e portanto CONGELAVA: a pessoa fazia
// aniversário e continuava aparecendo com a idade antiga até editar o perfil.
//
// Constraint genérica em vez de `profile: UserProfile` porque nenhum helper
// deste projeto recebe o perfil inteiro — ver hasValidLastMessage em
// utils/matches.ts, que é o precedente.
//
// FALLBACK para o `age` gravado quando não há birthDate: é o que permite
// subir este código ANTES da migração das contas antigas sem quebrar nada.
// Não remova o fallback achando que virou código morto — ele também cobre
// documento em estado inesperado, onde o certo é mostrar algo em vez de nada.
export function getDisplayAge<T extends { age: number; birthDate?: Timestamp }>(
  profile: T | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!profile) return null;
  if (profile.birthDate) return calculateAge(profile.birthDate.toDate(), now);
  return typeof profile.age === 'number' ? profile.age : null;
}
