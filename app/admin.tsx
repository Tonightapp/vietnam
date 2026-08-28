import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

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
};

type Stats = {
  totalUsers: number;
  newThisWeek: number;
  pendingRequests: number;
  approvedVenues: number;
};

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, newThisWeek: 0, pendingRequests: 0, approvedVenues: 0 });
  const [requests, setRequests] = useState<VenueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  async function fetchData() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalUsers },
      { count: newThisWeek },
      { count: pendingRequests },
      { count: approvedVenues },
      { data: requestData },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('venue_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'venue_owner'),
      supabase.from('venue_requests').select('*').order('created_at', { ascending: false }),
    ]);

    setStats({
      totalUsers: totalUsers ?? 0,
      newThisWeek: newThisWeek ?? 0,
      pendingRequests: pendingRequests ?? 0,
      approvedVenues: approvedVenues ?? 0,
    });
    setRequests(requestData ?? []);
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  async function handleApprove(req: VenueRequest) {
    Alert.alert(
      'Approve Request',
      `Grant venue_owner access to ${req.full_name} (${req.venue_name})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            const now = new Date().toISOString();
            const [r1, r2] = await Promise.all([
              supabase
                .from('venue_requests')
                .update({ status: 'approved', reviewed_at: now })
                .eq('id', req.id),
              supabase
                .from('profiles')
                .update({ role: 'venue_owner' })
                .eq('id', req.user_id),
            ]);
            if (r1.error || r2.error) {
              Alert.alert('Error', r1.error?.message ?? r2.error?.message ?? 'Something went wrong.');
            } else {
              await fetchData();
            }
          },
        },
      ]
    );
  }

  async function handleReject(req: VenueRequest) {
    Alert.alert(
      'Reject Request',
      `Reject the request from ${req.full_name}?`,
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
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await fetchData();
            }
          },
        },
      ]
    );
  }

  const filteredRequests = requests.filter((r) => r.status === activeTab);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text2} />
        </Pressable>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        >
          {/* Stats row */}
          <View style={styles.statsGrid}>
            <StatCard label="Total Members" value={stats.totalUsers} icon="people-outline" color={Colors.gold} />
            <StatCard label="New This Week" value={stats.newThisWeek} icon="trending-up-outline" color={Colors.green} />
            <StatCard label="Pending Review" value={stats.pendingRequests} icon="time-outline" color="#f97316" badge={stats.pendingRequests > 0} />
            <StatCard label="Active Venues" value={stats.approvedVenues} icon="storefront-outline" color="#a855f7" />
          </View>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Venue Requests</Text>

          {/* Tab switcher */}
          <View style={styles.tabRow}>
            {(['pending', 'approved', 'rejected'] as const).map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Request cards */}
          {filteredRequests.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>
                {activeTab === 'pending' ? '📭' : activeTab === 'approved' ? '✅' : '🚫'}
              </Text>
              <Text style={styles.emptyText}>
                No {activeTab} requests
              </Text>
            </View>
          ) : (
            <View style={styles.cardList}>
              {filteredRequests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  {/* Card header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarInitial}>
                        {req.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{req.full_name}</Text>
                      <Text style={styles.cardEmail}>{req.email}</Text>
                    </View>
                    <View style={[styles.statusBadge, statusStyle(req.status)]}>
                      <Text style={styles.statusText}>{req.status}</Text>
                    </View>
                  </View>

                  {/* Venue info */}
                  <View style={styles.cardBody}>
                    <InfoRow icon="storefront-outline" value={req.venue_name} />
                    <InfoRow icon="location-outline" value={req.city} />
                    {req.website ? <InfoRow icon="globe-outline" value={req.website} /> : null}
                    {req.description ? (
                      <Text style={styles.cardDesc} numberOfLines={3}>{req.description}</Text>
                    ) : null}
                    <Text style={styles.cardDate}>Submitted {formatDate(req.created_at)}</Text>
                  </View>

                  {/* Actions — only for pending */}
                  {req.status === 'pending' && (
                    <View style={styles.cardActions}>
                      <Pressable
                        style={({ pressed }) => [styles.rejectBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => handleReject(req)}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => handleApprove(req)}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  badge,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  badge?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={20} color={color} />
        {badge && <View style={styles.badgeDot} />}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={13} color={Colors.text3} style={{ marginRight: 6 }} />
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function statusStyle(status: string) {
  if (status === 'approved') return { backgroundColor: Colors.green + '22', borderColor: Colors.green };
  if (status === 'rejected') return { backgroundColor: Colors.red + '22', borderColor: Colors.red };
  return { backgroundColor: '#f97316' + '22', borderColor: '#f97316' };
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  badgeDot: {
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
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text3,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: Colors.gold,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text3,
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '800',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.text3,
    fontWeight: '600',
  },
  cardList: {
    paddingHorizontal: 16,
    gap: 14,
  },
  requestCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.gold + '33',
    borderWidth: 1.5,
    borderColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.gold,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  cardEmail: {
    fontSize: 12,
    color: Colors.text3,
    marginTop: 1,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 13,
    color: Colors.text2,
    flex: 1,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.text3,
    lineHeight: 19,
    marginTop: 4,
  },
  cardDate: {
    fontSize: 11,
    color: Colors.text3,
    marginTop: 6,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.red,
  },
  approveBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: Colors.green + '11',
  },
  approveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.green,
  },
});
