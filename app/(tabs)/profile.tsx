import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/Colors';
import { getTickets, getFavourites } from '@/lib/storage';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SETTINGS: Array<{ icon: IoniconName; label: string; danger?: boolean }> = [
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'receipt-outline', label: 'My Bookings' },
  { icon: 'shield-outline', label: 'Privacy' },
  { icon: 'log-out-outline', label: 'Log Out', danger: true },
];

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ticketCount, setTicketCount] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [userRole, setUserRole] = useState<string>('user');

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(async ({ data }) => {
        setSession(data.session);
        if (data.session?.user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.session.user.id)
            .single();
          if (profile?.role) setUserRole(profile.role);
        }
      });
      getTickets().then((t) => setTicketCount(t.length));
      getFavourites().then((f) => setFavCount(f.length));
    }, [])
  );

  const isAdmin = userRole === 'admin';
  const canAddEvents = userRole === 'pro' || userRole === 'venue_owner';
  const isRegularUser = userRole === 'user';

  async function handleLogOut() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setSession(null);
        },
      },
    ]);
  }

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loggedOut}>
          <Text style={styles.logo}>Tonight</Text>
          <Text style={styles.tagline}>Your nights, perfectly planned.</Text>
          <Pressable
            style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginBtnText}>Log In</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.signupBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/(auth)/signup')}
          >
            <Text style={styles.signupBtnText}>Create Account</Text>
          </Pressable>
          <Text style={styles.anonNote}>
            {ticketCount > 0 ? `You have ${ticketCount} ticket${ticketCount > 1 ? 's' : ''} saved locally.` : 'Browse events without an account.'}
          </Text>
        </View>
      </View>
    );
  }

  const email = session.user?.email ?? '';
  const meta = session.user?.user_metadata as { full_name?: string } | undefined;
  const name = meta?.full_name ?? email.split('@')[0] ?? 'User';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {/* Avatar + info */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <Text style={styles.userName}>{name}</Text>
        <Text style={styles.userEmail}>{email}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{ticketCount}</Text>
          <Text style={styles.statLabel}>Tickets</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{favCount}</Text>
          <Text style={styles.statLabel}>Favourites</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>🌏</Text>
          <Text style={styles.statLabel}>Explorer</Text>
        </View>
      </View>

      {/* Admin dashboard button */}
      {isAdmin && (
        <Pressable
          style={({ pressed }) => [styles.adminBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/portal')}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.bg} style={{ marginRight: 8 }} />
          <Text style={styles.adminBtnText}>Admin Portal</Text>
        </Pressable>
      )}

      {/* Add Event — visible to pro users and venue owners */}
      {canAddEvents && (
        <Pressable
          style={({ pressed }) => [styles.addEventBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/add-event')}
        >
          <Ionicons name="add-circle-outline" size={20} color="#000" style={{ marginRight: 8 }} />
          <Text style={styles.addEventBtnText}>Add Event</Text>
        </Pressable>
      )}

      {/* List Your Venue — visible to regular users */}
      {isRegularUser && (
        <Pressable
          style={({ pressed }) => [styles.venueBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/venue-request')}
        >
          <Ionicons name="storefront-outline" size={20} color={Colors.gold} style={{ marginRight: 8 }} />
          <Text style={styles.venueBtnText}>List Your Venue on Tonight</Text>
        </Pressable>
      )}

      {/* Settings */}
      <View style={styles.settingsList}>
        {SETTINGS.map((item) => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.7 }]}
            onPress={() => {
              if (item.label === 'Log Out') handleLogOut();
            }}
          >
            <View style={styles.settingsLeft}>
              <View style={[styles.settingsIcon, item.danger && styles.settingsIconDanger]}>
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.danger ? Colors.red : Colors.text2}
                />
              </View>
              <Text style={[styles.settingsLabel, item.danger && { color: Colors.red }]}>
                {item.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.text3} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  loggedOut: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
    paddingBottom: 60,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.gold,
    letterSpacing: -1,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: Colors.text3,
    textAlign: 'center',
    marginBottom: 10,
  },
  loginBtn: {
    width: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  signupBtn: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signupBtnText: {
    color: Colors.gold,
    fontWeight: '700',
    fontSize: 16,
  },
  anonNote: {
    fontSize: 12,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 8,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.gold + '33',
    borderWidth: 2,
    borderColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.gold,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.text3,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.text3,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.text,
    borderRadius: 14,
    paddingVertical: 14,
  },
  adminBtnText: {
    color: Colors.bg,
    fontWeight: '800',
    fontSize: 15,
  },
  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
  },
  addEventBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  venueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 13,
  },
  venueBtnText: {
    color: Colors.gold,
    fontWeight: '700',
    fontSize: 14,
  },
  settingsList: {
    marginHorizontal: 16,
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconDanger: {
    backgroundColor: Colors.red + '22',
  },
  settingsLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
});
