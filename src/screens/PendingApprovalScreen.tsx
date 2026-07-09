// src/screens/PendingApprovalScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { RootStackParamList } from '@/navigation';

type PendingApprovalScreenProps = NativeStackScreenProps<RootStackParamList, 'PendingApproval'>;

export default function PendingApprovalScreen({ navigation }: PendingApprovalScreenProps) {
  const { logout } = useAuth();

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="hourglass-outline" size={48} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Seu acesso está quase liberado</Text>
          <Text style={styles.description}>
            Pra proteger a comunidade, todo mundo passa por uma verificação de perfil antes de
            acessar o Descobrir, Curtidas e Conversas. Envie sua selfie e nossa equipe libera seu
            acesso assim que aprovar — você não precisa fazer mais nada, o app libera sozinho.
          </Text>

          <AnimatedPressable
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Verification')}
          >
            <Ionicons name="camera-outline" size={20} color={theme.colors.onSecondary} />
            <Text style={styles.primaryBtnText}>Verificar perfil</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.secondaryBtnText}>Editar meu perfil</Text>
          </AnimatedPressable>
        </View>

        <AnimatedPressable style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.nope} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </AnimatedPressable>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    minWidth: 220,
    ...theme.shadows.light,
  },
  primaryBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.onSecondary },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.borderRadius.full,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    minWidth: 220,
    marginTop: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  secondaryBtnText: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.primary },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
  },
  logoutText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.nope },
});
