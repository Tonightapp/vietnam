/**
 * Tonight Vietnam — Staff Portal
 * Route: /portal  →  www.tonightvietnam.com/portal
 *
 * Flow:
 *  1. Checking auth  → loader
 *  2. Not logged in  → StaffLogin
 *  3. Logged in, not admin → AccessDenied
 *  4. Logged in, admin → PortalDashboard (4-tab admin UI)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

const { width: W } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';

// ─── Types ────────────────────────────────────────────────────────────────────

type PortalView = 'loading' | 'login' | 'denied' | 'dashboard';
type Tab = 'overview' | 'members' | 'venues' | 'events';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

type VenueRequest = {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  venue_name: string;
  city: string;
  website: string | null;
  description: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
};

type EventRow = {
  id: number;
  title: string;
  genre: string | null;
  city: string | null;
  venue: string | null;
  date: string | null;
  emoji: string | null;
  featured: boolean;
  is_new: boolean;
  created_at: string;
};

type Stats = {
  totalMembers: number;
  newThisWeek: number;
  liveEvents: number;
  pendingReviews: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function roleColor(role: string): string {
  switch (role) {
    case 'admin': return '#fff';
    case 'venue_owner': return Colors.gold;
    case 'pro': return '#a855f7';
    default: return Colors.text3;
  }
}

function roleBg(role: string): string {
  switch (role) {
    case 'admin': return 'rgba(255,255,255,0.12)';
    case 'venue_owner': return Colors.gold + '22';
    case 'pro': return '#a855f722';
    default: return 'rgba(144,152,184,0.10)';
  }
}

function initial(name: string | null, email: string | null): string {
  return ((name ?? email ?? 'U').charAt(0)).toUpperCase();
}

// ─── STAFF LOGIN ──────────────────────────────────────────────────────────────

function StaffLogin({ onSuccess }: { onSuccess: () => void }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authErr || !data.session) {
      setError('Incorrect email or password.');
      setLoading(false);
      return;
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .single();

    if (profile?.role === 'admin') {
      onSuccess();
    } else {
      await supabase.auth.signOut();
      setError('Access denied. This portal is for authorised staff only.');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={[ls.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={ls.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Card */}
        <View style={ls.card}>

          {/* Logo area */}
          <View style={ls.logoArea}>
            <View style={ls.logoIconWrap}>
              <Ionicons name="shield-checkmark" size={28} color={Colors.gold} />
            </View>
            <Text style={ls.brandName}>Tonight Vietnam</Text>
            <Text style={ls.portalLabel}>STAFF PORTAL</Text>
          </View>

          <View style={ls.divider} />

          {/* Fields */}
          <View style={ls.fields}>
            <Text style={ls.fieldLabel}>Email address</Text>
            <View style={ls.inputWrap}>
              <Ionicons name="mail-outline" size={16} color={Colors.text3} style={ls.inputIcon} />
              <TextInput
                style={ls.input}
                placeholder="staff@tonightvietnam.com"
                placeholderTextColor={Colors.text3}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </View>

            <Text style={[ls.fieldLabel, { marginTop: 16 }]}>Password</Text>
            <View style={ls.inputWrap}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.text3} style={ls.inputIcon} />
              <TextInput
                style={[ls.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.text3}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                onSubmitEditing={handleLogin}
                returnKeyType="go"
              />
              <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>
                <Ionicons
                  name={showPw ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={Colors.text3}
                  style={{ marginRight: 2 }}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={ls.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.red} />
                <Text style={ls.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [ls.loginBtn, loading && ls.loginBtnDisabled, pressed && { opacity: 0.88 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <>
                  <Text style={ls.loginBtnText}>Sign In to Portal</Text>
                  <Ionicons name="arrow-forward" size={16} color="#000" />
                </>
              )}
            </Pressable>
          </View>

          {/* Footer */}
          <View style={ls.cardFooter}>
            <Ionicons name="lock-closed" size={11} color={Colors.text3} />
            <Text style={ls.cardFooterText}>Authorised staff only · Tonight Vietnam</Text>
          </View>
        </View>

        {/* Page footer */}
        <Text style={ls.pageFooter}>© 2026 Tonight Vietnam. All rights reserved.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── ACCESS DENIED ────────────────────────────────────────────────────────────

function AccessDenied({ onSignOut }: { onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[ad.root, { paddingTop: insets.top }]}>
      <View style={ad.card}>
        <View style={ad.iconWrap}>
          <Ionicons name="ban-outline" size={36} color={Colors.red} />
        </View>
        <Text style={ad.title}>Access Denied</Text>
        <Text style={ad.sub}>
          Your account does not have staff access to this portal. Please contact your administrator.
        </Text>
        <Pressable style={({ pressed }) => [ad.btn, pressed && { opacity: 0.8 }]} onPress={onSignOut}>
          <Text style={ad.btnText}>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function SectionLabel({
  icon,
  title,
  count,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  count?: number;
}) {
  return (
    <View style={s.sectionLabel}>
      <View style={s.sectionIconWrap}>
        <Ionicons name={icon} size={13} color={Colors.gold} />
      </View>
      <Text style={s.sectionLabelText}>{title}</Text>
      {count !== undefined && (
        <View style={s.sectionCount}>
          <Text style={s.sectionCountText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function EmptyMsg({ emoji, msg }: { emoji: string; msg: string }) {
  return (
    <View style={s.emptyWrap}>
      <Text style={s.emptyEmoji}>{emoji}</Text>
      <Text style={s.emptyMsg}>{msg}</Text>
    </View>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <View style={[s.roleBadge, { backgroundColor: roleBg(role) }]}>
      <Text style={[s.roleText, { color: roleColor(role) }]}>{role}</Text>
    </View>
  );
}

function MetricCard({
  icon, label, value, color, sub, urgent,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
  color: string;
  sub: string;
  urgent?: boolean;
}) {
  return (
    <View style={[s.metricCard, urgent && { borderColor: color + '55' }]}>
      <View style={[s.metricIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={17} color={color} />
        {urgent && <View style={s.urgentDot} />}
      </View>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricSub}>{sub}</Text>
    </View>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────

function OverviewTab({
  stats, newBars, newMembers, refreshing, onRefresh,
}: {
  stats: Stats;
  newBars: VenueRequest[];
  newMembers: Profile[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
    >
      <View style={s.metricGrid}>
        <MetricCard icon="people" label="Total Members" value={stats.totalMembers} color="#a855f7" sub="all time" />
        <MetricCard icon="trending-up" label="New This Week" value={stats.newThisWeek} color={Colors.green} sub="last 7 days" />
        <MetricCard icon="ticket" label="Live Events" value={stats.liveEvents} color="#3b82f6" sub="published" />
        <MetricCard
          icon="time"
          label="Pending Reviews"
          value={stats.pendingReviews}
          color="#f97316"
          sub="venue requests"
          urgent={stats.pendingReviews > 0}
        />
      </View>

      <SectionLabel icon="storefront" title="Newly Joined Bars" count={newBars.length} />
      {newBars.length === 0 ? (
        <EmptyMsg emoji="🏢" msg="No venues approved yet" />
      ) : (
        <View style={s.listCard}>
          {newBars.map((bar, i) => (
            <View key={bar.id} style={[s.barRow, i > 0 && s.rowBorder]}>
              <View style={s.barEmojiWrap}>
                <Text style={s.barEmoji}>🏢</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.barName}>{bar.venue_name}</Text>
                <Text style={s.barCity}>{bar.city}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={s.liveBadge}>
                  <Text style={s.liveBadgeText}>LIVE</Text>
                </View>
                <Text style={s.barTime}>{relativeTime(bar.reviewed_at ?? bar.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <SectionLabel icon="person-add" title="New Community Sign-Ups" count={newMembers.length} />
      {newMembers.length === 0 ? (
        <EmptyMsg emoji="👤" msg="No members yet" />
      ) : (
        <View style={s.listCard}>
          {newMembers.map((m, i) => (
            <View key={m.id} style={[s.memberRow, i > 0 && s.rowBorder]}>
              <View style={[s.memberAvatar, { backgroundColor: roleBg(m.role) }]}>
                <Text style={[s.memberAvatarText, { color: roleColor(m.role) }]}>
                  {initial(m.full_name, m.email)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>{m.full_name ?? m.email?.split('@')[0] ?? 'Unknown'}</Text>
                <Text style={s.memberEmail} numberOfLines={1}>{m.email ?? '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <RoleBadge role={m.role} />
                <Text style={s.memberTime}>{relativeTime(m.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── MEMBERS TAB ──────────────────────────────────────────────────────────────

function MembersTab({ members }: { members: Profile[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
    );
  }, [members, query]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchBar}>
        <Ionicons name="search" size={15} color={Colors.text3} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name, email or role…"
          placeholderTextColor={Colors.text3}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Colors.text3} />
          </Pressable>
        )}
      </View>
      <Text style={s.resultCount}>
        {filtered.length} member{filtered.length !== 1 ? 's' : ''}
      </Text>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListEmptyComponent={<EmptyMsg emoji="🔍" msg="No results found" />}
        renderItem={({ item, index }) => (
          <View style={[s.memberListRow, index === 0 && { borderTopWidth: 0 }]}>
            <View style={[s.mlAvatar, { backgroundColor: roleBg(item.role) }]}>
              <Text style={[s.mlAvatarText, { color: roleColor(item.role) }]}>
                {initial(item.full_name, item.email)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mlName}>{item.full_name ?? item.email?.split('@')[0] ?? 'Unknown'}</Text>
              <Text style={s.mlEmail} numberOfLines={1}>{item.email ?? '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <RoleBadge role={item.role} />
              <Text style={s.mlDate}>{relativeTime(item.created_at)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

// ─── VENUES TAB ───────────────────────────────────────────────────────────────

function VenueCard({
  req, onApprove, onReject,
}: {
  req: VenueRequest;
  onApprove: (r: VenueRequest) => void;
  onReject: (r: VenueRequest) => void;
}) {
  return (
    <View style={s.venueCard}>
      <View style={s.vcHead}>
        <View style={s.vcInit}>
          <Text style={s.vcInitText}>{req.full_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.vcName}>{req.full_name}</Text>
          <Text style={s.vcEmail}>{req.email}</Text>
        </View>
        <Text style={s.vcTime}>{relativeTime(req.created_at)}</Text>
      </View>
      <View style={s.vcBody}>
        <View style={s.vcDetailRow}>
          <Ionicons name="storefront-outline" size={13} color={Colors.gold} />
          <Text style={[s.vcDetailText, { color: Colors.text, fontWeight: '700' }]}>{req.venue_name}</Text>
        </View>
        <View style={s.vcDetailRow}>
          <Ionicons name="location-outline" size={13} color={Colors.text3} />
          <Text style={s.vcDetailText}>{req.city}</Text>
        </View>
        {req.website ? (
          <View style={s.vcDetailRow}>
            <Ionicons name="globe-outline" size={13} color={Colors.text3} />
            <Text style={[s.vcDetailText, { color: '#3b82f6' }]} numberOfLines={1}>{req.website}</Text>
          </View>
        ) : null}
        {req.description ? (
          <Text style={s.vcDesc} numberOfLines={4}>{req.description}</Text>
        ) : null}
      </View>
      {req.status === 'pending' ? (
        <View style={s.vcActions}>
          <Pressable style={({ pressed }) => [s.vcReject, pressed && { opacity: 0.7 }]} onPress={() => onReject(req)}>
            <Ionicons name="close-circle-outline" size={16} color={Colors.red} />
            <Text style={s.vcRejectText}>Reject</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.vcApprove, pressed && { opacity: 0.7 }]} onPress={() => onApprove(req)}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#000" />
            <Text style={s.vcApproveText}>Approve & Go Live</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[s.vcStatusBar, req.status === 'approved' ? s.vcStatusApproved : s.vcStatusRejected]}>
          <Ionicons
            name={req.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
            size={14}
            color={req.status === 'approved' ? Colors.green : Colors.red}
          />
          <Text style={[s.vcStatusText, { color: req.status === 'approved' ? Colors.green : Colors.red }]}>
            {req.status === 'approved' ? 'Approved' : 'Rejected'}
            {req.reviewed_at ? ` · ${relativeTime(req.reviewed_at)}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

function VenuesTab({
  requests, refreshing, onRefresh, onApprove, onReject,
}: {
  requests: VenueRequest[];
  refreshing: boolean;
  onRefresh: () => void;
  onApprove: (r: VenueRequest) => void;
  onReject: (r: VenueRequest) => void;
}) {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const filtered = requests.filter((r) => r.status === filter);
  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };
  const FILTERS: { key: 'pending' | 'approved' | 'rejected'; label: string; color: string }[] = [
    { key: 'pending', label: 'Pending', color: '#f97316' },
    { key: 'approved', label: 'Approved', color: Colors.green },
    { key: 'rejected', label: 'Rejected', color: Colors.red },
  ];
  return (
    <View style={{ flex: 1 }}>
      <View style={s.venueFilterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[s.venueFilterBtn, filter === f.key && { backgroundColor: f.color + '20', borderColor: f.color }]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.venueFilterText, filter === f.key && { color: f.color }]}>{f.label}</Text>
            {counts[f.key] > 0 && (
              <View style={[s.filterCountBubble, { backgroundColor: filter === f.key ? f.color : Colors.card2 }]}>
                <Text style={[s.filterCountNum, filter === f.key && { color: '#000' }]}>{counts[f.key]}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {filtered.length === 0 ? (
          <EmptyMsg
            emoji={filter === 'pending' ? '📭' : filter === 'approved' ? '✅' : '🚫'}
            msg={`No ${filter} requests`}
          />
        ) : (
          <View style={{ gap: 14 }}>
            {filtered.map((req) => (
              <VenueCard key={req.id} req={req} onApprove={onApprove} onReject={onReject} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── EVENTS TAB ───────────────────────────────────────────────────────────────

function EventsTab({ events }: { events: EventRow[] }) {
  return (
    <FlatList
      data={events}
      keyExtractor={(item) => String(item.id)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
      ListEmptyComponent={<EmptyMsg emoji="🎫" msg="No events in the database yet" />}
      renderItem={({ item, index }) => (
        <View style={[s.evRow, index === 0 && { borderTopWidth: 0 }]}>
          <View style={s.evEmoji}>
            <Text style={{ fontSize: 22 }}>{item.emoji ?? '🎵'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.evTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.evVenue} numberOfLines={1}>{item.venue ?? '—'} · {item.city ?? '—'}</Text>
            <Text style={s.evDate}>{shortDate(item.date)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 5 }}>
            {item.is_new && <View style={s.evNewBadge}><Text style={s.evNewText}>NEW</Text></View>}
            {item.featured && <View style={s.evFeatBadge}><Text style={s.evFeatText}>FEAT</Text></View>}
            <Text style={s.evAdded}>{relativeTime(item.created_at)}</Text>
          </View>
        </View>
      )}
    />
  );
}

// ─── PORTAL DASHBOARD ─────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline' },
  { key: 'members', label: 'Members', icon: 'people-outline' },
  { key: 'venues', label: 'Venues', icon: 'storefront-outline' },
  { key: 'events', label: 'Events', icon: 'ticket-outline' },
];

function PortalDashboard({ onSignOut }: { onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const [stats, setStats] = useState<Stats>({ totalMembers: 0, newThisWeek: 0, liveEvents: 0, pendingReviews: 0 });
  const [members, setMembers] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<VenueRequest[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  async function fetchAll() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalMembers },
      { count: newThisWeek },
      { count: liveEvents },
      { count: pendingReviews },
      { data: profileData },
      { data: requestData },
      { data: eventData },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('venue_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('id, full_name, email, role, created_at').order('created_at', { ascending: false }),
      supabase.from('venue_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('id, title, genre, city, venue, date, emoji, featured, is_new, created_at').order('created_at', { ascending: false }),
    ]);

    setStats({
      totalMembers: totalMembers ?? 0,
      newThisWeek: newThisWeek ?? 0,
      liveEvents: liveEvents ?? 0,
      pendingReviews: pendingReviews ?? 0,
    });
    setMembers((profileData ?? []) as Profile[]);
    setRequests((requestData ?? []) as VenueRequest[]);
    setEvents((eventData ?? []) as EventRow[]);
    setLastRefreshed(new Date());
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAll().finally(() => setLoading(false));
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }

  async function handleApprove(req: VenueRequest) {
    Alert.alert(
      'Approve Venue',
      `Grant venue_owner access to ${req.full_name}?\n\nThey will be able to publish events on Tonight immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            const now = new Date().toISOString();
            const [r1, r2] = await Promise.all([
              supabase.from('venue_requests').update({ status: 'approved', reviewed_at: now }).eq('id', req.id),
              supabase.from('profiles').update({ role: 'venue_owner' }).eq('id', req.user_id),
            ]);
            if (r1.error || r2.error) {
              Alert.alert('Error', r1.error?.message ?? r2.error?.message ?? 'Something went wrong.');
            } else {
              await fetchAll();
            }
          },
        },
      ]
    );
  }

  async function handleReject(req: VenueRequest) {
    Alert.alert(
      'Reject Request',
      `Reject the application from ${req.full_name} (${req.venue_name})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('venue_requests')
              .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
              .eq('id', req.id);
            if (error) Alert.alert('Error', error.message);
            else await fetchAll();
          },
        },
      ]
    );
  }

  const newBars = requests.filter((r) => r.status === 'approved').slice(0, 8);
  const newMembers = members.slice(0, 10);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <View style={[db.root, { paddingTop: insets.top }]}>

      {/* ── Dashboard Header ── */}
      <View style={db.header}>
        <View style={db.headerLeft}>
          <View style={db.headerLogoWrap}>
            <Ionicons name="shield-checkmark" size={16} color={Colors.gold} />
          </View>
          <View>
            <Text style={db.headerBrand}>Tonight Vietnam</Text>
            <Text style={db.headerSub}>
              Admin Portal · {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
        <View style={db.headerActions}>
          <Pressable
            style={({ pressed }) => [db.headerBtn, pressed && { opacity: 0.65 }]}
            onPress={onRefresh}
          >
            <Ionicons name="refresh-outline" size={17} color={Colors.text3} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [db.headerBtn, db.headerSignOut, pressed && { opacity: 0.65 }]}
            onPress={onSignOut}
          >
            <Ionicons name="log-out-outline" size={17} color={Colors.red} />
          </Pressable>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={db.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const hasBadge = tab.key === 'venues' && pendingCount > 0;
          return (
            <Pressable
              key={tab.key}
              style={[db.tabItem, active && db.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <View>
                <Ionicons name={tab.icon} size={15} color={active ? Colors.gold : Colors.text3} />
                {hasBadge && <View style={db.tabBadge} />}
              </View>
              <Text style={[db.tabLabel, active && db.tabLabelActive]}>{tab.label}</Text>
              {active && <View style={db.tabUnderline} />}
            </Pressable>
          );
        })}
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={db.loadingWrap}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={db.loadingText}>Loading portal data…</Text>
        </View>
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewTab stats={stats} newBars={newBars} newMembers={newMembers} refreshing={refreshing} onRefresh={onRefresh} />
          )}
          {activeTab === 'members' && <MembersTab members={members} />}
          {activeTab === 'venues' && (
            <VenuesTab requests={requests} refreshing={refreshing} onRefresh={onRefresh} onApprove={handleApprove} onReject={handleReject} />
          )}
          {activeTab === 'events' && <EventsTab events={events} />}
        </>
      )}
    </View>
  );
}

// ─── ROOT — Auth Gate ─────────────────────────────────────────────────────────

export default function Portal() {
  const [view, setView] = useState<PortalView>('loading');

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setView('login');
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .single();

    setView(profile?.role === 'admin' ? 'dashboard' : 'denied');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setView('login');
  }

  if (view === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Ionicons name="shield-checkmark" size={32} color={Colors.gold} />
        <ActivityIndicator color={Colors.gold} />
        <Text style={{ color: Colors.text3, fontSize: 13 }}>Verifying access…</Text>
      </View>
    );
  }

  if (view === 'login') {
    return <StaffLogin onSuccess={() => setView('dashboard')} />;
  }

  if (view === 'denied') {
    return <AccessDenied onSignOut={handleSignOut} />;
  }

  return <PortalDashboard onSignOut={handleSignOut} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Staff Login styles
const ls = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  logoArea: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 28,
    gap: 8,
  },
  logoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.gold + '18',
    borderWidth: 1.5,
    borderColor: Colors.gold + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.gold,
    letterSpacing: -0.3,
  },
  portalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text3,
    letterSpacing: 2.5,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 0,
  },
  fields: {
    padding: 24,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text2,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 13,
    gap: 10,
  },
  inputIcon: {
    width: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.red + '15',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.red + '33',
  },
  errorText: {
    fontSize: 13,
    color: Colors.red,
    flex: 1,
    lineHeight: 18,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 13,
    paddingVertical: 15,
    marginTop: 22,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg2,
  },
  cardFooterText: {
    fontSize: 11,
    color: Colors.text3,
  },
  pageFooter: {
    marginTop: 24,
    fontSize: 11,
    color: Colors.text3,
    textAlign: 'center',
  },
});

// Access Denied styles
const ad = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.red + '33',
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.red + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  sub: {
    fontSize: 14,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 8,
  },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text2,
  },
});

// Dashboard styles
const db = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.gold + '18',
    borderWidth: 1,
    borderColor: Colors.gold + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrand: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.gold,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 10,
    color: Colors.text3,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSignOut: {
    borderColor: Colors.red + '44',
    backgroundColor: Colors.red + '10',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 3,
    position: 'relative',
  },
  tabItemActive: {
    backgroundColor: Colors.bg3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text3,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: Colors.gold,
    fontWeight: '700',
  },
  tabBadge: {
    position: 'absolute',
    top: -2,
    right: -5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#f97316',
    borderWidth: 1.5,
    borderColor: Colors.bg2,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: Colors.gold,
    borderRadius: 2,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.text3,
    fontWeight: '600',
  },
});

// Shared content styles
const s = StyleSheet.create({
  // Metrics
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 10,
  },
  metricCard: {
    width: '47.5%',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  urgentDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f97316',
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  metricValue: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text2,
  },
  metricSub: {
    fontSize: 10,
    color: Colors.text3,
  },
  // Section label
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: Colors.gold + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text2,
    flex: 1,
    letterSpacing: 0.2,
  },
  sectionCount: {
    backgroundColor: Colors.card2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text3,
  },
  // List card
  listCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  // Bars
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  barEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gold + '15',
    borderWidth: 1,
    borderColor: Colors.gold + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barEmoji: { fontSize: 18 },
  barName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  barCity: { fontSize: 12, color: Colors.text3, marginTop: 2 },
  liveBadge: {
    backgroundColor: Colors.green + '22',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.green + '55',
  },
  liveBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.green, letterSpacing: 0.5 },
  barTime: { fontSize: 11, color: Colors.text3 },
  // Members (overview)
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 16, fontWeight: '800' },
  memberName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  memberEmail: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  memberTime: { fontSize: 10, color: Colors.text3 },
  // Role badge
  roleBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  roleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyEmoji: { fontSize: 34 },
  emptyMsg: { fontSize: 14, color: Colors.text3, fontWeight: '600' },
  // Members tab
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  resultCount: { fontSize: 12, color: Colors.text3, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8 },
  memberListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  mlAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  mlAvatarText: { fontSize: 17, fontWeight: '800' },
  mlName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  mlEmail: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  mlDate: { fontSize: 10, color: Colors.text3 },
  // Venues tab
  venueFilterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  venueFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  venueFilterText: { fontSize: 13, fontWeight: '600', color: Colors.text3 },
  filterCountBubble: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  filterCountNum: { fontSize: 10, fontWeight: '800', color: Colors.text3 },
  venueCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  vcHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg2,
  },
  vcInit: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.gold + '22',
    borderWidth: 1.5,
    borderColor: Colors.gold + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vcInitText: { fontSize: 17, fontWeight: '800', color: Colors.gold },
  vcName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  vcEmail: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  vcTime: { fontSize: 11, color: Colors.text3 },
  vcBody: { padding: 14, gap: 7 },
  vcDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  vcDetailText: { fontSize: 13, color: Colors.text2, flex: 1 },
  vcDesc: {
    fontSize: 13,
    color: Colors.text3,
    lineHeight: 19,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  vcActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border },
  vcReject: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  vcRejectText: { fontSize: 14, fontWeight: '700', color: Colors.red },
  vcApprove: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: Colors.green,
  },
  vcApproveText: { fontSize: 14, fontWeight: '800', color: '#000' },
  vcStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  vcStatusApproved: { backgroundColor: Colors.green + '0d' },
  vcStatusRejected: { backgroundColor: Colors.red + '0d' },
  vcStatusText: { fontSize: 13, fontWeight: '700' },
  // Events tab
  evRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  evEmoji: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  evTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  evVenue: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  evDate: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  evNewBadge: { backgroundColor: Colors.green + '22', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  evNewText: { fontSize: 9, fontWeight: '800', color: Colors.green, letterSpacing: 0.5 },
  evFeatBadge: { backgroundColor: Colors.gold + '22', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  evFeatText: { fontSize: 9, fontWeight: '800', color: Colors.gold, letterSpacing: 0.5 },
  evAdded: { fontSize: 10, color: Colors.text3 },
});
