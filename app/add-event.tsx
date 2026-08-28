import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { CITIES, GENRES } from '@/constants/Data';

const EMOJI_OPTIONS = ['🎛️', '🏠', '🌅', '🎷', '🎤', '🌙', '🍽️', '🌕', '🌴', '⚡', '🔊', '🏮', '🎵', '🎶', '🎸', '🥂'];

export default function AddEventScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [img, setImg] = useState('');
  const [emoji, setEmoji] = useState('🎵');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !venue.trim() || !city || !genre || !date.trim()) {
      Alert.alert('Missing Fields', 'Please fill in Title, Venue, City, Genre, and Date.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      artist: artist.trim() || null,
      genre,
      city,
      area: area.trim() || null,
      venue: venue.trim(),
      date,
      img: img.trim() || null,
      emoji,
      description: desc.trim() || null,
      is_new: true,
      featured: false,
      sold_out: false,
      attendees: 0,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Event Added!', 'Your event is now live on Tonight.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="close" size={20} color={Colors.text2} />
        </Pressable>
        <Text style={styles.topTitle}>Add Event</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Field label="Event Title *" value={title} onChange={setTitle} placeholder="e.g. Neon Pulse: Techno Night" />
        <Field label="Artist / Lineup" value={artist} onChange={setArtist} placeholder="e.g. DJ Khanh Ly" />

        {/* Genre picker */}
        <Text style={styles.label}>Genre *</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          {GENRES.map((g) => (
            <Pressable
              key={g}
              style={[styles.chip, genre === g && styles.chipActive]}
              onPress={() => setGenre(g)}
            >
              <Text style={[styles.chipText, genre === g && styles.chipTextActive]}>{g}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* City picker */}
        <Text style={styles.label}>City *</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          {CITIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, city === c && styles.chipActive]}
              onPress={() => setCity(c)}
            >
              <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Field label="Area / Neighbourhood" value={area} onChange={setArea} placeholder="e.g. District 1" />
        <Field label="Venue Name *" value={venue} onChange={setVenue} placeholder="e.g. Broma Not A Bar" />
        <Field
          label="Date & Time *"
          value={date}
          onChange={setDate}
          placeholder="YYYY-MM-DDTHH:MM:00"
          autoCapitalize="none"
        />
        <Field
          label="Cover Image URL"
          value={img}
          onChange={setImg}
          placeholder="https://..."
          autoCapitalize="none"
          keyboardType="url"
        />

        {/* Emoji picker */}
        <Text style={styles.label}>Event Emoji</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          {EMOJI_OPTIONS.map((e) => (
            <Pressable
              key={e}
              style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
              onPress={() => setEmoji(e)}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe the event..."
          placeholderTextColor={Colors.text3}
          value={desc}
          onChangeText={setDesc}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Pressable
          style={({ pressed }) => [styles.submitBtn, loading && styles.btnDisabled, pressed && { opacity: 0.85 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitBtnText}>{loading ? 'Publishing…' : 'Publish Event'}</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'url';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.text3}
        value={value}
        onChangeText={onChange}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text2,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    marginBottom: 20,
  },
  chipRow: {
    marginBottom: 16,
  },
  chipContent: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text3,
  },
  chipTextActive: {
    color: '#000',
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.gold + '22',
  },
  emojiText: {
    fontSize: 22,
  },
  submitBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
});
