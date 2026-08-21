// src/components/ProfileSections.tsx
//
// Extraído do MatchProfileScreen (S72-A) — os seis blocos de conteúdo do
// perfil completo (bio, interesses, lugares, eventos, bilhete, prompts),
// na mesma ordem e com os mesmos estilos. Refactor puro: nenhum
// comportamento novo, nada de "Responder" (isso é o S73).
//
// S108-A acrescenta os dois grupos do catálogo `about` (ver
// src/constants/profileAbout.ts) como chip com ícone — NÃO reusa `AboutRow`
// (chevron + "Adicionar" são gestos de EDIÇÃO; em perfil alheio isso
// mentiria sobre o que é tocável aqui, que é só leitura).
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { InterestChips } from '@/components/InterestChips';
import { PromptCard } from '@/components/PromptCard';
import {
  ABOUT_FIELDS,
  ABOUT_GROUP_LABELS,
  AboutFieldId,
  AboutGroup,
  formatAboutFieldLabels,
} from '@/constants/profileAbout';
import { REPLY_LIMIT } from '@/constants/reply';
import { theme } from '@/constants/theme';
import { UserProfile } from '@/services/firestoreService';
import { EMPTY_INTEREST_SET, getSharedInterestSet } from '@/utils/interests';

// S108-A — campos cujas opções são advérbio/adjetivo sem objeto explícito
// (ex.: "Frequentemente", "Passo longe", "Ainda não sei") — sozinhos ao
// lado só do ícone, ficam ambíguos. Só estes três mantêm o rótulo do campo
// na chip (`Rótulo: valor`); os outros 10 campos mostram só ícone + valor
// (ver relatório da sprint pra a leitura campo a campo). Tipado contra
// `AboutFieldId` (auditoria da S108-A) — renomear um id no catálogo agora
// é ERRO DE COMPILAÇÃO aqui, não sumiço silencioso do rótulo.
const AMBIGUOUS_FIELD_IDS = new Set<AboutFieldId>(['exercise', 'socialMedia', 'family']);

// S108-A — uma seção do catálogo `about` (grupo 'about' ou 'lifestyle'):
// cabeçalho + uma chip POR VALOR (não uma chip só com os rótulos juntados
// por vírgula — auditoria pegou que isso estourava a largura em campos
// `multi`, ex. `languages` com 5 idiomas), só quando sobra ao menos um
// valor — nunca cabeçalho órfão. NÃO copia o loop de EDIÇÃO da
// ProfileScreen (que renderiza todo campo incondicionalmente, com
// "Adicionar" pro vazio); aqui cada campo passa por
// `formatAboutFieldLabels` e é descartado se vier `[]` (about ausente,
// `{}` ou campo específico não preenchido — os três casos dão o mesmo
// resultado: nada).
function AboutGroupSection({ profile, group }: { profile: UserProfile | null; group: AboutGroup }) {
  const items = ABOUT_FIELDS.filter((field) => field.group === group)
    .map((field) => ({
      field,
      labels: formatAboutFieldLabels(field, profile?.about?.[field.id]),
    }))
    // S109 — visibilidade por campo: descarta também quem está em
    // aboutHidden, no mesmo filtro que já descartava campo vazio (ambos os
    // motivos dão o mesmo resultado pro visitante — nada aparece). A guarda
    // `items.length === 0` duas linhas abaixo roda DEPOIS deste filtro, com
    // os dois motivos já aplicados — esconder todo o grupo não deixa
    // cabeçalho órfão.
    .filter((item) => item.labels.length > 0 && !profile?.aboutHidden?.includes(item.field.id));

  if (items.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>{ABOUT_GROUP_LABELS[group]}</Text>
      <View style={styles.aboutChipRow}>
        {items.flatMap(({ field, labels }) =>
          // S108-A — ícone só na primeira chip do campo (pedido da spec);
          // as demais (só existem quando `multi` tem 2+ valores, ex.
          // `languages`) vêm só com o texto.
          labels.map((label, index) => (
            <View key={`${field.id}-${index}`} style={styles.aboutChip}>
              {index === 0 && <Ionicons name={field.icon} size={14} color={theme.colors.text} />}
              <Text style={styles.aboutChipText} numberOfLines={1}>
                {AMBIGUOUS_FIELD_IDS.has(field.id) ? `${field.label}: ${label}` : label}
              </Text>
            </View>
          )),
        )}
      </View>
    </>
  );
}

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
  // S73 — botão "Responder" por item de pergunta (fixa ou da semana), só no
  // painel do Descobrir (ProfileSheet). Mesmo padrão do `note?` acima:
  // ausente em MatchProfileScreen, que não passa a prop e continua sem o
  // botão.
  onReply?: (promptId: string) => void;
  // S74-B — quanto resta da quota mensal de "Responder" (contador próprio,
  // ver useReplyQuota). Repassado pelo ProfileSheet, junto com `onReply`;
  // undefined em MatchProfileScreen (que não passa nenhum dos dois).
  // remaining === 0 não esconde o botão — ele fica esmaecido mas tocável
  // (mesmo padrão do `dimmed` do ActionButton), pra que o toque ainda
  // dispare o Alert de quota esgotada no SwipeScreen.
  replyQuotaRemaining?: number;
  // S126 — Enquete no perfil: mesmo padrão de onReply/replyQuotaRemaining
  // acima — ausente em MatchProfileScreen (a enquete só existe no Descobrir
  // pré-match), presente só quando ProfileSheet passa. Sem contagem
  // numérica aqui: o visitante nunca vê o agregado de votos, só o dono (na
  // ProfileScreen) — por isso não existe prop de contagem neste componente.
  poll?: { question: string; options: string[] };
  myPollVote?: number | null;
  onVotePoll?: (optionIndex: number) => void;
}

export function ProfileSections({
  profile,
  myInterests = [],
  note,
  onReply,
  replyQuotaRemaining,
  poll,
  myPollVote,
  onVotePoll,
}: ProfileSectionsProps) {
  const sharedInterestSet = useMemo(
    () => getSharedInterestSet(myInterests, profile?.interests),
    [myInterests, profile?.interests],
  );
  // S73 — const local em vez de `profile?.weeklyPromptAnswer` repetido:
  // evita non-null assertion no onPress do botão "Responder" mais abaixo.
  const weeklyPromptAnswer = profile?.weeklyPromptAnswer;
  // S74-B — mesma checagem em ambos os pontos de render do botão abaixo.
  const replyDimmed = replyQuotaRemaining === 0;
  const replyBtnLabel =
    replyQuotaRemaining === undefined
      ? 'Responder'
      : `Responder (${replyQuotaRemaining}/${REPLY_LIMIT})`;

  return (
    <>
      {!!profile?.bio && (
        <>
          <Text style={styles.sectionTitle}>Sobre</Text>
          <Text style={styles.bio}>{profile.bio}</Text>
        </>
      )}

      <AboutGroupSection profile={profile} group="about" />

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

      <AboutGroupSection profile={profile} group="lifestyle" />

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

      {((profile?.prompts?.length ?? 0) > 0 || weeklyPromptAnswer) && (
        <>
          <Text style={styles.sectionTitle}>Perguntas</Text>
          {/* S59 — prompt da semana em destaque primeiro (mesmo
              PromptCard dos demais, sem componente novo), seguido dos
              itens de prompts[]. Perfis de teste anteriores ao S59
              podem ter um item com id wXX preso dentro de prompts[]
              — continua renderizando normalmente aqui (getPromptText
              já resolve id de WEEKLY_PROMPTS), sem tratamento
              especial nem deduplicação com weeklyPromptAnswer. */}
          {weeklyPromptAnswer && (
            <View key={`weekly-${weeklyPromptAnswer.id}`}>
              <PromptCard
                promptId={weeklyPromptAnswer.id}
                answer={weeklyPromptAnswer.answer}
                variant="surface"
              />
              {!!onReply && (
                <AnimatedPressable
                  style={[styles.replyBtn, replyDimmed && styles.replyBtnDimmed]}
                  onPress={() => onReply(weeklyPromptAnswer.id)}
                >
                  <Text style={styles.replyBtnText}>{replyBtnLabel}</Text>
                </AnimatedPressable>
              )}
            </View>
          )}
          {profile?.prompts?.map((item, index) => (
            <View key={`${item.id}-${index}`}>
              <PromptCard promptId={item.id} answer={item.answer} variant="surface" />
              {!!onReply && (
                <AnimatedPressable
                  style={[styles.replyBtn, replyDimmed && styles.replyBtnDimmed]}
                  onPress={() => onReply(item.id)}
                >
                  <Text style={styles.replyBtnText}>{replyBtnLabel}</Text>
                </AnimatedPressable>
              )}
            </View>
          ))}
        </>
      )}

      {/* S126 — Enquete no perfil: só existe no Descobrir pré-match
          (ProfileSheet passa `poll`+`onVotePoll`; MatchProfileScreen não
          passa nenhum dos dois, mesma guarda de "só existe no ponto de
          entrada certo" que `onReply` já usa acima). Sem contagem visível
          pro visitante — decisão 4 da spec é sobre o DONO não ver quem
          votou, não sobre o visitante ver o resultado; pra não inventar
          produto, aqui só mostra qual opção o visitante escolheu (ou os
          botões, se ainda não votou), nunca números. A contagem agregada só
          aparece pro dono, na ProfileScreen. */}
      {!!poll && !!onVotePoll && (
        <>
          <Text style={styles.sectionTitle}>Enquete</Text>
          <Text style={styles.pollQuestion}>{poll.question}</Text>
          {poll.options.map((option, index) => {
            const isChosen = myPollVote === index;
            const alreadyVoted = myPollVote != null;
            return (
              <AnimatedPressable
                key={index}
                style={[styles.pollOption, isChosen && styles.pollOptionChosen]}
                onPress={() => !alreadyVoted && onVotePoll(index)}
                disabled={alreadyVoted}
              >
                <Text style={[styles.pollOptionText, isChosen && styles.pollOptionTextChosen]}>
                  {option}
                </Text>
              </AnimatedPressable>
            );
          })}
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
  // S73 — botão "Responder" por pergunta; mesmos tokens do botão principal
  // do SuperLikeNoteModal (primary/onPrimary), nunca secondary (amarelo) +
  // texto branco.
  replyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  replyBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  // S74-B — mesma opacidade do `actionBtnDisabled` do SwipeScreen (ActionButton,
  // padrão `dimmed` do S70): reduz opacidade sem desabilitar o toque nativo.
  replyBtnDimmed: {
    opacity: 0.35,
  },
  // S108-A — mesmo container (row + wrap + gap) do InterestChips; chip
  // própria em vez de reusar InterestChips (não aceita ícone, e é usado por
  // outras telas — não mexer nele aqui), mas com o MESMO vocabulário
  // "surface": fundo background, borda border, pill full.
  aboutChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  aboutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    // S108-A — rede de segurança pra rótulo comprido (ex. "Socialmente, aos
    // fins de semana"): sem os dois (maxWidth + flexShrink), o
    // `numberOfLines={1}` do aboutChipText abaixo não tem largura
    // restringida pra truncar contra — a chip só mediria o texto inteiro e
    // estouraria (achado da auditoria da S108-A).
    maxWidth: '100%',
    flexShrink: 1,
  },
  aboutChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    flexShrink: 1,
  },
  // S126 — Enquete no perfil: opção não escolhida usa o mesmo vocabulário
  // "surface" do resto do painel (fundo background, borda border); a
  // escolhida destaca com primaryLight/primary — nunca amarelo com texto
  // branco (regra do projeto).
  pollQuestion: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  pollOption: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: theme.colors.background,
  },
  pollOptionChosen: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  pollOptionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  pollOptionTextChosen: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
