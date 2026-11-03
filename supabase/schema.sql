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

-- 2026-11-03: gold donations per player (Top donors on the Guild Bank page, counted from LAUNCH).
-- Shared: any member may add/remove; the page also changes the bank balance.
create table if not exists public.gold_donations (
  id uuid primary key default gen_random_uuid(),
  player_name text not null references public.players(player_name) on update cascade,
  copper bigint not null check (copper > 0),
  note text check (char_length(note) <= 200),
  added_by text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.gold_donations enable row level security;
drop policy if exists "read all" on public.gold_donations;
drop policy if exists "write members" on public.gold_donations;
create policy "read all" on public.gold_donations for select using (true);
create policy "write members" on public.gold_donations for all to authenticated using (public.is_member()) with check (public.is_member());

-- 2026-11-03: developer mode (dev.html, opened by clicking the class icon 5 times; only for Jelle and Justin).
create or replace function public.is_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and player_name in ('Jelle', 'Justin')) $$;
grant execute on function public.is_dev() to anon, authenticated;

-- Checklist: which updates work, which are broken, what still needs a look.
create table if not exists public.dev_checks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 120),
  area text check (char_length(area) <= 40),
  status text not null default 'check' check (status in ('ok', 'broken', 'check')),
  note text check (char_length(note) <= 500),
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.dev_checks enable row level security;
drop policy if exists "read all" on public.dev_checks;
drop policy if exists "write devs" on public.dev_checks;
create policy "read all" on public.dev_checks for select using (true);
create policy "write devs" on public.dev_checks for all to authenticated using (public.is_dev()) with check (public.is_dev());
-- Developers (Jelle, Justin) may delete any listing in developer mode (the reservations on it go with it).
drop policy if exists "delete dev" on public.listings;
create policy "delete dev" on public.listings for delete to authenticated using (public.is_dev());

-- Messages between the developers ("To do for you" in developer mode): stays until the receiver clicks Done.
create table if not exists public.dev_messages (
  id uuid primary key default gen_random_uuid(),
  to_player text not null check (to_player in ('Jelle', 'Justin')),
  from_player text,
  text text not null check (char_length(text) <= 1000),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.dev_messages enable row level security;
drop policy if exists "read devs" on public.dev_messages;
drop policy if exists "write devs" on public.dev_messages;
create policy "read devs" on public.dev_messages for select to authenticated using (public.is_dev());
create policy "write devs" on public.dev_messages for all to authenticated using (public.is_dev()) with check (public.is_dev());

-- 2026-11-04: the addon texts (category, what, priority, who, note) in English; they were Dutch.
-- Idempotent: each row is matched on the addon name (the old or the new name) and set to the English text.
update public.addons as a set
  name = v.new_name, category = v.category, what = v.what, priority = v.priority, who = v.who,
  note = nullif(v.note, ''), link_label = coalesce(v.link_label, a.link_label)
from (values
  ($q$CurseForge-app$q$, $q$CurseForge-app$q$, $q$Basics$q$, $q$Addon manager: installs and updates all your addons automatically.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$Not an addon but a program on your PC. Pick the "Forever" version for WoW.$q$, null),
  ($q$BugSack + BugGrabber$q$, $q$BugSack + BugGrabber$q$, $q$Basics$q$, $q$Catches red Lua error messages so they don't spam your screen, and shows you which addon is broken.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$Update after a patch.$q$, null),
  ($q$Guild Found Forever$q$, $q$Guild Found Forever$q$, $q$Guild-found$q$, $q$Guild-found rules: no Auction House, post and trade only within the guild, group lock with outsiders. Plus deathlog, guild map and announcements (level 60, deaths, epics).$q$, $q$Must-have$q$, $q$Whole guild$q$, $q$Best match for your own guild; an officer sets the rules via the guild info. Still beta, 1.0 planned for 4 Nov – check whether it is on CurseForge by then.$q$, null),
  ($q$Guild Self Forever 2.0$q$, $q$Guild Self Forever 2.0$q$, $q$Guild-found$q$, $q$Blocks the AH and trading/posting outside the guild; shared bank, craft requests and roles.$q$, $q$Alternative$q$, $q$Whole guild$q$, $q$Already works on Forever, but is built for the (French-speaking) GSF guild network; rules only apply to registered characters.$q$, null),
  ($q$ForeverGuild+$q$, $q$ForeverGuild+$q$, $q$Guild$q$, $q$Guild roster with roles, professions and craft requests, raid sign-ups, loot history and group finder.$q$, $q$Recommended$q$, $q$Whole guild$q$, $q$Does NOT enforce guild-found rules; only really works once everyone has it.$q$, null),
  ($q$Questie$q$, $q$Questie$q$, $q$Questing & levelling$q$, $q$Shows on the map and minimap where you pick up, do and hand in quests.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$Leatrix Plus$q$, $q$Leatrix Plus$q$, $q$Questing & levelling$q$, $q$Convenience pack: sell grey items, auto-repair, hand in quests faster, block duels, zoom out further.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$Everything can be switched on or off separately in the options.$q$, null),
  ($q$Nova Spell Rank Checker$q$, $q$Nova Spell Rank Checker$q$, $q$Questing & levelling$q$, $q$Warns when an old rank of a spell is on your action bar.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$In Forever a spell on your bar does not upgrade to the new rank by itself.$q$, null),
  ($q$GnomeLevelUp$q$, $q$GnomeLevelUp$q$, $q$Questing & levelling$q$, $q$On every level-up shows what improved and which spells you can learn from the trainer.$q$, $q$Recommended$q$, $q$Beginners$q$, $q$$q$, null),
  ($q$Class Quests Forever$q$, $q$Class Quests Forever$q$, $q$Questing & levelling$q$, $q$Journal of all class quests; tells you when a new one unlocks and where your trainer is.$q$, $q$Recommended$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$RestedXP Guides$q$, $q$RestedXP Guides$q$, $q$Questing & levelling$q$, $q$Levelling guide with an arrow to the fastest quests.$q$, $q$Optional$q$, $q$Anyone who wants to level fast$q$, $q$Level 1–20 free, paid after that.$q$, null),
  ($q$Leatrix Maps$q$, $q$Leatrix Maps$q$, $q$Maps & navigation$q$, $q$World map fully revealed, with zone levels and extra icons.$q$, $q$Recommended$q$, $q$Everyone$q$, $q$Don't combine with OpenMap or Mapster.$q$, null),
  ($q$Forever Dungeon Map$q$, $q$Forever Dungeon Map$q$, $q$Maps & navigation$q$, $q$Dungeon entrances with levels on the map.$q$, $q$Recommended$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$TomTom$q$, $q$TomTom$q$, $q$Maps & navigation$q$, $q$Arrow on your screen pointing to a spot on the map (/way x y).$q$, $q$Optional$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$Edit Mode (ingebouwd)$q$, $q$Edit Mode (built in)$q$, $q$Interface$q$, $q$Move and scale action bars and frames: Esc → Edit Mode.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$Try this first before you pick a UI addon.$q$, $q$Built into the game$q$),
  ($q$Bartender4$q$, $q$Bartender4$q$, $q$Interface$q$, $q$Action bars exactly how you want them, extra bars and /kb to set keybinds quickly.$q$, $q$Optional$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$MinimapButtonButton$q$, $q$MinimapButtonButton$q$, $q$Interface$q$, $q$Collects all addon buttons around the minimap into one button.$q$, $q$Optional$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$Baganator$q$, $q$Baganator$q$, $q$Bags & gear$q$, $q$All your bags (and bank) in one window, with search bar and sorting.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$ForeverGear$q$, $q$ForeverGear$q$, $q$Bags & gear$q$, $q$Shows whether an item is an upgrade for your spec, including quest rewards.$q$, $q$Recommended$q$, $q$Everyone$q$, $q$Choose your own spec profile; some profiles are still provisional.$q$, null),
  ($q$Deadly Boss Mods (DBM)$q$, $q$Deadly Boss Mods (DBM)$q$, $q$Dungeons & raids$q$, $q$Warnings and timers for boss abilities.$q$, $q$Must-have$q$, $q$Everyone$q$, $q$$q$, null),
  ($q$ThreatClassic2$q$, $q$ThreatClassic2$q$, $q$Dungeons & raids$q$, $q$Threat meter: see who has aggro and how close you are to it.$q$, $q$Must-have$q$, $q$Everyone (especially tanks)$q$, $q$Threat is harder to hold in Forever than in retail.$q$, null),
  ($q$DungeonJournal$q$, $q$DungeonJournal$q$, $q$Dungeons & raids$q$, $q$/dj: bosses, loot, maps and quests per dungeon.$q$, $q$Recommended$q$, $q$Everyone$q$, $q$Dungeons only, no raids.$q$, null),
  ($q$AtlasLoot Classic Forever$q$, $q$AtlasLoot Classic Forever$q$, $q$Dungeons & raids$q$, $q$Loot tables of dungeons and raids.$q$, $q$Recommended$q$, $q$Everyone$q$, $q$Get THIS version, not the old AtlasLootClassic.$q$, null),
  ($q$Details!$q$, $q$Details!$q$, $q$Dungeons & raids$q$, $q$Extensive damage and heal meter.$q$, $q$Optional$q$, $q$Everyone$q$, $q$There is already a damage meter in the game; Details! is extra.$q$, null),
  ($q$SkillUp Forever$q$, $q$SkillUp Forever$q$, $q$Professions$q$, $q$Chance of a skill-up per recipe, shopping list and levelling route for your profession.$q$, $q$Recommended$q$, $q$Anyone with a profession$q$, $q$Extra handy in guild-found: you have to make everything yourself.$q$, null),
  ($q$ForeverMapNotes$q$, $q$ForeverMapNotes$q$, $q$Professions$q$, $q$Ores, herbs, chests and rares on the map.$q$, $q$Optional$q$, $q$Mining / Herbalism$q$, $q$$q$, null),
  ($q$HealBot Continued$q$, $q$HealBot Continued$q$, $q$Role: healer$q$, $q$Heal frames: click a teammate (or hover + key) to heal.$q$, $q$Must-have$q$, $q$Healers$q$, $q$Pick HealBot OR VuhDo, not both.$q$, null),
  ($q$VuhDo$q$, $q$VuhDo$q$, $q$Role: healer$q$, $q$Alternative to HealBot with raid frames and click-healing.$q$, $q$Alternative$q$, $q$Healers$q$, $q$$q$, null),
  ($q$Decursive$q$, $q$Decursive$q$, $q$Role: healer$q$, $q$Shows who has a debuff you can remove; one click to dispel.$q$, $q$Recommended$q$, $q$Priest, Paladin, Druid, Shaman, Mage$q$, $q$$q$, null),
  ($q$Threat Plates$q$, $q$Threat Plates$q$, $q$Role: tank$q$, $q$Colours nameplates by threat, so you immediately see which mob breaks loose.$q$, $q$Recommended$q$, $q$Tanks (also handy for DPS)$q$, $q$During the beta the CurseForge version lagged behind; check whether there is a Forever file.$q$, null),
  ($q$Forever Classmate$q$, $q$Forever Classmate$q$, $q$Class-specific$q$, $q$Recognises your class and shows only what you need: buff reminders, resources, DoT bars.$q$, $q$Recommended$q$, $q$All classes$q$, $q$Good replacement for WeakAuras (which doesn't work on Forever).$q$, null),
  ($q$Mage Tools Forever$q$, $q$Mage Tools Forever$q$, $q$Class-specific$q$, $q$Conjure and hand out food/drink per level, portal bar and Polymorph bar.$q$, $q$Recommended$q$, $q$Mage$q$, $q$$q$, null),
  ($q$Warlock Tools Forever$q$, $q$Warlock Tools Forever$q$, $q$Class-specific$q$, $q$Manage Soul Shards, Soulstone/Healthstone buttons, DoT tracker, Fear/Banish bar.$q$, $q$Recommended$q$, $q$Warlock$q$, $q$$q$, null),
  ($q$TotemTimers$q$, $q$TotemTimers$q$, $q$Class-specific$q$, $q$Timers and quick buttons for your totems.$q$, $q$Recommended$q$, $q$Shaman$q$, $q$$q$, null),
  ($q$Combo Points on Plate$q$, $q$Combo Points on Plate$q$, $q$Class-specific$q$, $q$Combo points under the nameplate of your target.$q$, $q$Optional$q$, $q$Rogue, Feral Druid$q$, $q$$q$, null),
  ($q$Auctionator / TSM$q$, $q$Auctionator / TSM$q$, $q$Not needed / doesn't work$q$, $q$Auction House addons.$q$, $q$Not needed$q$, $q$—$q$, $q$Guild-found = no Auction House.$q$, null),
  ($q$WeakAuras, OmniCC, OmniBar, Postal, AdiBags$q$, $q$WeakAuras, OmniCC, OmniBar, Postal, AdiBags$q$, $q$Not needed / doesn't work$q$, $q$Well-known addons without a working Forever version.$q$, $q$Doesn't work$q$, $q$—$q$, $q$Use Forever Classmate / the built-in Cooldown Manager, Baganator instead of AdiBags.$q$, null)
) as v(old_name, new_name, category, what, priority, who, note, link_label)
where a.name in (v.old_name, v.new_name);

-- 2026-11-03: Tickets in developer mode (dev.html → tabs Ideas and Fixes): cards for ideas and for things that
-- still need fixing, which a developer can put on his name ("I'm working on this"). Only Jelle and Justin (is_dev()).
create table if not exists public.dev_tickets (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'idea' check (kind in ('idea', 'fix')),
  title text not null check (char_length(title) <= 120),
  area text check (char_length(area) <= 40),
  body text check (char_length(body) <= 6000),
  status text not null default 'open' check (status in ('open', 'doing', 'done')),
  created_by text,
  claimed_by text check (claimed_by in ('Jelle', 'Justin')),
  updated_by text,
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.dev_tickets enable row level security;
drop policy if exists "read devs" on public.dev_tickets;
drop policy if exists "write devs" on public.dev_tickets;
create policy "read devs" on public.dev_tickets for select to authenticated using (public.is_dev());
create policy "write devs" on public.dev_tickets for all to authenticated using (public.is_dev()) with check (public.is_dev());

-- The first ideas (fixed ids, so running this file again adds nothing twice and keeps your changes).
insert into public.dev_tickets (id, title, area, created_by, created_at, body) values
('6f1d2a10-0001-4c3e-9a51-000000000001', $q$Achievements: bigger and more fun$q$, $q$Achievements$q$, $q$Justin$q$, now() - interval '3 minutes', $q$Nothing concrete yet – collect thoughts here first.

Ideas
- An achievement list like in WoW.
- A skill tree like the Minecraft advancements: not everything is open from the start, you unlock the next step.
- Alt achievements: alt at level 5 / 10 / 15, a 2nd alt at level x.
- Guild, player and character achievements: separate tabs, or one tab with a row per kind.
- The Discord bot posts it when someone earns one (see the Discord bot idea).
- Open question: can everyone earn an achievement, or only the first person (a race)?
- Murn may have ideas for the skill tree – ask him.

Name ideas (brainstorm)
Market
- Bliksemhandel – a listing done within an hour
- Eerste reservering / Bestelbaas – 1 and 10 reservations
- Gewild – someone reserves your item

Guild bank
- Eerste munt – first gold donated; then 10 / 50 / 100 gold donated
- Top donor – of the week / month / ever
- Gouden hart – the biggest single donation
- Trouwe schenker – donated 4 weeks in a row
- Spaarvarken – the guild reaches 25 / 50 / 75 / 100% of the goal (a badge for everyone)
- Gekocht! – the guild bank is bought
- Bevoorrader – 10 and 50 items sent to Opie Bank
- Volle voorraad – 100 items in the bank

Events and raids
- Eerste aanmelding – first sign-up; then 10 / 25 / 50
- Altijd erbij – 10× "yes"
- Organisator – first event organised; then 10
- Bomvol – an event with every role full
- Tankheld / Genezer / Schadebrenger – 10× in that role
- Alle rollen – signed up in every role at least once
- Vroege vogel – signed up within an hour after the event was posted
- Quest-maat – 5 quest-help events
- Dungeonmeester – every event type once
- Weekreeks – 4 weeks in a row at an event
- Hele guild – every active main signed up for one event$q$),
('6f1d2a10-0001-4c3e-9a51-000000000002', $q$Discord bot$q$, $q$Discord$q$, $q$Jelle$q$, now() - interval '2 minutes', $q$A bot for the Mannenkeuken Discord. Not sure yet what is possible live – find out first.

- Commands to ask for info quickly (e.g. who has which profession, the next event, the bank goal).
- @mention someone when they earn an achievement (see the Achievements idea).
- A weekly report at the end of the week:
  - most gold donated
  - most levels gained
  - most profession levels gained
  - highest level
  - highest profession level$q$),
('6f1d2a10-0001-4c3e-9a51-000000000003', $q$After launch: gear on profiles + upgrade hints$q$, $q$Characters$q$, $q$Jelle$q$, now() - interval '1 minute', $q$For after the launch, when the Blizzard API gives character data.

- Add the armour/gear of every character to the character update and show it on the profile page, with the Wowhead hover.
- With your player selected: when you hover an item (e.g. on the Market), show whether it is an upgrade for one of your characters.
- New Market listing: automatically tag the players who can (almost) wear the item, whose role/class fits and who would get an upgrade.$q$),
('6f1d2a10-0001-4c3e-9a51-000000000004', $q$Home: message of the day$q$, $q$Home$q$, $q$Jelle$q$, now(), $q$What to do with the "[Short guild intro / message of the day]" line on Home? Some options (can be combined):

- A script that checks certain values (next event, bank goal, new levels, new members, …) and turns them into a message of the day.
- The Discord bot also posts that message (see the Discord bot idea).
- A Discord channel where members post messages, and the message of the day picks one from there.
- Earlier proposal (docs/instructies.md): a countdown until the launch, then a message of the day members can edit + the next event with "Sign up".$q$)
on conflict (id) do nothing;

-- An example fix, so the Fixes tab shows what a fix ticket looks like (remove it when you like).
insert into public.dev_tickets (id, kind, title, area, created_by, body) values
('6f1d2a10-0001-4c3e-9a51-000000000101', 'fix', $q$Example: how to write a fix ticket$q$, $q$Example$q$, $q$Jelle$q$, $q$This is an example – remove it when you like.

What is wrong: one line, e.g. "The Reserve button on the Market does nothing on my phone".
Where: page + device/browser (e.g. market.html, iPhone Safari).
How to see it: the steps (1. open the Market, 2. tap Reserve on any listing, 3. nothing happens).
Expected: what should happen instead (a dialog to pick your character).
Screenshot: a link to it, if you have one.$q$)
on conflict (id) do nothing;

-- Checklist item for the new boards.
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Ideas + Fixes boards: add, edit, claim, let go, done, reopen$q$, $q$Developer mode$q$, 'check', $q$Try every button on dev.html → Ideas and Fixes once, as Jelle and as Justin.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Ideas + Fixes boards: add, edit, claim, let go, done, reopen$q$);
