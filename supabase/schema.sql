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
  ('Murn', 'MURN'), ('Yvo', 'Skynal'), ('Mees', 'mjezzo'), ('Ian', 'Troy')
on conflict (player_name) do update set discord_name = excluded.discord_name;

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
  foreach t in array array['listings', 'tips', 'events', 'signups', 'bank_reservations', 'listing_reservations'] loop
    execute format('drop policy if exists "insert own" on public.%I', t);
    execute format('drop policy if exists "update own" on public.%I', t);
    execute format('drop policy if exists "delete own" on public.%I', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check (user_id = auth.uid() and public.is_member())', t);
    execute format('create policy "update own" on public.%I for update to authenticated using (public.same_player(user_id)) with check (public.same_player(user_id))', t);
    execute format('create policy "delete own" on public.%I for delete to authenticated using (public.same_player(user_id))', t);
  end loop;
end $$;
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

-- Urgency of a ticket: 4 = Urgent, 3 = High, 2 = Normal, 1 = Low (highest first on the board).
alter table public.dev_tickets add column if not exists urgency smallint not null default 2 check (urgency between 1 and 4);

-- Reactions on a ticket (❤️ 👍 …): per emoji the names of who reacted, e.g. {"❤️": ["Jelle", "Justin"]}.
-- Changed only through toggle_ticket_reaction(), which takes your name from members (so you can only switch your own).
alter table public.dev_tickets add column if not exists reactions jsonb not null default '{}'::jsonb;
create or replace function public.toggle_ticket_reaction(p_ticket uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text; cur jsonb; arr jsonb;
begin
  if not public.is_dev() then raise exception 'Only developers can react'; end if;
  if p_emoji not in ('❤️', '👍', '👎', '🔥', '😂', '🤔', '🎉', '👀', '🚀', '⭐') then raise exception 'Unknown reaction'; end if;
  select player_name into me from public.members where user_id = auth.uid() limit 1;
  select reactions into cur from public.dev_tickets where id = p_ticket for update;
  if cur is null then raise exception 'Ticket not found'; end if;
  arr := coalesce(cur -> p_emoji, '[]'::jsonb);
  if arr ? me then
    arr := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(arr) as x where x <> me);
  else
    arr := arr || to_jsonb(me);
  end if;
  if jsonb_array_length(arr) = 0 then cur := cur - p_emoji; else cur := jsonb_set(cur, array[p_emoji], arr); end if;
  update public.dev_tickets set reactions = cur where id = p_ticket;
  return cur;
end $$;
revoke execute on function public.toggle_ticket_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_ticket_reaction(uuid, text) to authenticated;

-- Comments on a ticket (dev.html → Ideas / Fixes → 💬). The author is filled in by the database (from members),
-- so it always shows the right name; you can only remove your own comment.
create table if not exists public.dev_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.dev_tickets (id) on delete cascade,
  author text,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists dev_ticket_comments_ticket on public.dev_ticket_comments (ticket_id, created_at);
create or replace function public.set_comment_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author := (select player_name from public.members where user_id = auth.uid() limit 1);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists set_comment_author on public.dev_ticket_comments;
create trigger set_comment_author before insert on public.dev_ticket_comments for each row execute function public.set_comment_author();
alter table public.dev_ticket_comments enable row level security;
drop policy if exists "read devs" on public.dev_ticket_comments;
drop policy if exists "add devs" on public.dev_ticket_comments;
drop policy if exists "delete own" on public.dev_ticket_comments;
create policy "read devs" on public.dev_ticket_comments for select to authenticated using (public.is_dev());
create policy "add devs" on public.dev_ticket_comments for insert to authenticated with check (public.is_dev());
create policy "delete own" on public.dev_ticket_comments for delete to authenticated
  using (public.is_dev() and author = (select player_name from public.members where user_id = auth.uid() limit 1));

-- The first ideas used to be added here on every run, so a removed idea came back. They are in the database already and are no longer added; they stay on the board until someone removes them.

-- The example fix card is gone: this file used to add it again on every run, also after someone removed it. This removes the last copy.
delete from public.dev_tickets where id = '6f1d2a10-0001-4c3e-9a51-000000000101';

-- Checklist item for the new boards.
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Ideas + Fixes boards: add, edit, claim, let go, done, reopen$q$, $q$Developer mode$q$, 'check', $q$Try every button on dev.html → Ideas and Fixes once, as Jelle and as Justin.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Ideas + Fixes boards: add, edit, claim, let go, done, reopen$q$);

-- 2026-11-04: where a card came from: 'board' = added on dev.html itself, 'player' = sent in with "Report a problem" / "Suggest a feature"
-- (also when a developer used those buttons: that card does count as new for the developer who sent it).
alter table public.dev_tickets add column if not exists source text not null default 'board' check (source in ('board', 'player'));

-- 2026-11-04: every logged-in player can report a problem or suggest a feature (account menu → "Report a problem" / "Suggest a feature").
-- It becomes a card on the Fixes or Ideas board (dev_tickets) with the player's name as created_by. Players cannot read or change
-- the boards themselves (only is_dev()); they only hand a ticket in through this function, which takes the name from `members`
-- (so nobody can send in something in another player's name) and allows 10 per hour per player.
create or replace function public.submit_ticket(p_kind text, p_title text, p_body text, p_page text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me text; new_id uuid; t text; b text;
begin
  select player_name into me from public.members where user_id = auth.uid() limit 1;
  if me is null then raise exception 'Choose your player first'; end if;
  if p_kind not in ('idea', 'fix') then raise exception 'Unknown kind'; end if;
  t := btrim(coalesce(p_title, ''));
  b := btrim(coalesce(p_body, ''));
  if char_length(t) < 3 then raise exception 'Give it a short title'; end if;
  if (select count(*) from public.dev_tickets where created_by = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That is a lot of reports in an hour, try again later';
  end if;
  insert into public.dev_tickets (kind, title, area, body, created_by, updated_by, source)
  values (p_kind, left(t, 120), nullif(left(btrim(coalesce(p_page, '')), 40), ''), nullif(left(b, 6000), ''), me, me, 'player')
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.submit_ticket(text, text, text, text) from public, anon;
grant execute on function public.submit_ticket(text, text, text, text) to authenticated;

-- What is new for a developer: per developer the moment they last opened the Ideas tab and the Fixes tab on dev.html.
-- The orange count next to DEV = tickets made by someone else after that moment. First time: everything that exists counts as seen.
create table if not exists public.dev_seen (
  player_name text primary key,
  ideas_seen_at timestamptz not null default now(),
  fixes_seen_at timestamptz not null default now()
);
alter table public.dev_seen enable row level security;  -- no policies: only the two functions below use it

create or replace function public.dev_ticket_news() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text; s public.dev_seen; ni int; nf int;
begin
  if not public.is_dev() then return jsonb_build_object('ideas', 0, 'fixes', 0); end if;
  select player_name into me from public.members where user_id = auth.uid() limit 1;
  insert into public.dev_seen (player_name) values (me) on conflict (player_name) do nothing;
  select * into s from public.dev_seen where player_name = me;
  select count(*) into ni from public.dev_tickets where kind = 'idea' and created_at > s.ideas_seen_at and (coalesce(created_by, '') <> me or source = 'player');
  select count(*) into nf from public.dev_tickets where kind = 'fix' and created_at > s.fixes_seen_at and (coalesce(created_by, '') <> me or source = 'player');
  return jsonb_build_object('ideas', ni, 'fixes', nf, 'ideas_seen_at', s.ideas_seen_at, 'fixes_seen_at', s.fixes_seen_at);
end $$;

create or replace function public.dev_mark_tickets_seen(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if not public.is_dev() then return; end if;
  select player_name into me from public.members where user_id = auth.uid() limit 1;
  insert into public.dev_seen (player_name) values (me) on conflict (player_name) do nothing;
  if p_kind = 'idea' then update public.dev_seen set ideas_seen_at = now() where player_name = me;
  elsif p_kind = 'fix' then update public.dev_seen set fixes_seen_at = now() where player_name = me;
  end if;
end $$;
revoke all on function public.dev_ticket_news() from public, anon;
revoke all on function public.dev_mark_tickets_seen(text) from public, anon;
grant execute on function public.dev_ticket_news() to authenticated;
grant execute on function public.dev_mark_tickets_seen(text) to authenticated;

-- Checklist item for this feature.
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Report a problem / Suggest a feature from the account menu, with the orange count next to DEV$q$, $q$Developer mode$q$, 'check',
  $q$As a player (not Jelle or Justin): menu → Report a problem and Suggest a feature, send one of each. As a developer: the orange count shows up next to DEV, the cards are on Fixes / Ideas with the player's name and a New label, and the count is gone after opening the tab.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Report a problem / Suggest a feature from the account menu, with the orange count next to DEV$q$);

-- 2026-11-04: automatic check after every deploy (workflow "Check site after deploy", tools/check-site.mjs).
-- The workflow reports its result with report_deploy_check(). It has no login, so it proves itself with a secret that is stored
-- only as a hash (like the guild code). Set it once (Jelle or Justin, in the SQL Editor), and put the SAME secret in GitHub as the
-- Actions secret DEPLOY_CHECK_SECRET (use a long random one, e.g. 40 characters):
--   insert into private.settings (key, value)
--   values ('deploy_check_hash', extensions.crypt('A-LONG-RANDOM-SECRET', extensions.gen_salt('bf')))
--   on conflict (key) do update set value = excluded.value;
-- Result: one line in Checks ("Automatic check after every deploy": red when broken, green when fine) and, while it is broken,
-- one open card in Fixes (made by "Deploy check", kept up to date; closed again when the check is green and nobody picked it up).
create or replace function public.report_deploy_check(p_secret text, p_ok boolean, p_summary text, p_details text, p_commit text) returns void
language plpgsql security definer set search_path = public, private, extensions as $$
declare h text; chk constant text := 'Automatic check after every deploy'; note_text text; card text; open_id uuid;
begin
  select value into h from private.settings where key = 'deploy_check_hash';
  if h is null or extensions.crypt(coalesce(p_secret, ''), h) <> h then raise exception 'Not allowed'; end if;
  note_text := left(coalesce(p_summary, '') || case when coalesce(p_commit, '') <> '' then ' · ' || p_commit else '' end, 500);
  card := left(coalesce(p_summary, '') || E'\n\n' || coalesce(p_details, '') || E'\n\n' || coalesce(p_commit, ''), 6000);

  update public.dev_checks set status = case when p_ok then 'ok' else 'broken' end, note = note_text, updated_by = 'Deploy check', updated_at = now()
  where title = chk;
  if not found then
    insert into public.dev_checks (title, area, status, note, updated_by)
    values (chk, 'Deploy', case when p_ok then 'ok' else 'broken' end, note_text, 'Deploy check');
  end if;

  select id into open_id from public.dev_tickets
  where kind = 'fix' and created_by = 'Deploy check' and status in ('open', 'doing') order by created_at desc limit 1;
  if not p_ok then
    if open_id is null then
      insert into public.dev_tickets (kind, title, area, body, urgency, created_by, updated_by)
      values ('fix', 'The automatic check after the deploy found errors', 'Deploy', card, 3, 'Deploy check', 'Deploy check');
    else
      update public.dev_tickets set body = card, updated_by = 'Deploy check', updated_at = now() where id = open_id;
    end if;
  elsif open_id is not null then
    update public.dev_tickets set status = 'done', done_at = now(), updated_by = 'Deploy check', updated_at = now()
    where id = open_id and status = 'open';
  end if;
end $$;
revoke all on function public.report_deploy_check(text, boolean, text, text, text) from public;
grant execute on function public.report_deploy_check(text, boolean, text, text, text) to anon, authenticated;

-- Checklist item for this feature.
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Deploy check: set the secret (GitHub + Supabase) and run it once$q$, $q$Deploy$q$, 'check',
  $q$1) Put a long random secret in GitHub as DEPLOY_CHECK_SECRET. 2) Run the SQL in the comment above report_deploy_check in schema.sql with the same secret. 3) GitHub → Actions → Check site after deploy → Run workflow: the line "Automatic check after every deploy" appears here, green.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Deploy check: set the secret (GitHub + Supabase) and run it once$q$);

-- 2026-11-04: Switch main on My profile. Takes the player name from `members`; only this function may change a player's status (see characters_guard).
create or replace function public.set_main_character(p_character text) returns void
language plpgsql security definer set search_path = public as $$
declare me text; c text;
begin
  select player_name into me from public.members where user_id = auth.uid() limit 1;
  if me is null then raise exception 'Choose your player first'; end if;
  c := btrim(coalesce(p_character, ''));
  if char_length(c) < 1 or char_length(c) > 60 then raise exception 'Unknown character'; end if;
  if not exists (select 1 from public.characters ch where ch.player_name = me and lower(btrim(ch.name)) = lower(c)) then
    raise exception 'Unknown character';
  end if;
  -- The old main becomes an Alt first (one main per player).
  perform set_config('app.switching_main', 'on', true);  -- lets characters_guard allow this status change; only for this transaction
  update public.characters set status = 'Alt' where player_name = me and status = 'Main' and lower(btrim(name)) <> lower(c);
  update public.characters set status = 'Main' where player_name = me and lower(btrim(name)) = lower(c) and status <> 'Main';
end $$;
revoke all on function public.set_main_character(text) from public, anon;
grant execute on function public.set_main_character(text) to authenticated;

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Choose your main character (My profile)$q$, $q$Profile$q$, 'check',
  $q$Player with 2+ characters: pick a main on My profile, then check Roster / Home / Overview (main + alts). Switch to another main and back. Player with 1 character: automatically main. Then run a guild sync: Discord follows the choice.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Choose your main character (My profile)$q$);

-- 2026-11-04: Change log per ticket (dev.html → Ideas / Fixes → card → History). A trigger on dev_tickets writes a line for
-- every real change (created, taken, let go, done, reopened, urgency, edited), whoever or whatever made it (dev.html,
-- submit_ticket(), SQL). Reactions and plain "updated_at" bumps are not logged. Only is_dev() can read it; nobody writes it by hand.
create table if not exists public.dev_ticket_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.dev_tickets (id) on delete cascade,
  actor text,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists dev_ticket_log_ticket on public.dev_ticket_log (ticket_id, created_at);
alter table public.dev_ticket_log add column if not exists detail text;  -- 2026-11-04: what the text was before / is now (details edits)
alter table public.dev_ticket_log enable row level security;
drop policy if exists "read devs" on public.dev_ticket_log;
create policy "read devs" on public.dev_ticket_log for select to authenticated using (public.is_dev());

create or replace function public.log_ticket_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text; urgs text[] := array['Low', 'Normal', 'High', 'Urgent'];
begin
  select player_name into me from public.members where user_id = auth.uid() limit 1;
  if tg_op = 'INSERT' then
    insert into public.dev_ticket_log (ticket_id, actor, text, created_at)
    values (new.id, coalesce(new.created_by, me), case when new.source = 'player' then 'Reported it' else 'Added it' end, new.created_at);
    return new;
  end if;
  me := coalesce(me, new.updated_by);
  if new.status is distinct from old.status or new.claimed_by is distinct from old.claimed_by then
    insert into public.dev_ticket_log (ticket_id, actor, text) values (new.id, me, case
      when new.status = 'done' then 'Marked it done' || coalesce(' (on ' || new.claimed_by || '''s name)', '')
      when new.status = 'doing' and old.status = 'doing' and old.claimed_by is not null then 'Took it over from ' || old.claimed_by
      when new.status = 'doing' then 'Took it ("I''ll take this")'
      when new.status = 'open' and old.status = 'done' then 'Reopened it'
      when new.status = 'open' and old.status = 'doing' then 'Let go of it' || coalesce(' (was on ' || old.claimed_by || '''s name)', '')
      else 'Status: ' || old.status || ' → ' || new.status end);
  end if;
  if new.urgency is distinct from old.urgency then
    insert into public.dev_ticket_log (ticket_id, actor, text)
    values (new.id, me, 'Urgency: ' || urgs[old.urgency] || ' → ' || urgs[new.urgency]);
  end if;
  if new.title is distinct from old.title then
    insert into public.dev_ticket_log (ticket_id, actor, text) values (new.id, me, 'Changed the title (was "' || old.title || '")');
  end if;
  if new.area is distinct from old.area then
    insert into public.dev_ticket_log (ticket_id, actor, text) values (new.id, me, 'Area: ' || coalesce(old.area, '–') || ' → ' || coalesce(new.area, '–'));
  end if;
  if new.body is distinct from old.body then
    insert into public.dev_ticket_log (ticket_id, actor, text, detail)
    values (new.id, me, 'Edited the details', 'Was: ' || coalesce(left(old.body, 400), '(empty)') || E'\nNow: ' || coalesce(left(new.body, 400), '(empty)'));
  end if;
  return new;
end $$;
drop trigger if exists log_ticket_change on public.dev_tickets;
create trigger log_ticket_change after insert or update on public.dev_tickets for each row execute function public.log_ticket_change();

-- Tickets from before this log existed: one "created" line (and "done" if it is done), so every card has a start.
insert into public.dev_ticket_log (ticket_id, actor, text, created_at)
select t.id, t.created_by, case when t.source = 'player' then 'Reported it' else 'Added it' end, t.created_at
from public.dev_tickets t where not exists (select 1 from public.dev_ticket_log l where l.ticket_id = t.id);
insert into public.dev_ticket_log (ticket_id, actor, text, created_at)
select t.id, coalesce(t.claimed_by, t.updated_by), 'Marked it done', coalesce(t.done_at, t.updated_at)
from public.dev_tickets t where t.status = 'done'
  and not exists (select 1 from public.dev_ticket_log l where l.ticket_id = t.id and l.text like 'Marked it done%');

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Ticket history (Ideas + Fixes cards)$q$, $q$Developer mode$q$, 'check',
  $q$After running schema.sql: open a card → 🕘 History shows who created it. Take it, change urgency, edit, let go, done, reopen: each adds a line with the right name and time. Reactions add nothing. A report sent in through the account menu shows "Reported it".$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Ticket history (Ideas + Fixes cards)$q$);

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$History of all tickets (bottom of the Ideas / Fixes boards)$q$, $q$Developer mode$q$, 'check',
  $q$Open 🕘 History of all fixes under the board: newest first, who + what + ticket + "now: phase" + time. Click a ticket name: the card opens. Do something to a ticket (take, done, edit): a new line appears on top.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$History of all tickets (bottom of the Ideas / Fixes boards)$q$);

-- 2026-11-05: character data from the Blizzard API, every 15 minutes (GitHub's own schedule proved unreliable, and data in the repo meant a commit
-- + deploy per update). The Edge Function supabase/functions/update-characters writes these tables with the service key; the site only reads them
-- (loadBlizzard() in js/sheet.js). blizzard_characters: one row per character, data = one entry per character.
-- blizzard_update: one row with the last successful run (updated_at), its counts, and the last problem (message).
create table if not exists public.blizzard_characters (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.blizzard_update (
  id int primary key default 1 check (id = 1),
  updated_at timestamptz,
  ok int,
  not_found int,
  errors int,
  message text
);
alter table public.blizzard_characters enable row level security;
alter table public.blizzard_update enable row level security;
drop policy if exists "read all" on public.blizzard_characters;
drop policy if exists "read all" on public.blizzard_update;
create policy "read all" on public.blizzard_characters for select using (true);  -- no write policies: only the service key writes
create policy "read all" on public.blizzard_update for select using (true);
grant select on public.blizzard_characters, public.blizzard_update to anon, authenticated;
grant all on public.blizzard_characters, public.blizzard_update to service_role;

-- The timer: every 15 minutes pg_cron calls the Edge Function. The secret comes from the Vault (never in this file), once, by a developer:
--   select vault.create_secret('<the same text as the function secret UPDATE_CHARACTERS_SECRET>', 'update_characters_secret');
-- To change it later:  select vault.update_secret((select id from vault.secrets where name = 'update_characters_secret'), '<new text>');
-- See what it did:     select * from cron.job_run_details order by start_time desc limit 10;  select * from net._http_response order by created desc limit 10;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('update-characters', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://uvnmgyhnqlibnvpivhdf.supabase.co/functions/v1/update-characters',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-update-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'update_characters_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  )
$job$);

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Character data every 15 minutes (Supabase)$q$, $q$Characters$q$, 'check',
  $q$After the setup: Checks → Blizzard characters shows "Updated" less than an hour ago and comes from the database. Log out in the game with a character of level 10+, wait up to 15 minutes, reload Members: the new level and skills are there, without a new commit or deploy.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Character data every 15 minutes (Supabase)$q$);

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Game statistics on Home and player pages$q$, $q$Characters$q$, 'check',
  $q$After deploying the Edge Function update-characters again in Supabase: within 15 minutes Home shows Activity in the game (quests, kills, deaths, fish). Compare one player page with that character's in-game statistics, and check that the player pages add up to the guild total.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Game statistics on Home and player pages$q$);

-- 2026-11-06: all characters in one table (this replaced the Google Sheet and the tables profiles, alts and main_characters).
-- Everyone can read. The API stays leading on the site where it knows a character (applyApi() in js/sheet.js); these rows are what the API cannot tell.
-- Who may change what is enforced by the trigger below:
--   developers (is_dev()): everything; a player: only their own characters.
--   a player, API does not know the character yet (under level 10): name, race, class and role.
--   a player, API knows the character: only the role.
-- Level and professions come from the API. professions: [{"name": "Mining", "kind": "primary" | "secondary", "skill": 12}]. No limit on the number of alts.
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  player_name text not null references public.players(player_name) on update cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  race text check (char_length(race) <= 40),
  class text check (char_length(class) <= 40),
  role text check (role in ('Tank', 'Healer', 'DPS')),
  level int check (level between 1 and 60),
  professions jsonb not null default '[]'::jsonb check (jsonb_typeof(professions) = 'array'),
  status text not null default 'Alt' check (status in ('Main', 'Alt', 'Gestopt')),
  notes text check (char_length(notes) <= 500),
  recipes text check (char_length(recipes) <= 500),
  updated_at timestamptz not null default now(),
  updated_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists characters_name_key on public.characters ((lower(btrim(name))));  -- the name is the key on the site and in the API
create unique index if not exists characters_one_main on public.characters (player_name) where status = 'Main';
alter table public.characters enable row level security;

create or replace function public.current_player() returns text
language sql stable security definer set search_path = public as $$
  select player_name from public.members where user_id = auth.uid() limit 1 $$;
grant execute on function public.current_player() to anon, authenticated;

drop policy if exists "read all" on public.characters;
drop policy if exists "insert own" on public.characters;
drop policy if exists "update own" on public.characters;
drop policy if exists "delete devs" on public.characters;
create policy "read all" on public.characters for select using (true);
create policy "insert own" on public.characters for insert to authenticated with check (public.is_dev() or player_name = public.current_player());
create policy "update own" on public.characters for update to authenticated using (public.is_dev() or player_name = public.current_player()) with check (public.is_dev() or player_name = public.current_player());
create policy "delete devs" on public.characters for delete to authenticated using (public.is_dev());
grant select on public.characters to anon, authenticated;
grant insert, update, delete on public.characters to authenticated;
grant all on public.characters to service_role;

create or replace function public.characters_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare known boolean;
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor (import, which keeps the sheet's date) and the service key
  new.updated_at := now();
  new.updated_by := public.current_player();
  if public.is_dev() then return new; end if;
  if tg_op = 'INSERT' then
    -- A player only gives name, race, class and role. The first character of a player is the main.
    new.level := null; new.professions := '[]'::jsonb; new.notes := null; new.recipes := null;
    new.status := case when exists (select 1 from public.characters c where c.player_name = new.player_name and c.status = 'Main') then 'Alt' else 'Main' end;
    return new;
  end if;
  if new.player_name is distinct from old.player_name or new.level is distinct from old.level or new.professions is distinct from old.professions
     or (new.status is distinct from old.status and current_setting('app.switching_main', true) is distinct from 'on')
     or new.notes is distinct from old.notes or new.recipes is distinct from old.recipes then
    raise exception 'Only the name, race, class and role of a character can be changed here';
  end if;
  known := exists (select 1 from public.blizzard_characters b where b.key = lower(btrim(old.name)) and b.data->>'status' = 'ok');
  if known and (new.name is distinct from old.name or new.race is distinct from old.race or new.class is distinct from old.class) then
    raise exception 'The game knows this character: only the role can be changed';
  end if;
  return new;
end $$;
drop trigger if exists characters_guard on public.characters;
create trigger characters_guard before insert or update on public.characters for each row execute function public.characters_guard();

-- 2026-11-06: the Google Sheet is gone. The old character tables are not used any more: all their characters are in the table characters.
drop table if exists public.profiles;
drop table if exists public.alts;
drop table if exists public.main_characters;
delete from public.dev_checks where title = $q$Table characters: import from the sheet$q$;

-- 2026-11-06: test points for Justin's changes (sheet removed, characters table, character pictures, Details card).
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Google Sheet gone: site works without it$q$, $q$Characters$q$, 'check',
  $q$Open Home, Roster, Professions, Overview and a player page: all show the characters (levels, professions, roles) without errors. Nothing mentions the sheet any more. Developer mode > Checks: no red lines for old sheet or import checks.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Google Sheet gone: site works without it$q$);
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$My profile: main + alts, character picture$q$, $q$My profile$q$, 'check',
  $q$Open My profile: cards are equal and narrower, the main and its alts (sorted by level) sit under each other with the items around the character picture from the game. Switch main still works. Set up a new character (not known to the game yet): rules still allow editing race, class and role.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$My profile: main + alts, character picture$q$);
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Character picture on the player and character pages$q$, $q$Characters$q$, 'check',
  $q$Player page: full-width character cards with the items around the picture. Character page: stat tiles on top, picture fits its frame. A character the game does not know yet shows no broken image.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Character picture on the player and character pages$q$);
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Character page: Last login and Last updated in Details$q$, $q$Characters$q$, 'check',
  $q$Open a character the game knows: Details shows Last login and Last updated with date and time in Dutch time. A character under level 10 shows only the date it was last changed. The From the game card is gone.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Character page: Last login and Last updated in Details$q$);
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Developer mode > Characters: edit and lock$q$, $q$Developer mode$q$, 'check',
  $q$Characters tab shows what the site shows. Game fields (level, race, class, professions) are locked for characters the game knows; role, status, name and notes can be edited, for one of your own and for another player's. Saving works and the change shows on the site.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Developer mode > Characters: edit and lock$q$);
insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Update characters every 15 minutes (Edge Function)$q$, $q$Characters$q$, 'check',
  $q$Developer mode > Checks: the Blizzard data line is green and not older than about 15 minutes. Level, professions and last login change after a player logs out. If you changed supabase/functions/update-characters, deploy it in Supabase first.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Update characters every 15 minutes (Edge Function)$q$);

-- 2026-11-06: achievement tree (achievements.html, js/achievements.js). The catalogue lives in the code; this table holds what the developers
-- changed: switch an achievement off (player_name '' only), force it unlocked / locked, enter a value, or reset it (baseline = what the
-- player had at that moment, progress counts from there). player_name '' = everyone / a guild goal; a player's own row wins over it.
create table if not exists public.achievement_overrides (
  achievement_id text not null check (char_length(achievement_id) <= 40),
  player_name text not null default '' check (char_length(player_name) <= 40),
  disabled boolean not null default false,
  forced text check (forced in ('unlocked', 'locked')),
  value numeric check (value >= 0),
  baseline numeric not null default 0 check (baseline >= 0),
  note text check (char_length(note) <= 200),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (achievement_id, player_name)
);
alter table public.achievement_overrides enable row level security;
drop policy if exists "read all" on public.achievement_overrides;
drop policy if exists "write devs" on public.achievement_overrides;
create policy "read all" on public.achievement_overrides for select using (true);
create policy "write devs" on public.achievement_overrides for all to authenticated using (public.is_dev()) with check (public.is_dev());

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Achievement tree: unlock flow and progress$q$, $q$Achievements$q$, 'check',
  $q$After running schema.sql: open Achievements. Everything behind an unfinished achievement shows ???. Progress bars match the Roster (levels, skill), Bank (donations). Switch "Viewing" to another player: points and unlocks change. Check kills, quests, deaths and fish against From the game numbers.$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Achievement tree: unlock flow and progress$q$);

insert into public.dev_checks (title, area, status, note, updated_by)
select $q$Achievement tree: developer controls$q$, $q$Achievements$q$, 'check',
  $q$In developer mode click an achievement. Switch off: it greys out, stops counting and does not block the ones behind it. Force unlocked / locked, Set value, Reset progress and Remove all changes each ask for confirmation and change the tree at once. A non-developer cannot save (the database refuses).$q$, 'Claude'
where not exists (select 1 from public.dev_checks where title = $q$Achievement tree: developer controls$q$);
