-- Run this once in Supabase: SQL Editor → New query → paste → Run.
-- Everyone can read; logged-in users can add; you can only change/delete your own rows.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  kind text not null check (kind in ('offer', 'request')),
  item text not null check (char_length(item) <= 80),
  quantity int not null default 1 check (quantity > 0),
  price text check (char_length(price) <= 80),
  note text check (char_length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  category text not null check (category in ('addon', 'macro', 'setting')),
  title text not null check (char_length(title) <= 80),
  class text,
  link text,
  content text check (char_length(content) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  title text not null,
  starts_at timestamptz not null,
  min_level int,
  tanks_needed int default 1,
  healers_needed int default 1,
  dps_needed int default 3,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.signups (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  role text not null check (role in ('Tank', 'Healer', 'DPS')),
  answer text not null default 'yes' check (answer in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['listings', 'tips', 'events', 'signups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read all" on public.%I', t);
    execute format('drop policy if exists "insert own" on public.%I', t);
    execute format('drop policy if exists "update own" on public.%I', t);
    execute format('drop policy if exists "delete own" on public.%I', t);
    execute format('create policy "read all" on public.%I for select using (true)', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "update own" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "delete own" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
