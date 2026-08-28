import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { ARTISTS, DEALS, Event, Deal, Artist } from '@/constants/Data';
import { useEvents } from '@/hooks/useEvents';
import EventCard from '@/components/EventCard';
import DealCard from '@/components/DealCard';
import SectionHeader from '@/components/SectionHeader';
import Top10Card from '@/components/Top10Card';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FILTER_PILLS = ['All', 'Tonight', 'This Weekend', 'This Month'];

function HeroBanner({ events }: { events: Event[] }) {
  const router = useRouter();
  const featured = events.filter((e) => e.featured).slice(0, 3);
  const listRef = useRef<FlatList<Event>>(null);
  const currentIndex = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (currentIndex.current + 1) % featured.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      currentIndex.current = next;
    }, 4000);
    return () => clearInterval(interval);
  }, [featured.length]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <FlatList
      ref={listRef}
      data={featured}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => String(item.id)}
      style={styles.heroBanner}
      renderItem={({ item }) => (
        <Pressable
          style={styles.heroItem}
          onPress={() => router.push(`/event/${item.id}`)}
        >
          <ImageBackground
            source={{ uri: item.img }}
            style={styles.heroImage}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['transparent', 'rgba(10,11,20,0.55)', 'rgba(10,11,20,0.95)']}
              style={styles.heroGradient}
            >
              <View style={styles.heroContent}>
                <View style={styles.heroBadgeRow}>
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{item.emoji} {item.genre}</Text>
                  </View>
                  {item.isNew && (
                    <View style={[styles.heroBadge, { backgroundColor: Colors.green }]}>
                      <Text style={[styles.heroBadgeText, { color: '#000' }]}>NEW</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.heroSub}>{formatDate(item.date)} · {item.venue}</Text>
                <Pressable
                  style={({ pressed }) => [styles.heroButton, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/event/${item.id}`)}
                >
                  <Text style={styles.heroButtonText}>Book Now</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </ImageBackground>
        </Pressable>
      )}
    />
  );
}

function ArtistPill({ artist }: { artist: Artist }) {
  const [following, setFollowing] = useState(false);
  const colors = ['#f5c842', '#00d084', '#ff3b5c', '#a855f7', '#3b82f6', '#f97316'];
  const bg = colors[artist.id % colors.length];

  return (
    <View style={styles.artistCard}>
      <View style={[styles.artistAvatar, { backgroundColor: bg + '33', borderColor: bg }]}>
        <Text style={styles.artistEmoji}>{artist.emoji}</Text>
      </View>
      <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
      <Text style={styles.artistGenre}>{artist.genre}</Text>
      <Pressable
        style={({ pressed }) => [
          styles.followBtn,
          following && styles.followingBtn,
          pressed && { opacity: 0.8 },
        ]}
        onPress={() => setFollowing((f) => !f)}
      >
        <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All');
  const { events } = useEvents();

  const newEvents = events.filter((e) => e.isNew);
  const weekEvents = events.filter((e) => !e.featured).slice(0, 6);
  const topEvents = events.slice(0, 6);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>Tonight</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/(tabs)/search')}
          >
            <Ionicons name="location-outline" size={22} color={Colors.text2} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="notifications-outline" size={22} color={Colors.text2} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Hero Banner */}
        <HeroBanner events={events} />

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
        >
          {FILTER_PILLS.map((pill) => (
            <Pressable
              key={pill}
              style={({ pressed }) => [
                styles.pill,
                activeFilter === pill && styles.pillActive,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setActiveFilter(pill)}
            >
              <Text style={[styles.pillText, activeFilter === pill && styles.pillTextActive]}>
                {pill}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Top Events 2-col grid */}
        <View style={styles.section}>
          <SectionHeader
            title="Top Events"
            onSeeAll={() => router.push('/(tabs)/events')}
          />
          <View style={styles.top10Grid}>
            {topEvents.map((ev) => (
              <Top10Card key={ev.id} event={ev} />
            ))}
          </View>
        </View>

        {/* Just Added */}
        {newEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Just Added"
              onSeeAll={() => router.push('/(tabs)/events')}
            />
            <FlatList
              data={newEvents}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.hListContent}
              renderItem={({ item }) => <EventCard event={item} />}
            />
          </View>
        )}

        {/* This Week */}
        <View style={styles.section}>
          <SectionHeader
            title="This Week"
            onSeeAll={() => router.push('/(tabs)/events')}
          />
          <FlatList
            data={weekEvents}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.hListContent}
            renderItem={({ item }) => <EventCard event={item} />}
          />
        </View>

        {/* Live Deals */}
        {DEALS.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Live Deals" />
            <FlatList
              data={DEALS}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.hListContent}
              renderItem={({ item }) => <DealCard deal={item} />}
            />
          </View>
        )}

        {/* Popular Artists */}
        <View style={styles.section}>
          <SectionHeader title="Popular Artists" />
          <FlatList
            data={ARTISTS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.hListContent}
            renderItem={({ item }) => <ArtistPill artist={item} />}
          />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.bg,
  },
  headerLogo: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.gold,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBanner: {
    height: 280,
  },
  heroItem: {
    width: SCREEN_WIDTH,
    height: 280,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: 16,
    paddingBottom: 20,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  heroBadge: {
    backgroundColor: 'rgba(245,200,66,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  heroBadgeText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    color: Colors.text2,
    marginBottom: 14,
  },
  heroButton: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  heroButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  pillsScroll: {
    marginTop: 16,
  },
  pillsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  pillText: {
    color: Colors.text3,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#000',
  },
  section: {
    marginTop: 24,
  },
  top10Grid: {
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 12,
  },
  hListContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 12,
  },
  artistCard: {
    width: 90,
    alignItems: 'center',
    gap: 6,
  },
  artistAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  artistEmoji: {
    fontSize: 30,
  },
  artistName: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  artistGenre: {
    color: Colors.text3,
    fontSize: 10,
    textAlign: 'center',
  },
  followBtn: {
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  followingBtn: {
    backgroundColor: Colors.gold,
  },
  followBtnText: {
    color: Colors.gold,
    fontSize: 10,
    fontWeight: '700',
  },
  followingBtnText: {
    color: '#000',
  },
});
