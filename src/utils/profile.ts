// src/utils/profile.ts
//
// S135 — nome real sai do doc público (users/{uid}.name) e é substituído por
// `nickname` ("como quer ser chamado"). getDisplayName centraliza a escolha
// do nome exibido em qualquer tela pública (Descobrir, perfil, Curtidas,
// Conversas, pushes): prioriza nickname, cai pro `name` legado enquanto a
// conta não passou pela migração (functions/scripts/migrateNicknames.js,
// script manual rodado por Raphael depois do deploy das rules novas — há
// uma janela entre o deploy e o script rodar em que contas antigas ainda
// têm `name` no doc público e não têm `nickname` ainda).
export function getDisplayName(profile?: { nickname?: string; name?: string } | null): string {
  return profile?.nickname ?? profile?.name ?? 'Usuário';
}
