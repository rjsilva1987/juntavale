// src/components/ProfileSections.tsx
//
// Extraído do MatchProfileScreen (S72-A) — os seis blocos de conteúdo do
// perfil completo (bio, interesses, lugares, eventos, bilhete, prompts),
// na mesma ordem e com os mesmos estilos. Refactor puro: nenhum
// comportamento novo, nada de "Responder" (isso é o S73).
import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { InterestChips } from '@/components/InterestChips';
import { PromptCard } from '@/components/PromptCard';
import { theme } from '@/constants/theme';
import { UserProfile } from '@/services/firestoreService';
import { EMPTY_INTEREST_SET, getSharedInterestSet } from '@/utils/interests';

interface ProfileSectionsProps {
  profile: UserProfile | null;
  // Interesses de quem está olhando (o myProfile do chamador) — usado só
  // pra calcular o sharedSet do bloco de Interesses. Lugares/eventos não
  // têm matching entre perfis (decisão do S48, ver EMPTY_INTEREST_SET
  // abaixo), então não precisam desse dado.
  myInterests?: string[];
  // S67-complemento — bilhete completo da super curtida. Vem só da
  // LikesScreen (aba "Quem curtiu você"), já pronto por param — nunca lido
  // do doc de swipe aqui. Ausente em todos os outros pontos de entrada
  // (Chat, MatchesGrid, Descobrir, deep link), que continuam funcionando
  // exatamente como antes.
  note?: string;
}

export function ProfileSections({ profile, myInterests = [], note }: ProfileSectionsProps) {
  const sharedInterestSet = useMemo(
    () => getSharedInterestSet(myInterests, profile?.interests),
    [myInterests, profile?.interests],
  );

  return (
    <>
      {!!profile?.bio && (
        <>
          <Text style={styles.sectionTitle}>Sobre</Text>
          <Text style={styles.bio}>{profile.bio}</Text>
        </>
      )}

      {(profile?.interests?.length ?? 0) > 0 && (
        <>
          <Text style={styles.sectionTitle}>Interesses</Text>
          <InterestChips
            interests={profile?.interests ?? []}
            sharedSet={sharedInterestSet}
            maxVisible={100}
            variant="surface"
          />
        </>
      )}

      {(profile?.places?.length ?? 0) > 0 && (
        <>
          <Text style={styles.sectionTitle}>Meus lugares</Text>
          <InterestChips
            interests={profile?.places ?? []}
            sharedSet={EMPTY_INTEREST_SET}
            maxVisible={100}
            variant="surface"
          />
        </>
      )}

      {(profile?.events?.length ?? 0) > 0 && (
        <>
          <Text style={styles.sectionTitle}>No meu radar</Text>
          <InterestChips
            interests={profile?.events ?? []}
            sharedSet={EMPTY_INTEREST_SET}
            maxVisible={100}
            variant="surface"
          />
        </>
      )}

      {/* S67-complemento — bilhete completo da super curtida (sem
          numberOfLines, ao contrário do preview truncado em 3 linhas
          do card na LikesScreen — aquele truncamento continua
          correto lá, este texto aqui é a versão completa). Só existe
          quando o param `note` vem presente (aba "Quem curtiu você"
          da LikesScreen); em todo outro ponto de entrada desta tela
          o bloco inteiro simplesmente não renderiza. Posicionado
          acima de "Perguntas" — é a informação mais relevante pra
          decisão de curtir de volta. */}
      {!!note && (
        <>
          <Text style={styles.sectionTitle}>Bilhete</Text>
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>“{note}”</Text>
          </View>
        </>
      )}

      {((profile?.prompts?.length ?? 0) > 0 || profile?.weeklyPromptAnswer) && (
        <>
          <Text style={styles.sectionTitle}>Perguntas</Text>
          {/* S59 — prompt da semana em destaque primeiro (mesmo
              PromptCard dos demais, sem componente novo), seguido dos
              itens de prompts[]. Perfis de teste anteriores ao S59
              podem ter um item com id wXX preso dentro de prompts[]
              — continua renderizando normalmente aqui (getPromptText
              já resolve id de WEEKLY_PROMPTS), sem tratamento
              especial nem deduplicação com weeklyPromptAnswer. */}
          {profile?.weeklyPromptAnswer && (
            <PromptCard
              key={`weekly-${profile.weeklyPromptAnswer.id}`}
              promptId={profile.weeklyPromptAnswer.id}
              answer={profile.weeklyPromptAnswer.answer}
              variant="surface"
            />
          )}
          {profile?.prompts?.map((item, index) => (
            <PromptCard
              key={`${item.id}-${index}`}
              promptId={item.id}
              answer={item.answer}
              variant="surface"
            />
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bio: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },
  // S67-complemento — mesma linguagem visual de citação do LikeCard
  // (LikesScreen: borda à esquerda em primaryLight + itálico), adaptada pro
  // fundo claro do infoCard aqui (texto escuro em vez de branco — nunca
  // amarelo com texto branco, regra do projeto).
  noteBox: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primaryLight,
  },
  noteText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    fontStyle: 'italic',
    lineHeight: 22,
  },
});
