import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ImageBackground,
  Pressable,
  StyleSheet,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { EVENTS } from '@/constants/Data';
import { toggleFavourite, getFavourites } from '@/lib/storage';

const DRESS_CODES: Record<string, string> = {
  Techno: 'All Black',
  House: 'Smart Casual',
  EDM: 'Festival Wear',
  Jazz: 'Smart / Cocktail',
  'Hip-Hop': 'Streetwear',
  'R&B': 'Chic Casual',
  Rock: 'Casual',
};

const MUSIC_START_TIMES = ['9:00 PM', '9:30 PM', '10:00 PM', '10:30 PM', '11:00 PM'];

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isFav, setIsFav] = useState(false);

  const eventId = Number(id);
  const event = EVENTS.find((e) => e.id === eventId);

  useFocusEffect(
    useCallback(() => {
      getFavourites().then((favs) => setIsFav(favs.includes(eventId)));
    }, [eventId])
  );

  if (!event) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.notFound}>Event not found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: Colors.gold, textAlign: 'center', marginTop: 12 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  async function handleFav() {
    const updated = await toggleFavourite(eventId);
    setIsFav(updated.includes(eventId));
  }

  async function handleShare() {
    if (!event) return;
    await Share.share({
      message: `${event.title} at ${event.venue}, ${event.city} — ${formatDate(event.date)}\n\nBook via the Tonight app!`,
      title: event.title,
    });
  }

  async function handleWaitlist() {
    if (!event) return;
    Alert.alert('Waitlist', `You've been added to the waitlist for "${event.title}".`);
  }

  const dressCode = DRESS_CODES[event.genre] ?? 'Smart Casual';
  const musicStart = MUSIC_START_TIMES[event.id % MUSIC_START_TIMES.length];
  const capacityMax = Math.round(event.attendees * 1.3);
  const capacityPct = Math.min((event.attendees / capacityMax) * 100, 100);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* Hero */}
        <ImageBackground source={{ uri: event.img }} style={styles.hero} resizeMode="cover">
          <LinearGradient
            colors={['rgba(10,11,20,0.5)', 'transparent', 'transparent', 'rgba(10,11,20,0.9)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Top controls */}
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={20} color={Colors.text} />
            </Pressable>
            <View style={styles.topRight}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={20} color={Colors.text} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
                onPress={handleFav}
              >
                <Ionicons
                  name={isFav ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isFav ? Colors.red : Colors.text}
                />
              </Pressable>
            </View>
          </View>
        </ImageBackground>

        {/* Content */}
        <View style={styles.content}>
          {/* Genre badge */}
          <View style={styles.badgeRow}>
            <View style={styles.genreBadge}>
              <Text style={styles.genreBadgeText}>{event.emoji} {event.genre}</Text>
            </View>
            {event.isNew && (
              <View style={[styles.genreBadge, { backgroundColor: Colors.green + '22', borderColor: Colors.green }]}>
                <Text style={[styles.genreBadgeText, { color: Colors.green }]}>NEW</Text>
              </View>
            )}
            {event.soldOut && (
              <View style={[styles.genreBadge, { backgroundColor: Colors.red + '22', borderColor: Colors.red }]}>
                <Text style={[styles.genreBadgeText, { color: Colors.red }]}>SOLD OUT</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.artist}>by {event.artist}</Text>

          {/* Info rows */}
          <View style={styles.infoRows}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.gold} />
              <Text style={styles.infoText}>{formatDate(event.date)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={Colors.gold} />
              <Text style={styles.infoText}>{formatTime(event.date)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={Colors.gold} />
              <Text style={styles.infoText}>{event.venue}, {event.area}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="navigate-outline" size={16} color={Colors.gold} />
              <Text style={styles.infoText}>{event.city}</Text>
            </View>
          </View>

          {/* Description */}
          <Text style={styles.sectionTitle}>About This Event</Text>
          <Text style={styles.desc}>{event.desc}</Text>

          {/* Details grid */}
          <View style={styles.detailsGrid}>
            <View style={styles.detailBox}>
              <Text style={styles.detailBoxLabel}>DRESS CODE</Text>
              <Text style={styles.detailBoxValue}>{dressCode}</Text>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailBoxLabel}>MUSIC STARTS</Text>
              <Text style={styles.detailBoxValue}>{musicStart}</Text>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailBoxLabel}>AGE LIMIT</Text>
              <Text style={styles.detailBoxValue}>18+</Text>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailBoxLabel}>ATTENDING</Text>
              <Text style={styles.detailBoxValue}>{event.attendees.toLocaleString()}</Text>
            </View>
          </View>

          {/* Capacity bar */}
          <View style={styles.capacityWrap}>
            <View style={styles.capacityHeader}>
              <Text style={styles.capacityLabel}>Venue Capacity</Text>
              <Text style={styles.capacityPct}>{Math.round(capacityPct)}% full</Text>
            </View>
            <View style={styles.capacityBar}>
              <View style={[styles.capacityFill, { width: `${capacityPct}%` }]} />
            </View>
            <Text style={styles.capacityNote}>{event.attendees} attending · {capacityMax} capacity</Text>
          </View>

          {/* Bottom spacing for sticky bar */}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        {event.soldOut ? (
          <Pressable
            style={({ pressed }) => [styles.waitlistBtn, pressed && { opacity: 0.8 }]}
            onPress={handleWaitlist}
          >
            <Text style={styles.waitlistBtnText}>Sold Out — Join Waitlist</Text>
          </Pressable>
        ) : (
          <View style={styles.bookBtns}>
            <Pressable
              style={({ pressed }) => [styles.bookBtn, styles.guestlistBtn, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({ pathname: '/booking/[id]', params: { id: String(event.id), type: 'guestlist' } })}
            >
              <Text style={styles.guestlistBtnText}>Join Guestlist</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.bookBtn, styles.entryBtn, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({ pathname: '/booking/[id]', params: { id: String(event.id), type: 'entry' } })}
            >
              <Text style={styles.entryBtnText}>Book Entry</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  notFound: {
    color: Colors.text,
    textAlign: 'center',
    fontSize: 16,
  },
  hero: {
    height: 260,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,11,20,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  genreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gold,
    backgroundColor: Colors.gold + '22',
  },
  genreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gold,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 32,
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: Colors.text3,
    marginBottom: 16,
  },
  infoRows: {
    gap: 10,
    marginBottom: 24,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: Colors.text2,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
  },
  desc: {
    fontSize: 14,
    color: Colors.text3,
    lineHeight: 22,
    marginBottom: 24,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  detailBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  detailBoxLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text3,
    letterSpacing: 0.8,
  },
  detailBoxValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  capacityWrap: {
    gap: 8,
  },
  capacityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  capacityLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text2,
  },
  capacityPct: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gold,
  },
  capacityBar: {
    height: 8,
    backgroundColor: Colors.card,
    borderRadius: 4,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 4,
  },
  capacityNote: {
    fontSize: 12,
    color: Colors.text3,
  },
  stickyBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.bg2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bookBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  bookBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  guestlistBtn: {
    backgroundColor: Colors.card2,
    borderWidth: 1.5,
    borderColor: Colors.gold,
  },
  guestlistBtnText: {
    color: Colors.gold,
    fontWeight: '700',
    fontSize: 14,
  },
  entryBtn: {
    backgroundColor: Colors.gold,
  },
  entryBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  waitlistBtn: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.red,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  waitlistBtnText: {
    color: Colors.red,
    fontWeight: '700',
    fontSize: 14,
  },
});
