export type Event = {
  id: number;
  title: string;
  artist: string;
  genre: string;
  city: string;
  area: string;
  venue: string;
  date: string;
  img: string;
  emoji: string;
  grad: string;
  desc: string;
  featured: boolean;
  soldOut: boolean;
  attendees: number;
  isNew: boolean;
};

export type Artist = {
  id: number;
  name: string;
  genre: string;
  emoji: string;
};

export type Deal = {
  id: number;
  venueName: string;
  city: string;
  emoji: string;
  img: string;
  title: string;
  discount: string;
  badgeColor: string;
  desc: string;
  startTime: string;
  endTime: string;
};

export const EVENTS: Event[] = [
  {
    id: 1,
    title: 'Neon Pulse: Techno Night',
    artist: 'DJ Khanh Ly',
    genre: 'Techno',
    city: 'Ho Chi Minh City',
    area: 'District 1',
    venue: 'Broma Not A Bar',
    date: '2026-04-05T21:00:00',
    img: 'https://images.unsplash.com/photo-1571266752849-f5a498db9350?auto=format&fit=crop&w=800&q=80',
    emoji: '🎛️',
    grad: 'techno-grad',
    desc: 'Lose yourself in four hours of pounding techno rhythms curated by Vietnam\'s most celebrated underground DJ. Expect dark, hypnotic sets and a crowd that lives for the bassline.',
    featured: true,
    soldOut: false,
    attendees: 312,
    isNew: false,
  },
  {
    id: 4,
    title: 'Jazz & Wine Evening',
    artist: 'The Saigon Quartet',
    genre: 'Jazz',
    city: 'Ho Chi Minh City',
    area: 'District 3',
    venue: 'The Reverie Saigon',
    date: '2026-04-10T19:30:00',
    img: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80',
    emoji: '🎷',
    grad: 'jazz-grad',
    desc: 'An intimate evening of live jazz paired with curated wines from around the world. The Saigon Quartet brings warmth and sophistication to Saigon\'s most elegant rooftop.',
    featured: false,
    soldOut: false,
    attendees: 95,
    isNew: true,
  },
  {
    id: 5,
    title: 'Hip-Hop Takeover',
    artist: 'Suboi & Guests',
    genre: 'Hip-Hop',
    city: 'Hanoi',
    area: 'Tay Ho',
    venue: 'Savage Club',
    date: '2026-04-08T21:00:00',
    img: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=800&q=80',
    emoji: '🎤',
    grad: 'hiphop-grad',
    desc: 'Vietnam\'s queen of hip-hop, Suboi, returns to Hanoi with a stacked lineup of local and regional MCs. Expect freestyle battles, live beats, and energy through the roof.',
    featured: false,
    soldOut: true,
    attendees: 600,
    isNew: false,
  },
  {
    id: 10,
    title: 'Saigon EDM Massive',
    artist: 'KSHMR (Live)',
    genre: 'EDM',
    city: 'Ho Chi Minh City',
    area: 'Binh Thanh',
    venue: 'GEM Center',
    date: '2026-04-20T20:00:00',
    img: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80',
    emoji: '⚡',
    grad: 'edm-grad',
    desc: 'KSHMR brings his spectacular live show to Saigon for the first time. Expect massive production, crowd-lifting anthems, and a night that redefines what EDM means in Southeast Asia.',
    featured: true,
    soldOut: false,
    attendees: 3200,
    isNew: false,
  },
  {
    id: 11,
    title: 'Underground Beats Hanoi',
    artist: 'Analog Culture',
    genre: 'Techno',
    city: 'Hanoi',
    area: 'Old Quarter',
    venue: 'Hanoi Rock City',
    date: '2026-04-25T22:00:00',
    img: 'https://images.unsplash.com/photo-1559305616-3f99cd43e353?auto=format&fit=crop&w=800&q=80',
    emoji: '🔊',
    grad: 'techno-grad',
    desc: 'Hanoi\'s most respected underground crew, Analog Culture, takes over Rock City for a night of raw, industrial techno. No VIP tables, no bottle service — just pure music.',
    featured: false,
    soldOut: false,
    attendees: 220,
    isNew: true,
  },
];

export const ARTISTS: Artist[] = [
  { id: 1, name: 'DJ Khanh Ly', genre: 'Techno', emoji: '🎛️' },
  { id: 2, name: 'Mia Fontaine', genre: 'House', emoji: '🎵' },
  { id: 3, name: 'Suboi', genre: 'Hip-Hop', emoji: '🎤' },
  { id: 4, name: 'Linh Napie', genre: 'R&B', emoji: '🌙' },
  { id: 5, name: 'BLVCK CROWZ', genre: 'Techno', emoji: '⚫' },
  { id: 6, name: 'Forest Freq.', genre: 'House', emoji: '🌿' },
];

export const DEALS: Deal[] = [
  {
    id: 1,
    venueName: 'Broma Not A Bar',
    city: 'Ho Chi Minh City',
    emoji: '🍹',
    img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
    title: 'Free Entry Before 10PM',
    discount: 'FREE',
    badgeColor: '#00d084',
    desc: 'Skip the queue and walk straight in before 10PM every Friday and Saturday night.',
    startTime: '9:00 PM',
    endTime: '10:00 PM',
  },
];

export const CITIES: string[] = [
  'Ho Chi Minh City',
  'Hanoi',
];

export const GENRES: string[] = [
  'Techno',
  'House',
  'EDM',
  'Jazz',
  'Hip-Hop',
  'R&B',
  'Rock',
];
