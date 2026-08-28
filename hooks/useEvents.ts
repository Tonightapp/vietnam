import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { EVENTS, Event } from '@/constants/Data';

function mapDbEvent(row: Record<string, unknown>): Event {
  const genre = (row.genre as string) ?? '';
  return {
    id: row.id as number,
    title: (row.title as string) ?? '',
    artist: (row.artist as string) ?? '',
    genre,
    city: (row.city as string) ?? '',
    area: (row.area as string) ?? '',
    venue: (row.venue as string) ?? '',
    date: (row.date as string) ?? '',
    img: (row.img as string) ?? '',
    emoji: (row.emoji as string) ?? '🎵',
    grad: genre ? `${genre.toLowerCase()}-grad` : 'default-grad',
    desc: (row.description as string) ?? '',
    featured: (row.featured as boolean) ?? false,
    soldOut: (row.sold_out as boolean) ?? false,
    attendees: (row.attendees as number) ?? 0,
    isNew: (row.is_new as boolean) ?? false,
  };
}

export function useEvents() {
  const [events, setEvents] = useState<Event[]>(EVENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setEvents(data.map(mapDbEvent));
        }
        setLoading(false);
      });
  }, []);

  return { events, loading };
}
