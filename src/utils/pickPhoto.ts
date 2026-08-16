// src/utils/pickPhoto.ts
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

// S120 — opções idênticas às já usadas no app: aspect/quality de
// ProfileScreen.tsx:336 (galeria) e cameraType/aspect/quality de
// VerificationScreen.tsx:120-125 (selfie), replicadas aqui, não inventadas,
// pra virar helper único reaproveitado pelo Step 4 do cadastro e pelo modal
// de conta legada sem foto.
const PICKER_OPTIONS = {
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 0.7,
};

// S120 — `uri: null` sozinho não dizia se o usuário CANCELOU (silencioso, é
// o comportamento correto) ou teve a PERMISSÃO NEGADA (precisa de feedback).
// `reason` só existe quando `uri` é null — chamador que só olha `.uri`
// continua funcionando igual antes (uri truthy = sucesso, falsy = não fez).
export type PickPhotoResult =
  { uri: string; reason?: undefined } | { uri: null; reason: 'canceled' | 'permission_denied' };

export const pickFromCamera = async (): Promise<PickPhotoResult> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações.');
    return { uri: null, reason: 'permission_denied' };
  }
  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    ...PICKER_OPTIONS,
  });
  if (result.canceled || !result.assets[0]) return { uri: null, reason: 'canceled' };
  return { uri: result.assets[0].uri };
};

export const pickFromGallery = async (): Promise<PickPhotoResult> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações.');
    return { uri: null, reason: 'permission_denied' };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    ...PICKER_OPTIONS,
  });
  if (result.canceled || !result.assets[0]) return { uri: null, reason: 'canceled' };
  return { uri: result.assets[0].uri };
};
