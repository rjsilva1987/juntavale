// src/screens/ProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { UfPicker } from '@/components/UfPicker';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ADMIN_UID } from '@/config/admin';
import { LOOKING_FOR_LABELS } from '@/constants/lookingFor';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import {
  PROMPTS_CATALOG,
  MAX_PROMPTS,
  MAX_ANSWER_LENGTH,
  getPromptText,
  getWeeklyPrompt,
  type PromptId,
  type WeeklyPromptId,
} from '@/constants/prompts';
import { theme } from '@/constants/theme';
import { UF } from '@/constants/ufs';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveMatches, MatchWithProfile } from '@/hooks/useActiveMatches';
import { useLikers } from '@/hooks/useLikers';
import { RootStackParamList } from '@/navigation';
import {
  updateUserProfile,
  addProfilePhoto,
  removeProfilePhoto,
  setPrincipalPhoto,
  uploadProfilePhoto,
  MAX_PROFILE_PHOTOS,
  Gender,
} from '@/services/firestoreService';

// Ambas contam o mesmo array de matches visíveis hoje (todo match é uma
// conversa no modelo atual), mas ficam como funções separadas de propósito:
// se "Conversas" um dia passar a significar só conversas com mensagem real
// (fora o placeholder inicial "Digam olá"), o filtro entra só aqui, sem
// mexer em countActiveMatches nem no card "Matches".
const countActiveMatches = (matches: MatchWithProfile[]): number => matches.length;
const countActiveConversations = (matches: MatchWithProfile[]): number => matches.length;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Masculino', value: 'masculino' },
  { label: 'Feminino', value: 'feminino' },
  { label: 'Outro', value: 'outro' },
];

const INTERESTS = [
  'Investimentos',
  'Poupança',
  'Viagens',
  'Gastronomia',
  'Esportes',
  'Tecnologia',
  'Arte',
  'Música',
  'Cinema',
  'Leitura',
  'Pets',
  'Fitness',
];

// S48 — "Meus lugares" e "No meu radar": texto livre, sem catálogo (ver
// TagEditor abaixo). Limites batem com firestore.rules (isValidProfile):
// tamanho de lista validado no servidor, tamanho de cada tag só no client.
const MAX_PLACES = 5;
const MAX_EVENTS = 3;
const MAX_PLACE_LENGTH = 40;
const MAX_EVENT_LENGTH = 60;
const MIN_TAG_LENGTH = 2;

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, profile, logout, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(String(profile?.age ?? ''));
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [places, setPlaces] = useState<string[]>(profile?.places ?? []);
  const [events, setEvents] = useState<string[]>(profile?.events ?? []);
  const [gender, setGender] = useState<Gender | undefined>(profile?.gender);
  // S44 — contas legadas sem uf conseguem definir pela 1ª vez aqui; uma vez
  // setado, não há botão de "limpar" (só troca entre as 27), então nunca
  // fica vazio de novo depois de definido.
  const [uf, setUf] = useState<UF | undefined>(profile?.uf);
  const [saving, setSaving] = useState(false);
  const [photoActionPending, setPhotoActionPending] = useState(false);
  const [reengagementSaving, setReengagementSaving] = useState(false);

  // Prompts (S33) — editados via modais próprios, fora do form de
  // nome/idade/bio/gênero/interesses acima. Sempre grava o array completo
  // (substituição, não merge por item), reaproveitando updateUserProfile.
  const userPrompts = profile?.prompts ?? [];
  const [catalogModalVisible, setCatalogModalVisible] = useState(false);
  const [answerModalVisible, setAnswerModalVisible] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<PromptId | WeeklyPromptId | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  // Prompt da semana (S50) — mesmo array `prompts[]` de cima, rotação
  // automática por data (getWeeklyPrompt), sem estado próprio na tela.
  const currentWeeklyPrompt = getWeeklyPrompt(new Date());
  const weeklyPromptEntry = userPrompts.find((p) => p.id === currentWeeklyPrompt.id);

  // Card "Curtidas" — mesma query de LikesScreen, via hook compartilhado.
  const { likers, loading: likersLoading } = useLikers();

  // Cards "Matches" e "Conversas" — mesmo hook usado em MatchesScreen, só
  // que aqui só usamos as contagens, não a lista.
  const { matches: activeMatches, loading: matchesLoading } = useActiveMatches();
  const matchesCount = countActiveMatches(activeMatches);
  const conversasCount = countActiveConversations(activeMatches);

  const toggleInterest = (item: string) => {
    setInterests((prev) =>
      prev.includes(item)
        ? prev.filter((i) => i !== item)
        : prev.length < 5
          ? [...prev, item]
          : prev,
    );
  };

  const handleSave = async () => {
    if (!user) return;
    if (!gender) {
      Alert.alert('Gênero obrigatório', 'Selecione uma opção de gênero antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        name,
        age: Number(age),
        bio,
        interests,
        places,
        events,
        gender,
        // Omitido quando ainda indefinido (conta legada que não escolheu um
        // estado nesta edição) — Firestore rejeita valor `undefined` num
        // update, e as rules toleram a chave ausente igual antes.
        ...(uf ? { uf } : {}),
      });
      await refreshProfile();
      setEditing(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const photos = profile?.photos ?? [];

  const handleAddPhoto = async () => {
    if (!user) return;
    if (photos.length >= MAX_PROFILE_PHOTOS) {
      Alert.alert('Limite atingido', `Você pode ter no máximo ${MAX_PROFILE_PHOTOS} fotos.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setPhotoActionPending(true);
    try {
      const url = await uploadProfilePhoto(user.uid, result.assets[0].uri);
      await addProfilePhoto(user.uid, photos, url);
      await refreshProfile();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Erro desconhecido';
      Alert.alert('Erro', 'Não foi possível salvar a foto: ' + errorMsg);
    } finally {
      setPhotoActionPending(false);
    }
  };

  const handleSetPrincipalPhoto = async (url: string) => {
    if (!user) return;
    setPhotoActionPending(true);
    try {
      await setPrincipalPhoto(user.uid, photos, url);
      await refreshProfile();
    } catch {
      Alert.alert('Erro', 'Não foi possível definir a foto principal.');
    } finally {
      setPhotoActionPending(false);
    }
  };

  const handleRemovePhoto = (url: string) => {
    if (!user) return;
    Alert.alert('Remover foto?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setPhotoActionPending(true);
          try {
            await removeProfilePhoto(user.uid, photos, url);
            await refreshProfile();
          } catch {
            Alert.alert('Erro', 'Não foi possível remover a foto.');
          } finally {
            setPhotoActionPending(false);
          }
        },
      },
    ]);
  };

  // Lembretes e sugestões (S44c) — opt-OUT do re-engajamento por push (S44b,
  // ainda não existe). O Switch NÃO reflete local otimista: value vem
  // sempre de profile?.reengagementOptOut, então se o write falhar o
  // Switch nunca chegou a se mover — mesmo padrão de "aguardar o write"
  // usado no resto desta tela (handleSetPrincipalPhoto, handleRemovePhoto).
  const handleToggleReengagement = async (value: boolean) => {
    if (!user) return;
    setReengagementSaving(true);
    try {
      await updateUserProfile(user.uid, { reengagementOptOut: !value });
      await refreshProfile();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar essa preferência.');
    } finally {
      setReengagementSaving(false);
    }
  };

  const openAddPrompt = () => {
    if (userPrompts.length >= MAX_PROMPTS) return;
    setCatalogModalVisible(true);
  };

  const handlePickPrompt = (id: PromptId) => {
    setEditingPromptId(id);
    setAnswerDraft('');
    setCatalogModalVisible(false);
    setAnswerModalVisible(true);
  };

  const handleOpenExistingPrompt = (item: { id: string; answer: string }) => {
    setEditingPromptId(item.id as PromptId | WeeklyPromptId);
    setAnswerDraft(item.answer);
    setAnswerModalVisible(true);
  };

  // Prompt da semana (S50) — mesmo fluxo de edição de handleOpenExistingPrompt
  // acima, só que aceita o caso "ainda não respondido" (weeklyPromptEntry
  // undefined ⇒ draft vazio, handleSavePromptAnswer grava como item novo).
  const openWeeklyPrompt = () => {
    setEditingPromptId(currentWeeklyPrompt.id);
    setAnswerDraft(weeklyPromptEntry?.answer ?? '');
    setAnswerModalVisible(true);
  };

  const closeAnswerModal = () => {
    setAnswerModalVisible(false);
    setEditingPromptId(null);
    setAnswerDraft('');
  };

  const handleSavePromptAnswer = async () => {
    if (!user || !editingPromptId) return;
    const trimmed = answerDraft.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_ANSWER_LENGTH) return;
    setPromptSaving(true);
    try {
      const existingIndex = userPrompts.findIndex((p) => p.id === editingPromptId);
      const nextPrompts =
        existingIndex >= 0
          ? userPrompts.map((p, i) =>
              i === existingIndex ? { id: editingPromptId, answer: trimmed } : p,
            )
          : [...userPrompts, { id: editingPromptId, answer: trimmed }];
      await updateUserProfile(user.uid, { prompts: nextPrompts });
      await refreshProfile();
      closeAnswerModal();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a resposta.');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleRemovePrompt = async () => {
    if (!user || !editingPromptId) return;
    setPromptSaving(true);
    try {
      const nextPrompts = userPrompts.filter((p) => p.id !== editingPromptId);
      await updateUserProfile(user.uid, { prompts: nextPrompts });
      await refreshProfile();
      closeAnswerModal();
    } catch {
      Alert.alert('Erro', 'Não foi possível remover o prompt.');
    } finally {
      setPromptSaving(false);
    }
  };

  if (!profile) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Meu Perfil</Text>
        </View>
        <View style={styles.avatarSection}>
          <SkeletonPlaceholder
            width={100}
            height={100}
            borderRadius={50}
            style={{ marginBottom: 12 }}
          />
          <SkeletonPlaceholder
            width={140}
            height={20}
            borderRadius={theme.borderRadius.sm}
            style={{ marginBottom: 8 }}
          />
          <SkeletonPlaceholder width={80} height={14} borderRadius={theme.borderRadius.sm} />
        </View>
        <View style={styles.card}>
          <SkeletonPlaceholder
            width={100}
            height={14}
            borderRadius={theme.borderRadius.sm}
            style={{ marginBottom: 12 }}
          />
          <SkeletonPlaceholder
            width="100%"
            height={16}
            borderRadius={theme.borderRadius.sm}
            style={{ marginBottom: 8 }}
          />
          <SkeletonPlaceholder width="80%" height={16} borderRadius={theme.borderRadius.sm} />
        </View>
      </ScrollView>
    );
  }

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Meu Perfil</Text>
          <AnimatedPressable onPress={() => setEditing(!editing)}>
            <Ionicons
              name={editing ? 'close' : 'create-outline'}
              size={24}
              color={theme.colors.primary}
            />
          </AnimatedPressable>
        </View>

        {/* Avatar — só exibe a principal (photos[0]/photoURL); edição de
            fotos acontece só na grade abaixo, um único caminho de edição. */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {profile?.photoURL ? (
              <Image
                source={{ uri: profile.photoURL }}
                style={styles.avatar}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                transition={200}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarEmoji}>😊</Text>
              </View>
            )}
          </View>
          {!editing && (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{profile?.name}</Text>
                {profile?.verified && <VerifiedBadge size={18} />}
              </View>
              <Text style={styles.profileAge}>{profile?.age} anos</Text>
              {profile?.lookingFor && (
                <View style={styles.lookingForBadge}>
                  <Text style={styles.lookingForBadgeText}>
                    {LOOKING_FOR_LABELS[profile.lookingFor]}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Stats */}
        {!editing && (
          <View style={styles.statsRow}>
            <StatCard
              label="Curtidas"
              value={likers.length}
              loading={likersLoading}
              icon="heart"
              onPress={() => navigation.navigate('Main', { screen: 'Curtidas' })}
            />
            <StatCard
              label="Matches"
              value={matchesCount}
              loading={matchesLoading}
              icon="people"
              onPress={() => navigation.navigate('MatchesGrid')}
            />
            <StatCard
              label="Conversas"
              value={conversasCount}
              loading={matchesLoading}
              icon="chatbubble"
              onPress={() => navigation.navigate('Main', { screen: 'Conversas' })}
            />
          </View>
        )}

        {/* Photos — grade 2x2: única superfície de edição (adicionar, definir
            principal, remover). photos[0] é sempre a principal. */}
        {!editing && (
          <View style={styles.photosGrid}>
            {Array.from({ length: MAX_PROFILE_PHOTOS }).map((_, index) => {
              const url = photos[index];
              if (!url) {
                return (
                  <AnimatedPressable
                    key={`empty-${index}`}
                    style={styles.photoTileEmpty}
                    onPress={handleAddPhoto}
                    disabled={photoActionPending}
                  >
                    <Ionicons name="add" size={32} color={theme.colors.primary} />
                  </AnimatedPressable>
                );
              }
              const isPrincipal = index === 0;
              return (
                <View key={url} style={styles.photoTile}>
                  <Image
                    source={{ uri: url }}
                    style={styles.photoTileImage}
                    contentFit="cover"
                    placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                    transition={200}
                  />
                  {isPrincipal && (
                    <View style={styles.principalBadge}>
                      <Text style={styles.principalBadgeText}>Principal</Text>
                    </View>
                  )}
                  <View style={styles.photoTileActions}>
                    {!isPrincipal && (
                      <AnimatedPressable
                        style={[
                          styles.photoTileActionBtn,
                          photoActionPending && styles.photoTileActionBtnDisabled,
                        ]}
                        onPress={() => handleSetPrincipalPhoto(url)}
                        disabled={photoActionPending}
                      >
                        <Ionicons name="star" size={16} color={theme.colors.white} />
                      </AnimatedPressable>
                    )}
                    <AnimatedPressable
                      style={[
                        styles.photoTileActionBtn,
                        photoActionPending && styles.photoTileActionBtnDisabled,
                      ]}
                      onPress={() => handleRemovePhoto(url)}
                      disabled={photoActionPending}
                    >
                      <Ionicons name="close" size={16} color={theme.colors.white} />
                    </AnimatedPressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Edit form */}
        {editing ? (
          <View style={styles.card}>
            <Field label="Nome" value={name} onChange={setName} />
            <Field label="Idade" value={age} onChange={setAge} keyboardType="number-pad" />
            <Field label="Bio" value={bio} onChange={setBio} multiline />

            <Text style={styles.fieldLabel}>Gênero</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((option) => {
                const active = gender === option.value;
                return (
                  <AnimatedPressable
                    key={option.value}
                    style={[styles.genderOption, active && styles.genderOptionActive]}
                    onPress={() => setGender(option.value)}
                  >
                    <Text style={[styles.genderText, active && styles.genderTextActive]}>
                      {option.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Estado onde você mora</Text>
            <UfPicker value={uf ?? null} onChange={(item) => setUf(item as UF)} />

            <Text style={styles.fieldLabel}>Interesses (máx. 5)</Text>
            <View style={styles.tags}>
              {INTERESTS.map((item) => {
                const active = interests.includes(item);
                return (
                  <AnimatedPressable
                    key={item}
                    style={[styles.tag, active && styles.tagActive]}
                    onPress={() => toggleInterest(item)}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>{item}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <TagEditor
              label="Meus lugares"
              values={places}
              maxItems={MAX_PLACES}
              maxLength={MAX_PLACE_LENGTH}
              placeholder="Ex: Praia do Forte"
              onAdd={(value) => setPlaces((prev) => [...prev, value])}
              onRemove={(value) => setPlaces((prev) => prev.filter((p) => p !== value))}
            />

            <TagEditor
              label="No meu radar"
              values={events}
              maxItems={MAX_EVENTS}
              maxLength={MAX_EVENT_LENGTH}
              placeholder="Ex: Show do Jorge & Mateus"
              onAdd={(value) => setEvents((prev) => [...prev, value])}
              onRemove={(value) => setEvents((prev) => prev.filter((e) => e !== value))}
            />

            <AnimatedPressable
              style={[styles.saveBtn, !gender && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !gender}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.onSecondary} />
              ) : (
                <Text style={styles.saveBtnText}>Salvar alterações</Text>
              )}
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Sobre mim</Text>
            <Text style={styles.bioText}>
              {profile?.bio || 'Nenhuma bio ainda. Toque em editar!'}
            </Text>

            {(profile?.interests?.length ?? 0) > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Interesses</Text>
                <View style={styles.tags}>
                  {profile?.interests?.map((item) => (
                    <View key={item} style={styles.tagActive}>
                      <Text style={styles.tagTextActive}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {(profile?.places?.length ?? 0) > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Meus lugares</Text>
                <View style={styles.tags}>
                  {profile?.places?.map((item) => (
                    <View key={item} style={styles.tagActive}>
                      <Text style={styles.tagTextActive}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {(profile?.events?.length ?? 0) > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>No meu radar</Text>
                <View style={styles.tags}>
                  {profile?.events?.map((item) => (
                    <View key={item} style={styles.tagActive}>
                      <Text style={styles.tagTextActive}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Prompt da semana (S50) — rotação automática por data, destacada no
            topo da área de prompts. Resposta grava no MESMO array `prompts[]`
            de baixo (decisão fechada): quando a semana vira, o convite
            rotaciona, mas a resposta antiga permanece no perfil como um
            prompt normal (sem tratamento especial). */}
        {!editing && (
          <View style={[styles.card, styles.weeklyPromptCard]}>
            <View style={styles.weeklyPromptHeader}>
              <Ionicons name="calendar-outline" size={14} color={theme.colors.onSecondary} />
              <Text style={styles.weeklyPromptLabel}>Prompt da semana</Text>
            </View>
            <Text style={styles.weeklyPromptQuestion}>{currentWeeklyPrompt.text}</Text>

            {weeklyPromptEntry ? (
              <AnimatedPressable style={styles.weeklyPromptAnswerBox} onPress={openWeeklyPrompt}>
                <Text style={styles.promptAnswer}>{weeklyPromptEntry.answer}</Text>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
              </AnimatedPressable>
            ) : (
              <AnimatedPressable style={styles.weeklyPromptCta} onPress={openWeeklyPrompt}>
                <Text style={styles.weeklyPromptCtaText}>Responder</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Prompts (S33) — edição via modais próprios, independente do form
            de nome/idade/bio/gênero/interesses acima (mesmo padrão da grade
            de fotos: só visível fora do modo de edição). */}
        {!editing && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Perguntas</Text>
            <Text style={styles.promptsSubtitle}>Escolha até 4 perguntas para o seu perfil</Text>

            {userPrompts.map((item) => (
              <AnimatedPressable
                key={item.id}
                style={styles.promptCard}
                onPress={() => handleOpenExistingPrompt(item)}
              >
                <View style={styles.promptCardText}>
                  <Text style={styles.promptQuestion}>{getPromptText(item.id)}</Text>
                  <Text style={styles.promptAnswer}>{item.answer}</Text>
                </View>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
              </AnimatedPressable>
            ))}

            {userPrompts.length < MAX_PROMPTS && (
              <AnimatedPressable style={styles.addPromptBtn} onPress={openAddPrompt}>
                <Ionicons name="add" size={18} color={theme.colors.primary} />
                <Text style={styles.addPromptText}>Adicionar</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Verificação de perfil — ponto de entrada permanente: 'Verification'
            existe no grupo "app" independente de `verified`, então navega
            sempre, mesmo já verificado (a própria tela mostra o estado
            "Perfil verificado!" nesse caso). */}
        <AnimatedPressable
          style={styles.blockedUsersBtn}
          onPress={() => navigation.navigate('Verification')}
        >
          <Ionicons
            name={profile?.verified ? 'shield-checkmark' : 'shield-checkmark-outline'}
            size={20}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.blockedUsersText}>
            {profile?.verified ? 'Perfil verificado' : 'Verificar perfil'}
          </Text>
        </AnimatedPressable>

        {/* Usuários bloqueados */}
        <AnimatedPressable
          style={styles.blockedUsersBtn}
          onPress={() => navigation.navigate('BlockedUsers')}
        >
          <Ionicons name="ban-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.blockedUsersText}>Usuários bloqueados</Text>
        </AnimatedPressable>

        {/* Lembretes e sugestões (S44c) — opt-OUT do re-engajamento por push
            (S44b, ainda não existe). Campo salvo é opt-OUT, mas o Switch
            mostra a semântica positiva: ligado = recebe lembretes (padrão,
            inclusive pra quem não tem o campo ainda). */}
        <View style={styles.reengagementCard}>
          <View style={styles.reengagementLabelRow}>
            <Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />
            <View style={styles.reengagementTexts}>
              <Text style={styles.reengagementLabel}>Lembretes e sugestões</Text>
              <Text style={styles.reengagementSubtitle}>
                Avisos de curtidas e conversas paradas quando você ficar um tempo sem entrar
              </Text>
            </View>
          </View>
          <Switch
            value={!(profile?.reengagementOptOut ?? false)}
            onValueChange={handleToggleReengagement}
            disabled={reengagementSaving}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor={theme.colors.white}
            ios_backgroundColor={theme.colors.border}
          />
        </View>

        {/* Ajuda / Fale Conosco (S36) */}
        <AnimatedPressable
          style={styles.blockedUsersBtn}
          onPress={() => navigation.navigate('Support')}
        >
          <Ionicons name="help-circle-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.blockedUsersText}>Ajuda</Text>
        </AnimatedPressable>

        {/* Painel Admin — só visível pra ADMIN_UID */}
        {user?.uid === ADMIN_UID && (
          <>
            <AnimatedPressable
              style={styles.blockedUsersBtn}
              onPress={() => navigation.navigate('AdminVerifications')}
            >
              <Ionicons name="briefcase-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.blockedUsersText}>Painel Admin</Text>
            </AnimatedPressable>

            {/* Suporte (admin) — S37 */}
            <AnimatedPressable
              style={styles.blockedUsersBtn}
              onPress={() => navigation.navigate('AdminSupport')}
            >
              <Ionicons
                name="chatbox-ellipses-outline"
                size={20}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.blockedUsersText}>Suporte (admin)</Text>
            </AnimatedPressable>
          </>
        )}

        {/* Logout */}
        <AnimatedPressable style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.nope} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </AnimatedPressable>
      </ScrollView>

      {/* Catálogo de prompts — só exibido pra adicionar um novo (prompts já
          usados ficam desabilitados/acinzentados). Editar um já respondido
          abre handleOpenExistingPrompt diretamente, sem passar por aqui. */}
      <Modal
        visible={catalogModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCatalogModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Escolha uma pergunta</Text>
              <AnimatedPressable onPress={() => setCatalogModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </AnimatedPressable>
            </View>
            <ScrollView>
              {PROMPTS_CATALOG.map((item) => {
                const used = userPrompts.some((p) => p.id === item.id);
                return (
                  <AnimatedPressable
                    key={item.id}
                    style={[styles.catalogItem, used && styles.catalogItemDisabled]}
                    onPress={() => !used && handlePickPrompt(item.id)}
                    disabled={used}
                  >
                    <Text style={[styles.catalogItemText, used && styles.catalogItemTextDisabled]}>
                      {item.text}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edição da resposta — usada tanto pra um prompt novo (vindo do
          catálogo acima) quanto pra editar/remover um já respondido. */}
      <Modal
        visible={answerModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeAnswerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingPromptId ? getPromptText(editingPromptId) : ''}
            </Text>
            <TextInput
              style={styles.promptInput}
              value={answerDraft}
              onChangeText={setAnswerDraft}
              multiline
              maxLength={MAX_ANSWER_LENGTH}
              placeholder="Sua resposta..."
              placeholderTextColor={theme.colors.textLight}
            />
            <Text
              style={[
                styles.promptCounter,
                answerDraft.trim().length === 0 && styles.promptCounterError,
              ]}
            >
              {answerDraft.length}/{MAX_ANSWER_LENGTH}
            </Text>

            <AnimatedPressable
              style={[
                styles.saveBtn,
                (promptSaving || answerDraft.trim().length === 0) && styles.saveBtnDisabled,
              ]}
              onPress={handleSavePromptAnswer}
              disabled={promptSaving || answerDraft.trim().length === 0}
            >
              {promptSaving ? (
                <ActivityIndicator color={theme.colors.onSecondary} />
              ) : (
                <Text style={styles.saveBtnText}>Salvar</Text>
              )}
            </AnimatedPressable>

            {editingPromptId && userPrompts.some((p) => p.id === editingPromptId) && (
              <AnimatedPressable
                style={styles.removePromptBtn}
                onPress={handleRemovePrompt}
                disabled={promptSaving}
              >
                <Text style={styles.removePromptText}>Remover prompt</Text>
              </AnimatedPressable>
            )}

            <AnimatedPressable
              style={styles.cancelPromptBtn}
              onPress={closeAnswerModal}
              disabled={promptSaving}
            >
              <Text style={styles.cancelPromptText}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
}

function Field({ label, value, onChange, multiline, keyboardType }: FieldProps) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={theme.colors.textLight}
      />
    </>
  );
}

// S48 — editor de tags de texto livre (sem catálogo), reaproveitado pelas
// duas seções novas ("Meus lugares" e "No meu radar"): cada instância guarda
// seu próprio rascunho, o pai só recebe onAdd/onRemove já com a tag
// aparada (trim). Mesmo padrão visual dos chips de Interesses (tag/tagActive)
// + contador de chars igual ao dos prompts (promptCounter/promptCounterError).
interface TagEditorProps {
  label: string;
  values: string[];
  maxItems: number;
  maxLength: number;
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}

function TagEditor({
  label,
  values,
  maxItems,
  maxLength,
  placeholder,
  onAdd,
  onRemove,
}: TagEditorProps) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const canAdd =
    values.length < maxItems && trimmed.length >= MIN_TAG_LENGTH && trimmed.length <= maxLength;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(trimmed);
    setDraft('');
  };

  return (
    <>
      <Text style={styles.fieldLabel}>
        {label} ({values.length}/{maxItems})
      </Text>
      {values.length > 0 && (
        <View style={styles.tags}>
          {values.map((item) => (
            <AnimatedPressable key={item} style={styles.tagActive} onPress={() => onRemove(item)}>
              <Text style={styles.tagTextActive}>{item} ✕</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
      {values.length < maxItems && (
        <>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, styles.tagInput]}
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textLight}
              maxLength={maxLength}
              onSubmitEditing={handleAdd}
            />
            <AnimatedPressable
              style={[styles.tagAddBtn, !canAdd && styles.tagAddBtnDisabled]}
              onPress={handleAdd}
              disabled={!canAdd}
            >
              <Ionicons name="add" size={20} color={theme.colors.white} />
            </AnimatedPressable>
          </View>
          <Text
            style={[
              styles.promptCounter,
              trimmed.length > 0 && trimmed.length < MIN_TAG_LENGTH && styles.promptCounterError,
            ]}
          >
            {draft.length}/{maxLength}
          </Text>
        </>
      )}
    </>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  loading?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

function StatCard({ label, value, loading, icon, onPress }: StatCardProps) {
  return (
    <AnimatedPressable style={styles.statCard} onPress={onPress}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      {loading ? (
        <SkeletonPlaceholder
          width={24}
          height={theme.fontSize.lg}
          borderRadius={theme.borderRadius.sm}
          style={{ marginTop: 4 }}
        />
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 40 },

  header: {
    backgroundColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 16,
  },
  title: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.white,
  },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  avatarEmoji: { fontSize: 44 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  profileAge: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },
  lookingForBadge: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  lookingForBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '700',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    paddingVertical: 14,
    ...theme.shadows.medium,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 4,
  },
  statLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },

  card: {
    backgroundColor: theme.colors.white,
    margin: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  photoTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoTileImage: { width: '100%', height: '100%' },
  photoTileEmpty: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  principalBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  principalBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
  photoTileActions: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    gap: 6,
  },
  photoTileActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTileActionBtnDisabled: { opacity: 0.5 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bioText: { fontSize: theme.fontSize.md, color: theme.colors.text, lineHeight: 22 },

  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },

  genderRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: 8,
  },
  genderOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  genderText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '600' },
  genderTextActive: { color: theme.colors.onPrimary },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tag: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagActive: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  tagTextActive: { fontSize: theme.fontSize.sm, color: theme.colors.white, fontWeight: '600' },

  tagInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  tagInput: { flex: 1 },
  tagAddBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddBtnDisabled: { opacity: 0.4 },

  saveBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.onSecondary },

  blockedUsersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
  },
  blockedUsersText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },

  reengagementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  reengagementLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    flex: 1,
  },
  reengagementTexts: { flex: 1 },
  reengagementLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  reengagementSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: theme.spacing.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.nope,
    borderRadius: theme.borderRadius.full,
  },
  logoutText: { color: theme.colors.nope, fontSize: theme.fontSize.md, fontWeight: '600' },

  weeklyPromptCard: {
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.secondaryLight,
  },
  weeklyPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  weeklyPromptLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
  weeklyPromptQuestion: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  weeklyPromptAnswerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  weeklyPromptCta: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  weeklyPromptCtaText: {
    color: theme.colors.onSecondary,
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },

  promptsSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: -4,
    marginBottom: 12,
  },
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  promptCardText: { flex: 1 },
  promptQuestion: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  promptAnswer: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    marginTop: 4,
    fontWeight: '600',
  },
  addPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    marginTop: 4,
  },
  addPromptText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },

  catalogItem: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 8,
  },
  catalogItemDisabled: { opacity: 0.4 },
  catalogItemText: { fontSize: theme.fontSize.md, color: theme.colors.text },
  catalogItemTextDisabled: { color: theme.colors.textLight },

  promptInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 100,
    textAlignVertical: 'top',
    marginTop: 12,
  },
  promptCounter: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  promptCounterError: { color: theme.colors.error },

  removePromptBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  removePromptText: { color: theme.colors.error, fontSize: theme.fontSize.md, fontWeight: '600' },

  cancelPromptBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelPromptText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
});
