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
import { CITIES } from '@/constants/Data';

export default function VenueRequestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!venueName.trim() || !city) {
      Alert.alert('Missing Fields', 'Please enter your venue name and city.');
      return;
    }

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      Alert.alert('Not logged in', 'Please log in first.');
      setLoading(false);
      return;
    }

    // Check if a request already exists
    const { data: existing } = await supabase
      .from('venue_requests')
      .select('id, status')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      setLoading(false);
      const msg = existing.status === 'pending'
        ? 'You already have a pending request. We\'ll review it shortly.'
        : existing.status === 'approved'
        ? 'Your request has already been approved!'
        : 'Your previous request was not approved. Contact support for help.';
      Alert.alert('Request Exists', msg);
      return;
    }

    const meta = user.user_metadata as { full_name?: string } | undefined;
    const fullName = meta?.full_name ?? user.email?.split('@')[0] ?? 'Unknown';

    const { error } = await supabase.from('venue_requests').insert({
      user_id: user.id,
      full_name: fullName,
      email: user.email,
      venue_name: venueName.trim(),
      city,
      website: website.trim() || null,
      description: description.trim() || null,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert(
        'Request Submitted!',
        'We\'ll review your application and get back to you. Once approved, you\'ll be able to add events on Tonight.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
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
        <Text style={styles.topTitle}>Join Tonight as a Venue</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Tell us about your venue. Our team will review your application and approve it within 24–48 hours.
        </Text>

        <Text style={styles.label}>Venue Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Broma Not A Bar"
          placeholderTextColor={Colors.text3}
          value={venueName}
          onChangeText={setVenueName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>City *</Text>
        <View style={styles.cityRow}>
          {CITIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, city === c && styles.chipActive]}
              onPress={() => setCity(c)}
            >
              <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Website / Social Link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://instagram.com/yourvenue"
          placeholderTextColor={Colors.text3}
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={styles.label}>Tell Us About Your Venue</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What kind of events do you host? Capacity? Vibe?"
          placeholderTextColor={Colors.text3}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <Pressable
          style={({ pressed }) => [styles.submitBtn, loading && styles.btnDisabled, pressed && { opacity: 0.85 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitBtnText}>{loading ? 'Submitting…' : 'Submit Application'}</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    fontSize: 16,
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
  intro: {
    fontSize: 14,
    color: Colors.text3,
    lineHeight: 21,
    marginBottom: 24,
    backgroundColor: Colors.card2,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
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
    marginBottom: 18,
  },
  textArea: {
    height: 120,
    marginBottom: 24,
  },
  cityRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
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
  submitBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
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
