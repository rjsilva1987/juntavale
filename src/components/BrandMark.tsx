// src/components/BrandMark.tsx
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

interface BrandMarkProps {
  size: number;
}

// Razão largura/altura de assets/marca.png (132x96, recorte aparado e
// redimensionado de art/marca-1254.png). Mantém o desenho sem
// distorcer quando `size` (a altura) muda.
const ASPECT_RATIO = 132 / 96;

// Decorativa — sempre ao lado do texto "JuntaVale" (S: troca do
// ícone flame nos cabeçalhos), então fica fora da árvore de
// acessibilidade pra não duplicar o anúncio do nome do app.
export function BrandMark({ size }: BrandMarkProps) {
  return (
    <Image
      source={require('../../assets/marca.png')}
      style={[styles.image, { width: size * ASPECT_RATIO, height: size }]}
      contentFit="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    flexShrink: 0,
  },
});
