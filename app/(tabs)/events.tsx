import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { CITIES, GENRES } from '@/constants/Data';
import { useEvents } from '@/hooks/useEvents';
import EventCard from '@/components/EventCard';

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCity, setSelectedCity] = useState('All Cities');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const { events } = useEvents();

  const allCities = ['All Cities', ...CITIES];
  const allGenres = ['All', ...GENRES];

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      const cityMatch = selectedCity === 'All Cities' || ev.city === selectedCity;
      const genreMatch = selectedGenre === 'All' || ev.genre === selectedGenre;
      return cityMatch && genreMatch;
    });
  }, [events, selectedCity, selectedGenre]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <Text style={styles.headerCount}>{filtered.length} events</Text>
      </View>

      {/* City filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {allCities.map((city) => (
          <Pressable
            key={city}
            style={({ pressed }) => [
              styles.chip,
              selectedCity === city && styles.chipActive,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setSelectedCity(city)}
          >
            <Text style={[styles.chipText, selectedCity === city && styles.chipTextActive]}>
              {city}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Genre filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { marginTop: 6 }]}
        contentContainerStyle={styles.filterContent}
      >
        {allGenres.map((genre) => (
          <Pressable
            key={genre}
            style={({ pressed }) => [
              styles.chip,
              styles.genreChip,
              selectedGenre === genre && styles.genreChipActive,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setSelectedGenre(genre)}
          >
            <Text style={[styles.chipText, selectedGenre === genre && styles.genreChipTextActive]}>
              {genre}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Events grid */}
      {filtered.length > 0 ? (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <EventCard event={item} />}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>No events found</Text>
          <Text style={styles.emptySub}>Try changing your filters</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  headerCount: {
    fontSize: 13,
    color: Colors.text3,
  },
  filterRow: {
    flexShrink: 0,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  chipText: {
    color: Colors.text3,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#000',
  },
  genreChip: {
    backgroundColor: Colors.card2,
    borderColor: Colors.border,
  },
  genreChipActive: {
    backgroundColor: Colors.text3,
    borderColor: Colors.text3,
  },
  genreChipTextActive: {
    color: Colors.bg,
    fontWeight: '700',
  },
  grid: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.text3,
  },
});
