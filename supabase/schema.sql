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
-- 2026-11-02: race of the main character (Skyborne is stored with its faction, e.g. "Skyborne (Horde)")
alter table public.profiles add column if not exists race text check (char_length(race) <= 40);
alter table public.profiles enable row level security;
drop policy if exists "read all" on public.profiles;
drop policy if exists "insert own" on public.profiles;
drop policy if exists "update own" on public.profiles;
drop policy if exists "delete own" on public.profiles;
create policy "read all" on public.profiles for select using (true);
create policy "insert own" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "update own" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" on public.profiles for delete to authenticated using (user_id = auth.uid());

-- 2026-11-02: alts (secondary characters), at most 2 per member.
create table if not exists public.alts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_name text check (char_length(character_name) <= 40),
  race text check (char_length(race) <= 40),
  class text check (char_length(class) <= 40),
  role text check (role in ('Tank', 'Healer', 'DPS')),
  created_at timestamptz not null default now()
);
alter table public.alts enable row level security;
drop policy if exists "read all" on public.alts;
drop policy if exists "insert own" on public.alts;
drop policy if exists "update own" on public.alts;
drop policy if exists "delete own" on public.alts;
create policy "read all" on public.alts for select using (true);
create policy "insert own" on public.alts for insert to authenticated
  with check (user_id = auth.uid() and (select count(*) from public.alts a where a.user_id = auth.uid()) < 2);
create policy "update own" on public.alts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" on public.alts for delete to authenticated using (user_id = auth.uid());

-- 2026-11-02: guild bank (Opie Bank), event types + quest help.
-- Guild bank inventory: shared, so any logged-in member can add, change and remove.
create table if not exists public.bank_items (
  id uuid primary key default gen_random_uuid(),
  item text not null check (char_length(item) <= 80),
  item_id int,
  quantity int not null default 1 check (quantity >= 0),
  category text,
  note text check (char_length(note) <= 200),
  deposited_by text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.bank_items enable row level security;
drop policy if exists "read all" on public.bank_items;
drop policy if exists "write logged in" on public.bank_items;
create policy "read all" on public.bank_items for select using (true);
create policy "write logged in" on public.bank_items for all to authenticated using (true) with check (true);
-- Where the item is: 'opie' = bank character Opie Bank (kept up to date by Jelle), 'guild' = the shared guild bank.
-- status 'sent' = a member mailed it to Opie Bank, not yet in the inventory; 'in_stock' = in the inventory.
alter table public.bank_items add column if not exists location text not null default 'opie';
alter table public.bank_items add column if not exists status text not null default 'in_stock';
-- When it was added; deposits only count on player pages from launch day (test entries before that don't).
alter table public.bank_items add column if not exists created_at timestamptz not null default now();
alter table public.bank_items drop constraint if exists bank_items_location_check;
alter table public.bank_items add constraint bank_items_location_check check (location in ('opie', 'guild'));
alter table public.bank_items drop constraint if exists bank_items_status_check;
alter table public.bank_items add constraint bank_items_status_check check (status in ('in_stock', 'sent'));

-- Guild bank gold (one row, id = 1). Amounts in copper.
create table if not exists public.bank (
  id int primary key default 1 check (id = 1),
  copper bigint not null default 0 check (copper >= 0),
  goal_copper bigint not null default 1000000,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.bank (id) values (1) on conflict (id) do nothing;
alter table public.bank enable row level security;
drop policy if exists "read all" on public.bank;
drop policy if exists "update logged in" on public.bank;
create policy "read all" on public.bank for select using (true);
create policy "update logged in" on public.bank for update to authenticated using (true) with check (true);

-- Event type (raid / dungeon / quest help / guild night / other) and the quest for quest help.
alter table public.events add column if not exists kind text not null default 'dungeon';
alter table public.events add column if not exists quest text;
-- 2026-11-02: 'any players' instead of specific roles (players_needed set = roles not used), and tagged players.
alter table public.events add column if not exists players_needed int;
alter table public.events add column if not exists pinged text[] not null default '{}';
-- Quest picked from data/quests.json (Wowhead Forever id); quest keeps the name (also for typed quests).
alter table public.events add column if not exists quest_id int;
-- Dungeon/raid picked from js/dungeons.js (name; links to Wowhead).
alter table public.events add column if not exists dungeon text check (char_length(dungeon) <= 80);

-- 2026-11-02: players (sheet name <-> Discord name), profile link, bank reservations, guild bank purchase.
-- Who is who: the player's name in the guild sheet (column A) and their Discord display name.
-- Kept up to date by the "sync de guild" routine (see the project instructions).
create table if not exists public.players (
  player_name text primary key check (char_length(player_name) <= 40),
  discord_name text check (char_length(discord_name) <= 60),
  updated_at timestamptz not null default now()
);
alter table public.players enable row level security;
drop policy if exists "read all" on public.players;
drop policy if exists "write logged in" on public.players;
create policy "read all" on public.players for select using (true);
create policy "write logged in" on public.players for all to authenticated using (true) with check (true);
insert into public.players (player_name, discord_name) values
  ('Jelle', 'Dirk-Christiaan'), ('Justin', 'Dokter Tinus'), ('Bas', 'bas'), ('Rawas', 'Daddy Draven'),
  ('Jermo', 'Eterniity - Jermo'), ('Jacco', 'Jaccico'), ('Laurens', 'Le Noir'), ('Mike', 'VDwerg'),
  ('Murn', 'MURN'), ('Yvo', 'Skynal'), ('Mees', 'mjezzo'), ('Ian', null)
on conflict (player_name) do update set discord_name = excluded.discord_name;

-- The profile remembers which sheet player it belongs to.
alter table public.profiles add column if not exists player_name text;

-- Guild bank: saving for the guild bank (100 gold) until it is bought; after that just the guild gold.
alter table public.bank add column if not exists guild_bank_bought boolean not null default false;

-- Reservations on bank items: any logged-in member can reserve for one of their characters.
create table if not exists public.bank_reservations (
  id uuid primary key default gen_random_uuid(),
  bank_item_id uuid not null references public.bank_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reserved_by text not null,
  character text not null check (char_length(character) <= 40),
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);
alter table public.bank_reservations enable row level security;
drop policy if exists "read all" on public.bank_reservations;
drop policy if exists "insert own" on public.bank_reservations;
drop policy if exists "delete own" on public.bank_reservations;
create policy "read all" on public.bank_reservations for select using (true);
create policy "insert own" on public.bank_reservations for insert to authenticated with check (user_id = auth.uid());
create policy "delete own" on public.bank_reservations for delete to authenticated using (user_id = auth.uid());

-- 2026-11-02: reservations on trade market offers (same idea as bank reservations).
create table if not exists public.listing_reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reserved_by text not null,
  character text not null check (char_length(character) <= 40),
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);
alter table public.listing_reservations enable row level security;
drop policy if exists "read all" on public.listing_reservations;
drop policy if exists "insert own" on public.listing_reservations;
drop policy if exists "delete own" on public.listing_reservations;
create policy "read all" on public.listing_reservations for select using (true);
create policy "insert own" on public.listing_reservations for insert to authenticated with check (user_id = auth.uid());
create policy "delete own" on public.listing_reservations for delete to authenticated using (user_id = auth.uid());

-- 2026-11-02: crafting requests – which profession can make the item, and the skill needed (optional).
alter table public.listings add column if not exists profession text check (char_length(profession) <= 40);
alter table public.listings add column if not exists min_skill int check (min_skill between 1 and 300);

-- 2026-11-02: tag (ping) players on a trade listing; they see it on their Home page.
alter table public.listings add column if not exists pinged text[] not null default '{}';

-- =====================================================================
-- 2026-11-02: log in by choosing your player + a shared guild code (no Discord login).
-- The browser signs in anonymously (Supabase "anonymous sign-ins" must be ON) and calls
-- join_guild(code, player). That links the browser (auth.uid()) to a sheet player in `members`.
-- One player can have several browsers (phone + pc); "own rows" means: rows of the same player.
-- The guild code is stored only as a bcrypt hash. Set or change it (Jelle runs this himself):
--   insert into private.settings (key, value)
--   values ('guild_code_hash', extensions.crypt('THE-CODE', extensions.gen_salt('bf')))
--   on conflict (key) do update set value = excluded.value;
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
create table if not exists private.join_attempts (user_id uuid primary key, attempts int not null default 0, last_at timestamptz not null default now());

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null references public.players(player_name) on update cascade on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "read all" on public.members;
create policy "read all" on public.members for select using (true);
-- no insert/update/delete policies: only join_guild() writes here

-- Earlier Discord logins keep their rows: link them to their player.
insert into public.members (user_id, player_name)
select p.user_id, p.player_name from public.profiles p
join public.players pl on pl.player_name = p.player_name
on conflict (user_id) do nothing;
insert into public.members (user_id, player_name)
select u.id, pl.player_name from auth.users u
join public.players pl on lower(pl.discord_name) in (
  lower(u.raw_user_meta_data->>'full_name'), lower(u.raw_user_meta_data->>'name'),
  lower(u.raw_user_meta_data->'custom_claims'->>'global_name'))
on conflict (user_id) do nothing;

create or replace function public.join_guild(code text, player text) returns text
language plpgsql security definer set search_path = public, private, extensions as $$
declare h text; n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into private.join_attempts (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update private.join_attempts set attempts = case when last_at < now() - interval '1 hour' then 1 else attempts + 1 end, last_at = now()
    where user_id = auth.uid() returning attempts into n;
  if n > 10 then raise exception 'Too many tries, wait an hour'; end if;
  select value into h from private.settings where key = 'guild_code_hash';
  if h is null then raise exception 'The guild code has not been set yet'; end if;
  if extensions.crypt(coalesce(code, ''), h) <> h then raise exception 'Wrong guild code'; end if;
  if not exists (select 1 from public.players where player_name = player) then raise exception 'Unknown player'; end if;
  insert into public.members (user_id, player_name) values (auth.uid(), player)
    on conflict (user_id) do update set player_name = excluded.player_name, joined_at = now();
  delete from private.join_attempts where user_id = auth.uid();
  return player;
end $$;
revoke all on function public.join_guild(text, text) from public, anon;
grant execute on function public.join_guild(text, text) to authenticated;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid()) $$;
create or replace function public.same_player(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members a join public.members b using (player_name)
                 where a.user_id = auth.uid() and b.user_id = uid) $$;
grant execute on function public.is_member() to anon, authenticated;
grant execute on function public.same_player(uuid) to anon, authenticated;

-- Personal tables: insert as yourself (member only); change/delete rows of your own player.
do $$
declare t text;
begin
  foreach t in array array['listings', 'tips', 'events', 'signups', 'profiles', 'bank_reservations', 'listing_reservations'] loop
    execute format('drop policy if exists "insert own" on public.%I', t);
    execute format('drop policy if exists "update own" on public.%I', t);
    execute format('drop policy if exists "delete own" on public.%I', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check (user_id = auth.uid() and public.is_member())', t);
    execute format('create policy "update own" on public.%I for update to authenticated using (public.same_player(user_id)) with check (public.same_player(user_id))', t);
    execute format('create policy "delete own" on public.%I for delete to authenticated using (public.same_player(user_id))', t);
  end loop;
end $$;
drop policy if exists "insert own" on public.alts;
drop policy if exists "update own" on public.alts;
drop policy if exists "delete own" on public.alts;
create policy "insert own" on public.alts for insert to authenticated
  with check (user_id = auth.uid() and public.is_member()
    and (select count(*) from public.alts a where public.same_player(a.user_id)) < 2);
create policy "update own" on public.alts for update to authenticated using (public.same_player(user_id)) with check (public.same_player(user_id));
create policy "delete own" on public.alts for delete to authenticated using (public.same_player(user_id));

-- Shared things: any member.
drop policy if exists "insert own" on public.addons;
drop policy if exists "delete any logged in" on public.addons;
create policy "insert own" on public.addons for insert to authenticated with check (created_by = auth.uid() and public.is_member());
create policy "delete any logged in" on public.addons for delete to authenticated using (public.is_member());
drop policy if exists "write logged in" on public.bank_items;
create policy "write logged in" on public.bank_items for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "update logged in" on public.bank;
create policy "update logged in" on public.bank for update to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "write logged in" on public.players;
create policy "write logged in" on public.players for all to authenticated using (public.is_member()) with check (public.is_member());
