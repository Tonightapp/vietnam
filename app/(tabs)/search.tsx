import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { EVENTS } from '@/constants/Data';
import EventCard from '@/components/EventCard';

const RECENT_KEY = '@tonight_recent_searches';
const MAX_RECENT = 8;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    loadRecents();
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  async function loadRecents() {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      if (raw) setRecents(JSON.parse(raw));
    } catch {
      // ignore
    }
  }

  const saveRecent = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...recents.filter((r) => r !== trimmed)].slice(0, MAX_RECENT);
    setRecents(updated);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  }, [recents]);

  async function clearRecents() {
    setRecents([]);
    await AsyncStorage.removeItem(RECENT_KEY);
  }

  function handleSubmit() {
    if (query.trim()) saveRecent(query.trim());
  }

  const results = query.trim()
    ? EVENTS.filter((ev) => {
        const q = query.toLowerCase();
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.venue.toLowerCase().includes(q) ||
          ev.artist.toLowerCase().includes(q) ||
          ev.city.toLowerCase().includes(q) ||
          ev.genre.toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search bar */}
      <View style={styles.barRow}>
        <View style={styles.bar}>
          <Ionicons name="search" size={18} color={Colors.text3} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search events, venues, artists..."
            placeholderTextColor={Colors.text3}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.text3} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Results */}
      {query.trim().length > 0 ? (
        results.length > 0 ? (
          <FlatList
            data={results}
            numColumns={2}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <EventCard event={item} />}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>😕</Text>
            <Text style={styles.emptyTitle}>No results for "{query}"</Text>
            <Text style={styles.emptySub}>Try a different keyword</Text>
          </View>
        )
      ) : (
        <View style={styles.recentsContainer}>
          {recents.length > 0 ? (
            <>
              <View style={styles.recentsHeader}>
                <Text style={styles.recentsLabel}>Recent Searches</Text>
                <Pressable onPress={clearRecents}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
              </View>
              {recents.map((term) => (
                <Pressable
                  key={term}
                  style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
                  onPress={() => setQuery(term)}
                >
                  <Ionicons name="time-outline" size={16} color={Colors.text3} />
                  <Text style={styles.recentText}>{term}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="search" size={48} color={Colors.text3} />
              <Text style={styles.emptyTitle}>Start typing to find events</Text>
              <Text style={styles.emptySub}>Search by name, city, artist or venue</Text>
            </View>
          )}
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
  barRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    padding: 0,
  },
  grid: {
    paddingHorizontal: 12,
    paddingTop: 8,
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
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text2,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
  },
  recentsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  recentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  recentsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  clearText: {
    fontSize: 13,
    color: Colors.gold,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  recentText: {
    fontSize: 15,
    color: Colors.text2,
  },
});
