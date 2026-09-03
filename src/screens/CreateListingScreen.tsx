// src/screens/CreateListingScreen.tsx
//
// S168-A — formulário de criação/edição de anúncio de classificados. Molde
// de formulário de CreateGroupScreen.tsx (chips + TextInput + botão de
// enviar) + seleção de foto de MomentoComposerModal.tsx (Alert com "Tirar
// foto"/"Escolher da galeria", pickFromCamera/pickFromGallery). Edição:
// sempre volta pra 'pending' (updateListingContent já garante isso), aviso
// explícito no botão de enviar.
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import {
  createListing,
  getListing,
  LISTING_CATEGORIES,
  ListingPriceType,
  PROHIBITED_ITEMS,
  updateListingContent,
  uploadListingPhoto,
} from '@/services/listingService';
import { pickFromCamera, pickFromGallery } from '@/utils/pickPhoto';
import { getDisplayName } from '@/utils/profile';
import { countCodePoints } from '@/utils/text';

type CreateListingScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateListing'>;

export const MAX_LISTING_TITLE_LENGTH = 80;
export const MAX_LISTING_DESCRIPTION_LENGTH = 1000;
export const MAX_LISTING_PRICE = 10000000;
export const MAX_LISTING_PHOTOS = 3;

const PRICE_TYPE_OPTIONS: { value: ListingPriceType; label: string }[] = [
  { value: 'fixed', label: 'Preço fixo' },
  { value: 'negotiable', label: 'A combinar' },
  { value: 'donation', label: 'Doação' },
];

// Foto em edição: pode já estar no Storage (remota, veio de um anúncio
// existente) ou ser uma URI local recém-escolhida, ainda não enviada — só
// sobe pro Storage no submit (uploadListingPhoto), nunca antes.
interface DraftPhoto {
  uri: string;
  isNew: boolean;
}

export default function CreateListingScreen({ route, navigation }: CreateListingScreenProps) {
  const listingId = route.params?.listingId;
  const isEditing = !!listingId;
  const { user, profile } = useAuth();

  const [loadingListing, setLoadingListing] = useState(isEditing);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<ListingPriceType | null>(null);
  const [price, setPrice] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    getListing(listingId).then((listing) => {
      if (cancelled) return;
      if (!listing || listing.ownerId !== user?.uid) {
        Alert.alert('Erro', 'Não foi possível abrir este anúncio para edição.');
        if (navigation.canGoBack()) navigation.goBack();
        return;
      }
      setTitle(listing.title);
      setDescription(listing.description);
      setCategory(listing.category);
      setPriceType(listing.priceType);
      setPrice(listing.priceType === 'fixed' && listing.price != null ? String(listing.price) : '');
      setPhotos(listing.photos.map((uri) => ({ uri, isNew: false })));
      setLoadingListing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, user?.uid, navigation]);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const parsedPrice = Number(price.replace(',', '.'));
  const missingUf = !isEditing && !profile?.uf;

  const canSubmit =
    !loadingListing &&
    !submitting &&
    !missingUf &&
    countCodePoints(trimmedTitle) > 0 &&
    countCodePoints(trimmedTitle) <= MAX_LISTING_TITLE_LENGTH &&
    countCodePoints(trimmedDescription) > 0 &&
    countCodePoints(trimmedDescription) <= MAX_LISTING_DESCRIPTION_LENGTH &&
    category != null &&
    priceType != null &&
    (priceType !== 'fixed' || (parsedPrice > 0 && parsedPrice <= MAX_LISTING_PRICE));

  const handleAddPhoto = () => {
    if (photos.length >= MAX_LISTING_PHOTOS) {
      Alert.alert('Limite atingido', `Você pode adicionar no máximo ${MAX_LISTING_PHOTOS} fotos.`);
      return;
    }
    Alert.alert('Adicionar foto', undefined, [
      {
        text: 'Tirar foto',
        onPress: async () => {
          const result = await pickFromCamera();
          if (result.uri)
            setPhotos((prev) => [...prev, { uri: result.uri as string, isNew: true }]);
        },
      },
      {
        text: 'Escolher da galeria',
        onPress: async () => {
          const result = await pickFromGallery();
          if (result.uri)
            setPhotos((prev) => [...prev, { uri: result.uri as string, isNew: true }]);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  };

  const handleSubmit = async () => {
    if (!user || !profile || !canSubmit || category == null || priceType == null) return;
    setSubmitting(true);
    try {
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        uploadedPhotos.push(
          photo.isNew ? await uploadListingPhoto(user.uid, photo.uri) : photo.uri,
        );
      }
      const priceValue = priceType === 'fixed' ? parsedPrice : undefined;

      if (listingId) {
        await updateListingContent(listingId, {
          title: trimmedTitle,
          description: trimmedDescription,
          priceType,
          price: priceValue,
          category,
          photos: uploadedPhotos,
        });
        Alert.alert('Anúncio atualizado', 'Suas alterações foram enviadas para nova análise.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        await createListing({
          ownerId: user.uid,
          ownerNickname: getDisplayName(profile),
          uf: profile.uf as string,
          title: trimmedTitle,
          description: trimmedDescription,
          priceType,
          price: priceValue,
          category,
          photos: uploadedPhotos,
        });
        Alert.alert(
          'Enviado para aprovação',
          'Seu anúncio entra no ar assim que a moderação aprovar.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    } catch (err) {
      console.error('[CreateListingScreen] falha ao salvar anúncio:', err);
      Alert.alert('Erro', 'Não foi possível salvar o anúncio. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>{isEditing ? 'Editar anúncio' : 'Anunciar'}</Text>
          <View style={styles.backBtn} />
        </View>

        {loadingListing ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {missingUf && (
                <View style={styles.warningBox}>
                  <Ionicons name="alert-circle-outline" size={20} color={theme.colors.error} />
                  <Text style={styles.warningText}>
                    Defina seu estado no perfil antes de anunciar.
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Título</Text>
              <TextInput
                style={styles.inputSingle}
                placeholder="Ex.: Bicicleta aro 29"
                placeholderTextColor={theme.colors.textLight}
                value={title}
                onChangeText={setTitle}
                maxLength={MAX_LISTING_TITLE_LENGTH}
                editable={!submitting}
              />
              <Text style={styles.charCount}>
                {countCodePoints(title)}/{MAX_LISTING_TITLE_LENGTH}
              </Text>

              <Text style={styles.label}>Descrição</Text>
              <TextInput
                style={styles.input}
                placeholder="Descreva o item ou serviço, estado de conservação, etc."
                placeholderTextColor={theme.colors.textLight}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={MAX_LISTING_DESCRIPTION_LENGTH}
                editable={!submitting}
              />
              <Text style={styles.charCount}>
                {countCodePoints(description)}/{MAX_LISTING_DESCRIPTION_LENGTH}
              </Text>

              <Text style={styles.label}>Categoria</Text>
              <View style={styles.chipRow}>
                {LISTING_CATEGORIES.map((option) => {
                  const active = category === option.key;
                  return (
                    <AnimatedPressable
                      key={option.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCategory(option.key)}
                      disabled={submitting}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Preço</Text>
              <View style={styles.chipRow}>
                {PRICE_TYPE_OPTIONS.map((option) => {
                  const active = priceType === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setPriceType(option.value)}
                      disabled={submitting}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
              {priceType === 'fixed' && (
                <TextInput
                  style={styles.inputSingle}
                  placeholder="Valor em R$"
                  placeholderTextColor={theme.colors.textLight}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  editable={!submitting}
                />
              )}

              <Text style={styles.label}>
                Fotos ({photos.length}/{MAX_LISTING_PHOTOS})
              </Text>
              <View style={styles.photoRow}>
                {photos.map((photo) => (
                  <View key={photo.uri} style={styles.photoThumbWrap}>
                    <AnimatedPressable
                      style={styles.photoRemoveBtn}
                      onPress={() => handleRemovePhoto(photo.uri)}
                      disabled={submitting}
                    >
                      <Ionicons name="close" size={14} color={theme.colors.white} />
                    </AnimatedPressable>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.photoThumb}
                      contentFit="cover"
                    />
                  </View>
                ))}
                {photos.length < MAX_LISTING_PHOTOS && (
                  <AnimatedPressable
                    style={styles.photoAddBtn}
                    onPress={handleAddPhoto}
                    disabled={submitting}
                  >
                    <Ionicons name="camera-outline" size={24} color={theme.colors.primary} />
                  </AnimatedPressable>
                )}
              </View>

              <View style={styles.prohibitedBox}>
                <Text style={styles.prohibitedTitle}>Itens proibidos nos classificados</Text>
                {PROHIBITED_ITEMS.map((item) => (
                  <Text key={item} style={styles.prohibitedItem}>
                    • {item}
                  </Text>
                ))}
                <Text style={styles.prohibitedNotice}>
                  Todo anúncio passa por aprovação prévia da moderação antes de ficar visível.
                </Text>
              </View>

              <AnimatedPressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {isEditing ? 'Salvar (volta para análise)' : 'Enviar para aprovação'}
                  </Text>
                )}
              </AnimatedPressable>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  content: { padding: theme.spacing.md },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: theme.spacing.md,
  },
  warningText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.error,
    fontWeight: '600',
  },

  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  inputSingle: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.md,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.md },
  chip: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.white },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: theme.spacing.md },
  photoThumbWrap: { width: 84, height: 84 },
  photoThumb: {
    width: 84,
    height: 84,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    overflow: 'hidden',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddBtn: {
    width: 84,
    height: 84,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  prohibitedBox: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    gap: 4,
  },
  prohibitedTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  prohibitedItem: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  prohibitedNotice: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: 8,
    fontStyle: 'italic',
  },

  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 15,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
});
