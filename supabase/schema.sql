-- profiles
create table profiles (
  id uuid references auth.users primary key,
  full_name text,
  email text,
  avatar_url text,
  role text default 'user',
  created_at timestamptz default now()
);

-- events
create table events (
  id bigserial primary key,
  title text not null,
  artist text,
  genre text,
  city text,
  area text,
  venue text,
  date date,
  img text,
  emoji text,
  description text,
  featured boolean default false,
  sold_out boolean default false,
  attendees integer default 0,
  is_new boolean default false,
  created_at timestamptz default now()
);

-- tickets
create table tickets (
  id bigserial primary key,
  ref text unique not null,
  event_id bigint references events(id),
  event_title text,
  venue text,
  city text,
  date date,
  img text,
  ticket_type text default 'Entry',
  qty integer default 1,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  status text default 'valid',
  issued_at timestamptz default now(),
  arrived_at timestamptz,
  user_id uuid references auth.users
);

-- deals
create table deals (
  id bigserial primary key,
  venue_name text,
  city text,
  emoji text,
  img text,
  title text,
  discount text,
  badge_color text,
  description text,
  start_time text,
  end_time text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table tickets enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can read own tickets"
  on tickets for select
  using (auth.uid() = user_id);

create policy "Users can insert own tickets"
  on tickets for insert
  with check (auth.uid() = user_id);

-- Public read for events and deals
alter table events enable row level security;
alter table deals enable row level security;

create policy "Events are public"
  on events for select
  using (true);

create policy "Deals are public"
  on deals for select
  using (true);

-- Pro users and venue owners can insert events
create or replace function can_publish_events()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role in ('pro', 'venue_owner', 'admin') from public.profiles where id = auth.uid()),
    false
  )
$$;

create policy "Pro users can insert events"
  on events for insert
  with check (can_publish_events());

-- venue_requests: tracks applications from venues/promoters wanting to join Tonight
create table venue_requests (
  id bigserial primary key,
  user_id uuid references auth.users,
  full_name text not null,
  email text not null,
  venue_name text not null,
  city text not null,
  website text,
  description text,
  status text default 'pending',  -- pending | approved | rejected
  admin_note text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table venue_requests enable row level security;

-- Users can submit their own request
create policy "Users can submit venue requests"
  on venue_requests for insert
  with check (auth.uid() = user_id);

-- Users can view their own request
create policy "Users can view own request"
  on venue_requests for select
  using (auth.uid() = user_id);

-- Admins can view all requests
create policy "Admins can view all requests"
  on venue_requests for select
  using (is_admin());

-- Admins can update (approve / reject) requests
create policy "Admins can update requests"
  on venue_requests for update
  using (is_admin());

-- Security definer function — avoids RLS infinite recursion when checking admin role
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Admins can view all profiles (for stats)
create policy "Admins can view all profiles"
  on profiles for select
  using (auth.uid() = id or is_admin());

-- Admins can update any profile (to change role after approval)
create policy "Admins can update any profile"
  on profiles for update
  using (is_admin());

-- Trigger to auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  assigned_role text;
begin
  -- Hardcoded admin account
  if new.email = 'app.tonigh1@gmail.com' then
    assigned_role := 'admin';
  else
    assigned_role := 'user';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    assigned_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
