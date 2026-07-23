// src/screens/SupportScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { SUPPORT_CATEGORY_OPTIONS, SupportCategory } from '@/constants/supportCategories';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';
import { submitSupportTicket } from '@/services/supportService';

const MAX_MESSAGE_LENGTH = 1000;

type SupportScreenProps = NativeStackScreenProps<RootStackParamList, 'Support'>;

export default function SupportScreen({ navigation }: SupportScreenProps) {
  const { user } = useAuth();
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedMessage = message.trim();
  const canSubmit = category !== null && trimmedMessage.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!user || !category || trimmedMessage.length === 0) return;
    setSubmitting(true);
    try {
      await submitSupportTicket({ uid: user.uid, category, message });
      Alert.alert('Mensagem enviada!', 'Vamos te responder em breve.', [
        { text: 'OK', onPress: () => navigation.goBack() },
        { text: 'Ver meus chamados', onPress: () => navigation.replace('MyTickets') },
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível enviar sua mensagem. Tente novamente.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tentar de novo', onPress: handleSubmit },
      ]);
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
          <Text style={styles.headerTitle}>Ajuda</Text>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedPressable
              style={styles.myTicketsLink}
              onPress={() => navigation.navigate('MyTickets')}
            >
              <Text style={styles.myTicketsLinkText}>Meus chamados →</Text>
            </AnimatedPressable>

            <Text style={styles.welcome}>Fale com a gente — respondemos o quanto antes.</Text>

            <Text style={styles.label}>Categoria</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              {SUPPORT_CATEGORY_OPTIONS.map((option) => {
                const active = category === option.value;
                return (
                  <AnimatedPressable
                    key={option.value}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setCategory(option.value)}
                    disabled={submitting}
                  >
                    <Text
                      style={[styles.categoryChipText, active && styles.categoryChipTextActive]}
                    >
                      {option.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Mensagem</Text>
            <TextInput
              style={styles.input}
              placeholder="Descreva sua dúvida ou problema..."
              placeholderTextColor={theme.colors.textLight}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              editable={!submitting}
            />
            <Text style={styles.charCount}>
              {message.length}/{MAX_MESSAGE_LENGTH}
            </Text>

            <AnimatedPressable
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Enviar</Text>
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
    backgroundColor: theme.colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4, width: 34 },
  headerTitle: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },

  content: { padding: theme.spacing.md },
  myTicketsLink: { alignSelf: 'flex-end', marginBottom: theme.spacing.sm },
  myTicketsLinkText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  welcome: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },

  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
  },

  categoryRow: { gap: 8, paddingBottom: theme.spacing.lg },
  categoryChip: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  categoryChipTextActive: { color: theme.colors.white },

  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    height: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },

  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    padding: 15,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.white },
});
