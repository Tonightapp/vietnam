import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Event } from '@/constants/Data';

type Props = {
  event: Event;
};

export default function WideCard({ event }: Props) {
  const router = useRouter();

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
      onPress={() => router.push(`/event/${event.id}`)}
    >
      <Image source={{ uri: event.img }} style={styles.img} resizeMode="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(10,11,20,0.85)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Badges */}
      <View style={styles.topRow}>
        {event.isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
        {event.soldOut && (
          <View style={styles.soldOutBadge}>
            <Text style={styles.newBadgeText}>SOLD OUT</Text>
          </View>
        )}
      </View>

      {/* Bottom content */}
      <View style={styles.bottom}>
        <View style={styles.genreTag}>
          <Text style={styles.genreText}>{event.emoji} {event.genre}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={11} color={Colors.text3} />
          <Text style={styles.meta}>{formatDate(event.date)}</Text>
          <Ionicons name="location-outline" size={11} color={Colors.text3} />
          <Text style={styles.meta} numberOfLines={1}>{event.city}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  img: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  topRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  newBadge: {
    backgroundColor: Colors.green,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soldOutBadge: {
    backgroundColor: Colors.red,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    gap: 4,
  },
  genreTag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.gold + '22',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  genreText: {
    fontSize: 10,
    color: Colors.gold,
    fontWeight: '700',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    fontSize: 11,
    color: Colors.text3,
    marginRight: 4,
  },
});
