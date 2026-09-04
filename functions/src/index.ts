// S144-C — index.ts vira só reexport nomeado; a lógica das 38 Cloud
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
  onReportCreated,
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
  onMomentoRequestMessageCreated,
} from './momentos';
export {
  expireGroups,
  onGroupJoinRequestCreated,
  onGroupMemberCreated,
  onGroupPollVoteCreated,
  onGroupPollChanged,
  getGroupActiveNowCount,
  onGroupMessageCreated,
} from './grupos';
export { expireEvents, onEventJoinRequestCreated, onEventParticipantCreated } from './eventos';
export { onListingSubmitted, onListingChatMessageCreated, expireListings } from './listings';
export { staleMatchReminder, reengagementPush, weeklyPromptPush } from './agendadas';
