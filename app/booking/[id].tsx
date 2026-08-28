import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Animated,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/Colors';
import { EVENTS } from '@/constants/Data';
import { saveTicket, genSerial, Ticket } from '@/lib/storage';

type TicketOption = 'entry' | 'guestlist';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function TicketPreview({ ticket }: { ticket: Ticket }) {
  return (
    <View style={styles.ticketCard}>
      {/* Header image */}
      {ticket.img ? (
        <View style={styles.ticketImgWrap}>
          <Image source={{ uri: ticket.img }} style={styles.ticketImg} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(10,11,20,0.8)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.ticketImgOverlay}>
            <Text style={styles.ticketImgLabel}>Tonight · {ticket.ticketType} Ticket</Text>
            <View style={styles.confirmedBadge}>
              <Text style={styles.confirmedText}>CONFIRMED</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.ticketImgWrap, { backgroundColor: Colors.card2 }]}>
          <View style={styles.ticketImgOverlay}>
            <Text style={styles.ticketImgLabel}>Tonight · {ticket.ticketType} Ticket</Text>
            <View style={styles.confirmedBadge}>
              <Text style={styles.confirmedText}>CONFIRMED</Text>
            </View>
          </View>
        </View>
      )}

      {/* Torn divider */}
      <View style={styles.tornEdge}>
        <View style={styles.tornCircleLeft} />
        <View style={styles.tornDash} />
        <View style={styles.tornCircleRight} />
      </View>

      {/* White body */}
      <View style={styles.ticketBody}>
        <View style={styles.ticketBodyRow}>
          <View style={styles.qrWrap}>
            <QRCode
              value={`TONIGHT:${ticket.ref}`}
              size={120}
              color="#000"
              backgroundColor="#fff"
            />
          </View>
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
              <Text style={styles.detailLabel}>ISSUED</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {new Date(ticket.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Barcode footer */}
      <View style={styles.barcodeFooter}>
        <Text style={styles.barcodeRef}>{ticket.ref}</Text>
        <Text style={styles.barcodeSub}>Scan at venue entry</Text>
      </View>
    </View>
  );
}

export default function BookingScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const eventId = Number(id);
  const event = EVENTS.find((e) => e.id === eventId);

  const [step, setStep] = useState<1 | 2>(1);
  const [ticketOption, setTicketOption] = useState<TicketOption>(type === 'guestlist' ? 'guestlist' : 'entry');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const checkAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step === 2) {
      Animated.spring(checkAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 6,
      }).start();
    }
  }, [step, checkAnim]);

  if (!event) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={{ color: Colors.text, textAlign: 'center', marginTop: 40 }}>Event not found.</Text>
      </View>
    );
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Full name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!event) return;
    if (!validate()) return;

    const ref = genSerial();
    const newTicket: Ticket = {
      ref,
      eventId: event.id,
      eventTitle: event.title,
      venue: event.venue,
      city: event.city,
      date: event.date,
      img: event.img,
      ticketType: ticketOption === 'guestlist' ? 'Guestlist' : 'Entry',
      qty,
      buyerName: name.trim(),
      buyerEmail: email.trim(),
      buyerPhone: phone.trim(),
      status: 'valid',
      issuedAt: new Date().toISOString(),
    };

    await saveTicket(newTicket);
    setTicket(newTicket);
    setStep(2);
  }

  function handleEmailTicket() {
    if (!event || !ticket) return;
    const subject = encodeURIComponent(`Your Tonight Ticket: ${event.title}`);
    const body = encodeURIComponent(
      `Hi ${ticket.buyerName},\n\nYour booking is confirmed!\n\n` +
      `Event: ${event.title}\nVenue: ${event.venue}, ${event.city}\nDate: ${formatDate(event.date)}\n` +
      `Type: ${ticket.ticketType} × ${ticket.qty}\nRef: ${ticket.ref}\n\n` +
      `Show this at the venue entrance.\n\nSee you tonight! 🎉`
    );
    Linking.openURL(`mailto:${ticket.buyerEmail}?subject=${subject}&body=${body}`);
  }

  if (step === 2 && ticket) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.confirmScroll}>
          {/* Check animation */}
          <Animated.View
            style={[
              styles.checkCircle,
              {
                transform: [{ scale: checkAnim }],
                opacity: checkAnim,
              },
            ]}
          >
            <Text style={styles.checkEmoji}>✅</Text>
          </Animated.View>

          <Text style={styles.confirmedHeading}>
            {ticket.ticketType === 'Guestlist' ? "You're on the guestlist!" : "You're booked!"}
          </Text>
          <Text style={styles.confirmedSub}>
            {event.title} · {formatDate(event.date)}
          </Text>

          {/* Ticket card */}
          <TicketPreview ticket={ticket} />

          {/* CTA buttons */}
          <Pressable
            style={({ pressed }) => [styles.emailBtn, pressed && { opacity: 0.8 }]}
            onPress={handleEmailTicket}
          >
            <Text style={styles.emailBtnText}>📧 Send to {ticket.buyerEmail}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.viewTicketsBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              router.back();
              router.push('/(tabs)/tickets');
            }}
          >
            <Text style={styles.viewTicketsBtnText}>View in My Tickets →</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
        <Text style={styles.modalTitle}>Book Your Spot</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.formScroll}
      >
        {/* Event summary */}
        <View style={styles.eventSummary}>
          {event.img && (
            <Image source={{ uri: event.img }} style={styles.summaryThumb} resizeMode="cover" />
          )}
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryTitle} numberOfLines={2}>{event.title}</Text>
            <Text style={styles.summarySub}>{formatDate(event.date)}</Text>
            <Text style={styles.summarySub}>{event.venue}, {event.city}</Text>
          </View>
        </View>

        {/* Ticket option cards */}
        <Text style={styles.fieldLabel}>Select Ticket Type</Text>
        <View style={styles.optionCards}>
          <Pressable
            style={[styles.optionCard, ticketOption === 'entry' && styles.optionCardActive]}
            onPress={() => setTicketOption('entry')}
          >
            <Text style={styles.optionEmoji}>🎟️</Text>
            <Text style={[styles.optionLabel, ticketOption === 'entry' && styles.optionLabelActive]}>
              Book a Spot
            </Text>
            <Text style={styles.optionDesc}>Guaranteed entry</Text>
          </Pressable>
          <Pressable
            style={[styles.optionCard, ticketOption === 'guestlist' && styles.optionCardActive]}
            onPress={() => setTicketOption('guestlist')}
          >
            <Text style={styles.optionEmoji}>📋</Text>
            <Text style={[styles.optionLabel, ticketOption === 'guestlist' && styles.optionLabelActive]}>
              Join Guestlist
            </Text>
            <Text style={styles.optionDesc}>Priority access</Text>
          </Pressable>
        </View>

        {/* Form */}
        <Text style={styles.fieldLabel}>Full Name</Text>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          placeholder="Enter your full name"
          placeholderTextColor={Colors.text3}
          value={name}
          onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: '' })); }}
          autoCapitalize="words"
        />
        {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={[styles.input, errors.email && styles.inputError]}
          placeholder="your@email.com"
          placeholderTextColor={Colors.text3}
          value={email}
          onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: '' })); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput
          style={[styles.input, errors.phone && styles.inputError]}
          placeholder="+84 xxx xxx xxx"
          placeholderTextColor={Colors.text3}
          value={phone}
          onChangeText={(v) => { setPhone(v); setErrors((e) => ({ ...e, phone: '' })); }}
          keyboardType="phone-pad"
        />
        {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}

        <Text style={styles.fieldLabel}>Number of People</Text>
        <View style={styles.stepper}>
          <Pressable
            style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setQty((q) => Math.max(1, q - 1))}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{qty}</Text>
          <Pressable
            style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setQty((q) => Math.min(20, q + 1))}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText}>Get My Entry Ticket →</Text>
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: 20,
  },
  closeBtnText: {
    color: Colors.text2,
    fontSize: 16,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  formScroll: {
    padding: 20,
  },
  eventSummary: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  summaryInfo: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 20,
  },
  summarySub: {
    fontSize: 12,
    color: Colors.text3,
  },
  optionCards: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  optionCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  optionCardActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.gold + '15',
  },
  optionEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text2,
  },
  optionLabelActive: {
    color: Colors.gold,
  },
  optionDesc: {
    fontSize: 11,
    color: Colors.text3,
  },
  fieldLabel: {
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
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  inputError: {
    borderColor: Colors.red,
  },
  errorText: {
    fontSize: 12,
    color: Colors.red,
    marginTop: -12,
    marginBottom: 12,
    marginLeft: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    marginBottom: 24,
  },
  stepBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 22,
    color: Colors.gold,
    fontWeight: '600',
    lineHeight: 26,
  },
  stepValue: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  submitBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  // Confirmation screen
  confirmScroll: {
    padding: 20,
    alignItems: 'center',
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.green + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 20,
  },
  checkEmoji: {
    fontSize: 40,
  },
  confirmedHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmedSub: {
    fontSize: 14,
    color: Colors.text3,
    marginBottom: 24,
    textAlign: 'center',
  },
  // Ticket card
  ticketCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 20,
  },
  ticketImgWrap: {
    height: 130,
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
  confirmedBadge: {
    borderRadius: 10,
    backgroundColor: Colors.green,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confirmedText: {
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
  emailBtn: {
    width: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  emailBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  viewTicketsBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  viewTicketsBtnText: {
    color: Colors.text2,
    fontWeight: '700',
    fontSize: 15,
  },
});
