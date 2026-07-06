# JuntaVale 💙💛
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
bbmatch/
├── App.tsx                        # Raiz do app
├── app.json                       # Config Expo
├── eas.json                       # Config build (lojas)
├── firestore.rules                # Regras de segurança
├── src/
│   ├── theme/index.ts             # Paleta de cores
│   ├── contexts/AuthContext.tsx   # Auth global
│   ├── services/
│   │   ├── firebase.ts            # ✅ Firebase configurado
│   │   └── firestoreService.ts    # Usuários, swipes, matches, chat
│   ├── navigation/index.tsx       # Rotas
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── RegisterScreen.tsx
│       ├── SwipeScreen.tsx        # Swipe com gestos (gesture-handler + reanimated)
│       ├── LikesScreen.tsx
│       ├── MatchesScreen.tsx
│       ├── ChatScreen.tsx         # Chat em tempo real
│       └── ProfileScreen.tsx
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

## 📦 Publicar nas lojas

### Pré-requisitos
- Conta no Expo: https://expo.dev (grátis)
- Conta Google Play Developer: $25 (única vez)
- Conta Apple Developer: $99/ano

### Comandos

```bash
# Instale o EAS CLI
npm install -g eas-cli

# Faça login no Expo
eas login

# Configure o projeto
eas init

# Build Android (Google Play)
eas build --platform android --profile production

# Build iOS (App Store)
eas build --platform ios --profile production

# Enviar para o Google Play
eas submit --platform android

# Enviar para a App Store
eas submit --platform ios
```

---

## 🎨 Paleta de cores

| Token | Hex | Uso |
|-------|-----|-----|
| `primary` | `#2F6FED` | Links, seleção, tags ativas, bolha de mensagem própria |
| `primaryLight` | `#EAF1FF` | Fundos sutis, placeholders |
| `accent` | `#FFC93C` | Botões de ação (CTA), super like, destaques |
| `like` | `#4CD964` | Curtir / status online |
| `nope` | `#FF5864` | Dispensar |

---

## 📋 Checklist final antes de publicar

- [x] Firebase configurado (`bbmatch-9ede5`)
- [ ] Ativar Authentication (e-mail/senha)
- [ ] Criar Firestore em `southamerica-east1`
- [ ] Criar Storage em `southamerica-east1`
- [ ] Publicar `firestore.rules`
- [ ] Substituir os ícones/splash em `assets/` pela identidade visual do JuntaVale (1024×1024px para `icon.png`, 1242×2436px para `splash.png`)
- [ ] Testar em dispositivo físico (Android e iOS)
- [ ] Criar contas nas lojas (Google Play / Apple)
- [ ] Rodar `eas build` e `eas submit`
