// src/components/PhotoCarousel.tsx
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import PagerView from 'react-native-pager-view';

import { BLURHASH_PLACEHOLDER } from '@/constants/media';
import { theme } from '@/constants/theme';

interface PhotoCarouselProps {
  photos: string[];
  style?: ViewStyle;
}

export function PhotoCarousel({ photos, style }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderEmoji}>😊</Text>
      </View>
    );
  }

  if (photos.length === 1) {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={{ uri: photos[0] }}
          style={styles.image}
          contentFit="cover"
          placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
          transition={200}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <PagerView
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setActiveIndex(e.nativeEvent.position)}
      >
        {photos.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            style={styles.image}
            contentFit="cover"
            placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
            transition={200}
          />
        ))}
      </PagerView>

      <View style={styles.dots} pointerEvents="none">
        {photos.map((uri, index) => (
          <View key={uri} style={[styles.dot, index === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: { fontSize: 80 },
  dots: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: theme.colors.white,
    width: 18,
  },
});
