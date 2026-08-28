import React, { useState, useEffect } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { Deal } from '@/constants/Data';

type Props = {
  deal: Deal;
};

function getTimeLeft(endTime: string): string {
  // Parse endTime like "10:00 PM"
  const [timePart, ampm] = endTime.split(' ');
  const [hourStr, minStr] = timePart.split(':');
  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const now = new Date();
  const end = new Date();
  end.setHours(hour, min, 0, 0);

  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ended';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m left`;
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hrs}h ${mins}m left`;
}

export default function DealCard({ deal }: Props) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(deal.endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(deal.endTime));
    }, 60000);
    return () => clearInterval(interval);
  }, [deal.endTime]);

  return (
    <View style={styles.card}>
      {/* Image header */}
      <View style={styles.imgWrap}>
        <Image source={{ uri: deal.img }} style={styles.img} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(10,11,20,0.7)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Discount badge */}
        <View style={[styles.discountBadge, { backgroundColor: deal.badgeColor }]}>
          <Text style={styles.discountText}>{deal.discount}</Text>
        </View>

        {/* Countdown pill */}
        <View style={styles.countdownPill}>
          <Text style={styles.countdownText}>{timeLeft}</Text>
        </View>

        {/* Venue row */}
        <View style={styles.venueRow}>
          <Text style={styles.venueEmoji}>{deal.emoji}</Text>
          <Text style={styles.venueName} numberOfLines={1}>{deal.venueName}</Text>
          <Text style={styles.venueCity}>{deal.city}</Text>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{deal.title}</Text>
        <Text style={styles.desc} numberOfLines={2}>{deal.desc}</Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.timeWindow}>{deal.startTime} – {deal.endTime}</Text>
          <Pressable
            style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.claimBtnText}>Claim →</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imgWrap: {
    height: 90,
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  countdownPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10,11,20,0.75)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  countdownText: {
    color: Colors.gold,
    fontSize: 10,
    fontWeight: '700',
  },
  venueRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 4,
  },
  venueEmoji: {
    fontSize: 12,
  },
  venueName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  venueCity: {
    color: Colors.text3,
    fontSize: 10,
  },
  body: {
    padding: 12,
    gap: 5,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 18,
  },
  desc: {
    fontSize: 11,
    color: Colors.text3,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeWindow: {
    fontSize: 10,
    color: Colors.text3,
    flex: 1,
  },
  claimBtn: {
    backgroundColor: Colors.gold + '22',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  claimBtnText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
  },
});
