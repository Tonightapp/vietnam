import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignup() {
    setError('');
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <View style={[styles.container, styles.successContainer, { paddingTop: insets.top }]}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>Account Created!</Text>
        <Text style={styles.successSub}>
          Check your email to verify your account, then log in.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
          onPress={() => {
            router.back();
            router.push('/(auth)/login');
          }}
        >
          <Text style={styles.loginBtnText}>Log In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Join Tonight</Text>
        <Text style={styles.subtitle}>Create your account to start booking</Text>

        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={Colors.text3}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          placeholderTextColor={Colors.text3}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 6 characters"
          placeholderTextColor={Colors.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.signupBtn, loading && styles.btnDisabled, pressed && { opacity: 0.85 }]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={styles.signupBtnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.switchLink, pressed && { opacity: 0.7 }]}
          onPress={() => {
            router.back();
            router.push('/(auth)/login');
          }}
        >
          <Text style={styles.switchText}>
            Already have an account?{' '}
            <Text style={styles.switchHighlight}>Log in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  successEmoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.text2,
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    padding: 24,
    paddingTop: 16,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text3,
    marginBottom: 32,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 18,
  },
  errorText: {
    fontSize: 13,
    color: Colors.red,
    marginBottom: 16,
    textAlign: 'center',
  },
  signupBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  signupBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  loginBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  switchLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    color: Colors.text3,
  },
  switchHighlight: {
    color: Colors.gold,
    fontWeight: '700',
  },
});
