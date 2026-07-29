// src/utils/birthDate.ts
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
