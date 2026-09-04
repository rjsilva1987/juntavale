# Data Safety / App Privacy — Classificados (S168-C, 04/09/2026)

Contexto: o repo NÃO guarda o que está marcado hoje no Play Console (Data Safety) nem no App Store Connect (App Privacy) — conferir no console antes de mudar. O que os Classificados (S168-A/B/B1/B2, S170, S171, S172, S173) acrescentam ao app, em termos de dados:
- conteúdo gerado pelo usuário: anúncio (título, descrição, preço, categoria, UF) — texto;
- fotos do anúncio (até 3) e fotos no chat de anúncio;
- mensagens de texto no chat de anúncio;
- denúncias de anúncio/chat (já existem denúncias de perfil/mensagem);
- nenhum dado novo de dispositivo, localização (UF é digitada, copiada do perfil), pagamento (preço é texto do anúncio; não há transação no app), identificador ou rastreamento.

## Play Console — Data Safety

| Categoria → Tipo | Estado esperado | Muda? | Por quê |
| --- | --- | --- | --- |
| Fotos e vídeos → Fotos | Coletado, compartilhado NÃO, finalidade "Funcionalidade do app", obrigatório? opcional (anúncio sem foto é permitido) | NÃO muda se já marcado | Já deveria estar marcado por fotos de perfil/chat |
| Mensagens → Outras mensagens no app | Coletado, finalidade "Funcionalidade do app" | NÃO muda se já marcado | Já deveria estar marcado pelo chat existente |
| Atividade no app → Outro conteúdo gerado pelo usuário | Coletado, finalidade "Funcionalidade do app" | CONFERIR | Se hoje só "Informações pessoais → Nome" e bio estiverem marcados, marcar este tipo — o anúncio é conteúdo gerado pelo usuário visível a terceiros |
| Localização | — | NÃO muda | UF é digitada no perfil, não é localização do dispositivo |
| Informações financeiras | — | NÃO muda | Não há compra/pagamento/histórico de transação no app; o preço é texto do anúncio |
| Práticas de segurança | "Dados criptografados em trânsito" e "usuário pode solicitar exclusão dos dados" | NÃO mudam | deleteAccount (S173) passa a apagar também anúncios/chats de Classificados, o que é coerente com a declaração de exclusão já existente |
| Compartilhamento com terceiros | Firebase e Expo como processadores | NÃO muda | Já declarados; Classificados não introduz novo terceiro |

Conclusão Play: se "Fotos", "Outras mensagens no app" e "Outro conteúdo gerado pelo usuário" já estiverem marcados com finalidade "Funcionalidade do app", NADA muda; senão, marcar só o que faltar.

## App Store Connect — App Privacy

| Categoria → Tipo | Estado esperado | Muda? | Por quê |
| --- | --- | --- | --- |
| User Content → Photos or Videos | Coletado, vinculado ao usuário SIM, usado para rastreamento NÃO, finalidade "App Functionality" | NÃO muda | Já deveria estar declarado por fotos de perfil/chat |
| User Content → Emails or Text Messages | Mensagens do chat de anúncio, mesmas flags acima | NÃO muda | Já deveria estar declarado pelo chat existente |
| User Content → Other User Content | Anúncios (título, descrição, preço, categoria, UF) | CONFERIR/marcar se não estiver | Conteúdo gerado pelo usuário, visível a terceiros (membros verificados) |
| User Content → Customer Support | Denúncias/suporte | NÃO muda | Já deveria estar declarado; denúncia de anúncio/chat usa a mesma fila |
| Location → Coarse Location | — | NÃO | UF é digitada, não é localização do dispositivo |
| Purchases → Purchase History | — | NÃO | Sem transação no app |
| Identifiers / Usage Data / Diagnostics | — | NÃO mudam | Classificados não introduz identificador ou rastreamento novo |

Conclusão Apple: idem — só "Other User Content" pode faltar.

## Texto da ficha (opcional, sem obrigação de mudar)
- Nenhuma mudança obrigatória na descrição da loja; se a ficha listar funcionalidades, "Classificados entre membros verificados" pode entrar.

## Pendente de deploy
- `firebase deploy --only hosting` (privacidade.html) — fica com o Raphael, junto do deploy de functions:deleteAccount (S173).
