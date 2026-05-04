import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Event } from '@/constants/Data';
import { toggleFavourite, getFavourites } from '@/lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 12 * 2 - 12) / 2;

type Props = {
  event: Event;
};

export default function EventCard({ event }: Props) {
  const router = useRouter();
  const [isFav, setIsFav] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getFavourites().then((favs) => setIsFav(favs.includes(event.id)));
    }, [event.id])
  );

  async function handleFav(e: { stopPropagation: () => void }) {
    e.stopPropagation?.();
    const updated = await toggleFavourite(event.id);
    setIsFav(updated.includes(event.id));
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
      onPress={() => router.push(`/event/${event.id}`)}
    >
      {/* Image */}
      <View style={styles.imgWrap}>
        <Image source={{ uri: event.img }} style={styles.img} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(10,11,20,0.75)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Top badges */}
        <View style={styles.topRow}>
          {(event.isNew || event.soldOut) && (
            <View style={[
              styles.badge,
              event.soldOut ? styles.badgeSoldOut : styles.badgeNew,
            ]}>
              <Text style={styles.badgeText}>
                {event.soldOut ? 'SOLD OUT' : 'NEW'}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            style={({ pressed }) => [styles.heartBtn, pressed && { opacity: 0.7 }]}
            onPress={handleFav}
            hitSlop={8}
          >
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={16}
              color={isFav ? Colors.red : '#fff'}
            />
          </Pressable>
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.date}>{formatDate(event.date)} · {event.city}</Text>
        <View style={styles.bottomRow}>
          <View style={styles.genreTag}>
            <Text style={styles.genreTagText}>{event.genre}</Text>
          </View>
          <Text style={styles.venue} numberOfLines={1}>{event.venue}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imgWrap: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  topRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeNew: {
    backgroundColor: Colors.green,
  },
  badgeSoldOut: {
    backgroundColor: Colors.red,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heartBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10,11,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    padding: 10,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 18,
  },
  date: {
    fontSize: 11,
    color: Colors.text3,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  genreTag: {
    backgroundColor: Colors.gold + '22',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  genreTagText: {
    fontSize: 10,
    color: Colors.gold,
    fontWeight: '700',
  },
  venue: {
    fontSize: 10,
    color: Colors.text3,
    flex: 1,
  },
});
