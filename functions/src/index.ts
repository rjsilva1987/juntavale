// S144-C — index.ts vira só reexport nomeado; a lógica das 31 Cloud
// Functions do projeto mora nos arquivos de domínio abaixo. Não adicione
// lógica aqui: qualquer function nova entra no arquivo de domínio
// correspondente (ou cria um domínio novo), nunca direto neste arquivo.
export {
  onMatchCreated,
  onSuperLikeReceived,
  onMessageCreated,
  onMessageDeletedForEveryone,
  onBlockCreated,
  onBlockDeleted,
  unmatch,
} from './chat';
export {
  onVerificationReviewed,
  onVerificationSubmitted,
  onSupportMessageCreated,
  onReportMessageCreated,
  onTesterSignupCreated,
} from './admin';
export { deleteAccount } from './account';
export {
  assignFounderNumber,
  onPollVoteCreated,
  onPollChanged,
  onUserProfileUpdated,
  tenDaysInAppCheck,
} from './perfil';
export {
  expireMomentos,
  onMomentoLikeCreated,
  onMomentoLikeDeleted,
  onMomentoRequestCreated,
  onMomentoRequestUpdated,
} from './momentos';
export {
  expireGroups,
  onGroupJoinRequestCreated,
  onGroupMemberCreated,
  onGroupPollVoteCreated,
  onGroupPollChanged,
  getGroupActiveNowCount,
} from './grupos';
export { expireEvents, onEventJoinRequestCreated, onEventParticipantCreated } from './eventos';
export { staleMatchReminder, reengagementPush, weeklyPromptPush } from './agendadas';
