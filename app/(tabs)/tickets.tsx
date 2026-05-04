import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/Colors';
import { getTickets, Ticket } from '@/lib/storage';

function TicketCard({ ticket }: { ticket: Ticket }) {
  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  const isValid = ticket.status === 'valid';
  const isCheckedIn = ticket.status === 'checked_in';

  return (
    <View style={styles.ticketWrap}>
      {/* Image header */}
      {ticket.img ? (
        <View style={styles.ticketImgWrap}>
          <Image source={{ uri: ticket.img }} style={styles.ticketImg} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(10,11,20,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.ticketImgOverlay}>
            <Text style={styles.ticketImgLabel}>Tonight · {ticket.ticketType} Ticket</Text>
            <View style={[styles.statusBadge, isValid || isCheckedIn ? styles.statusGreen : styles.statusGrey]}>
              <Text style={styles.statusText}>
                {isCheckedIn ? 'CHECKED IN' : isValid ? 'CONFIRMED' : 'USED'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.ticketImgWrap, { backgroundColor: Colors.card2 }]}>
          <View style={styles.ticketImgOverlay}>
            <Text style={styles.ticketImgLabel}>Tonight · {ticket.ticketType} Ticket</Text>
            <View style={[styles.statusBadge, isValid ? styles.statusGreen : styles.statusGrey]}>
              <Text style={styles.statusText}>{isValid ? 'CONFIRMED' : 'USED'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Torn edge */}
      <View style={styles.tornEdge}>
        <View style={styles.tornCircleLeft} />
        <View style={styles.tornDash} />
        <View style={styles.tornCircleRight} />
      </View>

      {/* White body */}
      <View style={styles.ticketBody}>
        <View style={styles.ticketBodyRow}>
          {/* QR Code */}
          <View style={styles.qrWrap}>
            <QRCode value={`TONIGHT:${ticket.ref}`} size={100} color="#000" backgroundColor="#fff" />
          </View>

          {/* Details */}
          <View style={styles.ticketDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>NAME</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{ticket.buyerName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>GUESTS</Text>
              <Text style={styles.detailValue}>{ticket.qty}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>TYPE</Text>
              <Text style={styles.detailValue}>{ticket.ticketType}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DATE</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{formatDate(ticket.date)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Barcode footer */}
      <View style={styles.barcodeFooter}>
        <Text style={styles.barcodeRef}>{ticket.ref}</Text>
        <Text style={styles.barcodeSub}>Scan at venue entry</Text>
      </View>

      {/* Arrival badge */}
      {ticket.arrivedAt && (
        <View style={styles.arrivalBadge}>
          <Text style={styles.arrivalText}>
            ✅ Arrival confirmed · {new Date(ticket.arrivedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TicketsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useFocusEffect(
    useCallback(() => {
      getTickets().then(setTickets);
    }, [])
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Tickets</Text>
        <Text style={styles.headerCount}>{tickets.length} booking{tickets.length !== 1 ? 's' : ''}</Text>
      </View>

      {tickets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎟️</Text>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptySub}>Book an event to see your tickets here</Text>
          <Pressable
            style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push('/(tabs)/events')}
          >
            <Text style={styles.browseBtnText}>Browse Events</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.ref}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <TicketCard ticket={item} />}
        />
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
  list: {
    padding: 16,
    gap: 20,
    paddingBottom: 40,
  },
  ticketWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ticketImgWrap: {
    height: 100,
    position: 'relative',
  },
  ticketImg: {
    width: '100%',
    height: '100%',
  },
  ticketImgOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ticketImgLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusGreen: {
    backgroundColor: Colors.green,
  },
  statusGrey: {
    backgroundColor: '#888',
  },
  statusText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tornEdge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 4,
  },
  tornCircleLeft: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.bg,
    marginLeft: -9,
  },
  tornDash: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#ddd',
    marginHorizontal: 4,
  },
  tornCircleRight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.bg,
    marginRight: -9,
  },
  ticketBody: {
    backgroundColor: '#fff',
    padding: 14,
  },
  ticketBodyRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  qrWrap: {
    padding: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  ticketDetails: {
    flex: 1,
    gap: 8,
  },
  detailRow: {
    gap: 1,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  barcodeFooter: {
    backgroundColor: '#f7f7f7',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
    gap: 2,
  },
  barcodeRef: {
    fontFamily: 'monospace' as const,
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 2,
  },
  barcodeSub: {
    fontSize: 10,
    color: '#999',
  },
  arrivalBadge: {
    backgroundColor: '#fffbea',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#ffe58f',
    alignItems: 'center',
  },
  arrivalText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gold,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.text3,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  browseBtn: {
    marginTop: 10,
    backgroundColor: Colors.gold,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
});
