// src/screens/ProfileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { SkeletonPlaceholder } from '@/components/SkeletonPlaceholder';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { storage } from '@/services/firebase';
import { updateUserProfile, Gender } from '@/services/firestoreService';

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

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, profile, logout, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(String(profile?.age ?? ''));
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [gender, setGender] = useState<Gender | undefined>(profile?.gender);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
        gender,
      });
      await refreshProfile();
      setEditing(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();

      if (!user?.uid) throw new Error('User ID not available');
      const storageRef = ref(storage, `avatars/${user.uid}.jpg`);
      await uploadBytes(storageRef, blob);
      const photoURL = await getDownloadURL(storageRef);

      await updateUserProfile(user.uid, { photoURL });
      await refreshProfile();
      Alert.alert('Sucesso!', 'Foto atualizada!');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Erro desconhecido';
      Alert.alert('Erro', 'Não foi possível salvar a foto: ' + errorMsg);
    } finally {
      setUploadingPhoto(false);
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

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <AnimatedPressable
            onPress={handlePickPhoto}
            style={styles.avatarWrap}
            disabled={uploadingPhoto}
          >
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
            <View style={styles.cameraBtn}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={theme.colors.onSecondary} />
              ) : (
                <Ionicons name="camera" size={16} color={theme.colors.onSecondary} />
              )}
            </View>
          </AnimatedPressable>
          {!editing && (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{profile?.name}</Text>
                {profile?.verified && <VerifiedBadge size={18} />}
              </View>
              <Text style={styles.profileAge}>{profile?.age} anos</Text>
            </>
          )}
        </View>

        {/* Stats */}
        {!editing && (
          <View style={styles.statsRow}>
            <StatCard label="Curtidas" value="0" icon="heart" />
            <StatCard label="Matches" value="0" icon="people" />
            <StatCard label="Mensagens" value="0" icon="chatbubble" />
          </View>
        )}

        {/* Photos */}
        {!editing && (
          <View style={styles.photosCard}>
            <PhotoCarousel
              photos={
                profile.photos?.length ? profile.photos : profile.photoURL ? [profile.photoURL] : []
              }
              style={styles.photosCarousel}
            />
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
          </View>
        )}

        {/* Verificação de perfil */}
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

        {/* Logout */}
        <AnimatedPressable style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.nope} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </AnimatedPressable>
      </ScrollView>
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

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.secondary,
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
  profileAge: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },

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
  photosCard: {
    height: 260,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  photosCarousel: { flex: 1 },
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
});
