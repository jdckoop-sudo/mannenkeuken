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

-- 2026-11-02: link a listing to an item from data/items.json (optional)
alter table public.listings add column if not exists item_id int;

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

-- 2026-11-02: addons live on the site (moved from the "Addons" tab of the sheet).
-- Anyone logged in can add an addon and remove any addon (the site asks "Are you sure?").
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  sort int,
  category text not null default 'Other',
  name text not null check (char_length(name) <= 80),
  what text check (char_length(what) <= 500),
  priority text,
  who text,
  link text,
  link_label text,
  note text check (char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now()
);
alter table public.addons enable row level security;
drop policy if exists "read all" on public.addons;
drop policy if exists "insert own" on public.addons;
drop policy if exists "delete any logged in" on public.addons;
create policy "read all" on public.addons for select using (true);
create policy "insert own" on public.addons for insert to authenticated with check (created_by = auth.uid());
create policy "delete any logged in" on public.addons for delete to authenticated using (true);

-- 2026-11-02: member profile with a saved main character (one row per user).
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  character_name text check (char_length(character_name) <= 40),
  class text check (char_length(class) <= 40),
  role text check (role in ('Tank', 'Healer', 'DPS')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read all" on public.profiles;
drop policy if exists "insert own" on public.profiles;
drop policy if exists "update own" on public.profiles;
drop policy if exists "delete own" on public.profiles;
create policy "read all" on public.profiles for select using (true);
create policy "insert own" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "update own" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" on public.profiles for delete to authenticated using (user_id = auth.uid());
