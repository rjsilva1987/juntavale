# JuntaVale 💛❤️
> App estilo Tinder, com cards de swipe, matches e chat em tempo real
> React Native (Expo) + Firebase — **projeto: bbmatch-9ede5**

---

## ✅ Firebase já configurado!

Seu projeto Firebase está conectado:
- **Project ID:** `bbmatch-9ede5`
- **Auth Domain:** `bbmatch-9ede5.firebaseapp.com`
- **Storage:** `bbmatch-9ede5.firebasestorage.app`

### Ative os serviços no console agora:

1. Acesse https://console.firebase.google.com/project/bbmatch-9ede5

2. **Authentication** → "Começar" → E-mail/senha → Ativar → Salvar

3. **Firestore Database** → "Criar banco de dados" → Modo produção → Escolha a região `southamerica-east1 (São Paulo)` → Concluir

4. **Storage** → "Começar" → Modo produção → mesma região → Concluir

5. Cole as **Regras do Firestore** (arquivo `firestore.rules`) em:
   Firestore → Regras → Editar → Publicar

---

## 🗂 Estrutura do projeto

```
juntavale/
├── App.tsx                          # Raiz do app
├── app.json                         # Config Expo
├── app.config.js                    # Wrapper de config (injeta GOOGLE_SERVICES_JSON via env)
├── eas.json                         # Config build/submit (EAS)
├── firestore.rules                  # Regras de segurança do Firestore
├── functions/                       # Cloud Functions (Firebase)
├── src/
│   ├── constants/
│   │   ├── theme.ts                 # Paleta de cores, spacing, tipografia
│   │   ├── globalStyles.ts
│   │   └── media.ts
│   ├── contexts/
│   │   └── AuthContext.tsx          # Auth global
│   ├── services/
│   │   ├── firebase.ts              # ✅ Firebase configurado
│   │   ├── firestoreService.ts      # Usuários, swipes, matches, chat
│   │   ├── notifications.ts
│   │   ├── blockService.ts
│   │   └── verificationService.ts
│   ├── hooks/
│   │   ├── useFilters.ts
│   │   ├── useNotifications.ts
│   │   └── useTypingIndicator.ts
│   ├── components/
│   │   ├── PhotoCarousel.tsx
│   │   ├── MatchModal.tsx
│   │   ├── FilterModal.tsx
│   │   ├── ReportModal.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── EmptyState.tsx
│   │   ├── SkeletonPlaceholder.tsx
│   │   ├── AnimatedPressable.tsx
│   │   └── VerifiedBadge.tsx
│   ├── navigation/
│   │   ├── index.tsx                # Rotas
│   │   ├── navigationRef.ts
│   │   └── useChatDeepLink.ts
│   ├── utils/geo.ts
│   ├── config/admin.ts
│   └── screens/
│       ├── OnboardingScreen.tsx
│       ├── LoginScreen.tsx
│       ├── RegisterScreen.tsx
│       ├── SwipeScreen.tsx          # Swipe com gestos (gesture-handler + reanimated)
│       ├── LikesScreen.tsx
│       ├── MatchesScreen.tsx
│       ├── MatchProfileScreen.tsx
│       ├── ChatScreen.tsx           # Chat em tempo real
│       ├── ProfileScreen.tsx
│       ├── VerificationScreen.tsx
│       ├── BlockedUsersScreen.tsx
│       ├── AdminVerificationsScreen.tsx
│       └── AdminVerificationDetailScreen.tsx
```

---

## 🚀 Rodar localmente (5 minutos)

```bash
# 1. Instale as dependências
npm install

# 2. Inicie o app
npx expo start

# 3. Escaneie o QR Code com o app Expo Go no seu celular
#    (disponível na App Store e Google Play)
```

---

## 🌎 Ambientes EAS (development / preview / production)

O projeto usa 3 profiles de build no `eas.json`, cada um vinculado a um ambiente de variáveis do EAS (`environment`):

| Profile | Distribution | Environment | Uso |
|---|---|---|---|
| `development` | internal | development | Dev client, testes locais em device |
| `preview` | internal (APK) | preview | Builds de teste interno, QA |
| `production` | store (AAB / IPA) | production | Build final para as lojas |

### Comandos

```bash
# Instale o EAS CLI
npm install -g eas-cli

# Faça login no Expo
eas login

# Build de desenvolvimento (dev client)
eas build --platform android --profile development

# Build de preview (APK, distribuição interna)
eas build --platform android --profile preview

# Build de produção — Android (App Bundle)
eas build --platform android --profile production

# Build de produção — iOS
eas build --platform ios --profile production

# Enviar para o Google Play
eas submit --platform android --profile production

# Enviar para a App Store
eas submit --platform ios --profile production
```

> ⚠️ O bloco `submit.production` do `eas.json` ainda tem placeholders (`appleId`, `ascAppId`, `appleTeamId`) — precisam ser preenchidos com os dados reais antes de rodar `eas submit --platform ios`.

---

## 🎨 Paleta de cores

Paleta atual definida em [`src/constants/theme.ts`](src/constants/theme.ts) — tons azul/amarelo:

| Token | Hex | Uso |
|-------|-----|-----|
| `primary` | `#2563EB` | Cor principal, botões, destaques |
| `primaryDark` | `#1E3A8A` | Variação escura do primary |
| `primaryLight` | `#DBEAFE` | Fundos sutis, placeholders |
| `secondary` | `#FBBF24` | Cor secundária, CTAs |
| `secondaryDark` | `#F59E0B` | Variação escura do secondary |
| `like` | `#3DAA6B` | Curtir / status online |
| `nope` | `#E5484D` | Dispensar |
| `superLike` | `#FBBF24` | Super like |

O splash screen e o ícone adaptativo (Android) usam `#1E3A8A` (azul escuro) como `backgroundColor`, definido no `app.json`.

---

## 📋 Checklist final antes de publicar

- [x] Firebase configurado (`bbmatch-9ede5`)
- [x] Ícones e splash definitivos em `assets/`
- [ ] Ativar Authentication (e-mail/senha)
- [ ] Criar Firestore em `southamerica-east1`
- [ ] Criar Storage em `southamerica-east1`
- [ ] Publicar `firestore.rules`
- [ ] Preencher `submit.production` no `eas.json` (Apple ID / ASC App ID / Team ID)
- [ ] Testar em dispositivo físico (Android e iOS)
- [ ] Criar contas nas lojas (Google Play / Apple)
- [ ] Rodar `eas build` e `eas submit`
