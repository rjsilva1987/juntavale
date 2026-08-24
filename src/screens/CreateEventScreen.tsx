// src/screens/CreateEventScreen.tsx
//
// S125 — formulário de criação de evento: título (obrigatório, <=120),
// descrição (opcional, <=2000), data/horário (Date real, obrigatório,
// sempre no futuro), local (texto livre, obrigatório, <=300 — só quem for
// aprovado enxerga depois). Mirror de CreateGroupScreen.tsx (chips +
// TextInput + botão de enviar), trocando os chips de prazo por
// @react-native-community/datetimepicker (instalado nesta sprint — nenhuma
// tela do projeto usava date/time picker real antes de S125).
//
// iOS suporta mode="datetime" num único picker inline (seletor combinado
// de data+hora). Android não tem esse modo combinado na lib — por isso, no
// Android, dois botões abrem o MESMO componente em modos 'date'/'time'
// separados, fundindo o pedaço escolhido (dia/mês/ano OU hora/minuto) em
// cima do Date já selecionado, sem perder a outra metade.
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import React, { useState } from 'react';
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
  createEvent,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_LOCATION_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
} from '@/services/eventService';
import { countCodePoints } from '@/utils/text';

type CreateEventScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateEvent'>;

type PickerMode = 'date' | 'time';

export default function CreateEventScreen({ navigation }: CreateEventScreenProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>('date');
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedLocation = locationText.trim();
  const canSubmit =
    countCodePoints(trimmedTitle) > 0 &&
    countCodePoints(trimmedTitle) <= MAX_EVENT_TITLE_LENGTH &&
    countCodePoints(description.trim()) <= MAX_EVENT_DESCRIPTION_LENGTH &&
    countCodePoints(trimmedLocation) > 0 &&
    countCodePoints(trimmedLocation) <= MAX_EVENT_LOCATION_LENGTH &&
    startsAt != null &&
    startsAt.getTime() > Date.now() &&
    !submitting;

  const handleSubmit = async () => {
    if (!user || !canSubmit || startsAt == null) return;
    setSubmitting(true);
    try {
      const eventId = await createEvent(
        user.uid,
        trimmedTitle,
        description,
        startsAt,
        trimmedLocation,
      );
      navigation.replace('EventDetail', { eventId });
    } catch (err) {
      console.error('[CreateEventScreen] falha ao criar evento:', err);
      Alert.alert('Erro', 'Não foi possível criar o evento. Tente novamente.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tentar de novo', onPress: handleSubmit },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const openPicker = (mode: PickerMode) => {
    setPickerMode(mode);
    setShowPicker(true);
  };

  // Android: um diálogo por vez (data OU hora), mesma limitação da lib
  // citada no comentário do topo do arquivo — funde o pedaço escolhido em
  // cima do Date que já estava selecionado.
  const handleAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowPicker(false);
    if (event.type === 'dismissed' || !selected) return;
    setStartsAt((prev) => {
      const base = prev ?? new Date();
      const next = new Date(base);
      if (pickerMode === 'date') {
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      } else {
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      return next;
    });
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
          <Text style={styles.headerTitle}>Criar evento</Text>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Título</Text>
            <TextInput
              style={styles.inputSingle}
              placeholder="Ex.: Happy hour de sexta"
              placeholderTextColor={theme.colors.textLight}
              value={title}
              onChangeText={setTitle}
              maxLength={MAX_EVENT_TITLE_LENGTH}
              editable={!submitting}
            />
            <Text style={styles.charCount}>
              {countCodePoints(title)}/{MAX_EVENT_TITLE_LENGTH}
            </Text>

            <Text style={styles.label}>Descrição (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Do que se trata esse encontro?"
              placeholderTextColor={theme.colors.textLight}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
              editable={!submitting}
            />
            <Text style={styles.charCount}>
              {countCodePoints(description)}/{MAX_EVENT_DESCRIPTION_LENGTH}
            </Text>

            <Text style={styles.label}>Data e horário</Text>
            <Text style={styles.hint}>
              O evento some da lista de ativos assim que esse horário chegar.
            </Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={startsAt ?? new Date()}
                mode="datetime"
                display="default"
                minimumDate={new Date()}
                onChange={(_event, selected) => selected && setStartsAt(selected)}
              />
            ) : (
              <>
                <View style={styles.dateTimeRow}>
                  <AnimatedPressable
                    style={styles.dateTimeChip}
                    onPress={() => openPicker('date')}
                    disabled={submitting}
                  >
                    <Text style={styles.dateTimeChipText}>
                      {startsAt ? dayjs(startsAt).format('DD/MM/YYYY') : 'Escolher data'}
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.dateTimeChip}
                    onPress={() => openPicker('time')}
                    disabled={submitting}
                  >
                    <Text style={styles.dateTimeChipText}>
                      {startsAt ? dayjs(startsAt).format('HH:mm') : 'Escolher horário'}
                    </Text>
                  </AnimatedPressable>
                </View>
                {showPicker && (
                  <DateTimePicker
                    value={startsAt ?? new Date()}
                    mode={pickerMode}
                    display="default"
                    minimumDate={pickerMode === 'date' ? new Date() : undefined}
                    onChange={handleAndroidChange}
                  />
                )}
              </>
            )}

            <Text style={styles.label}>Local</Text>
            <Text style={styles.hint}>
              Texto livre. Só quem for aprovado na lista de participantes (ou você, que está
              criando) enxerga esse campo.
            </Text>
            <TextInput
              style={styles.inputLocation}
              placeholder="Ex.: Bar do Zé, próximo ao metrô"
              placeholderTextColor={theme.colors.textLight}
              value={locationText}
              onChangeText={setLocationText}
              multiline
              maxLength={MAX_EVENT_LOCATION_LENGTH}
              editable={!submitting}
            />
            <Text style={styles.charCount}>
              {countCodePoints(locationText)}/{MAX_EVENT_LOCATION_LENGTH}
            </Text>

            <AnimatedPressable
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Criar evento</Text>
              )}
            </AnimatedPressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

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

  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  hint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },

  inputSingle: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
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
  inputLocation: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },

  dateTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.lg },
  dateTimeChip: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  dateTimeChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
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
