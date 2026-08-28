import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Event } from '@/constants/Data';

type Props = {
  event: Event;
};

export default function Top10Card({ event }: Props) {
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
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() => router.push(`/event/${event.id}`)}
    >
      {/* Thumb */}
      <Image source={{ uri: event.img }} style={styles.thumb} resizeMode="cover" />

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.venue} numberOfLines={1}>{event.venue} · {event.city}</Text>
        <Text style={styles.date}>{formatDate(event.date)}</Text>
      </View>

      {/* Book button */}
      <Pressable
        style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.8 }]}
        onPress={() => router.push(`/event/${event.id}`)}
        hitSlop={8}
      >
        <Text style={styles.bookBtnText}>Book</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  venue: {
    fontSize: 12,
    color: Colors.text3,
  },
  date: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: '600',
  },
  bookBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  bookBtnText: {
    color: Colors.bg,
    fontWeight: '700',
    fontSize: 12,
  },
});
