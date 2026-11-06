// Achievement tree: the catalogue (what exists, what it asks, where it sits in the tree) and the logic (progress from our data, what is
// unlocked, what the developers changed). The look is in achievements.html and css/style.css; the icons are in js/achicons.js.
//
// How it works
//  - Five branches (Journey, Slayer, Craftsman, Treasury, Fellowship) and a Legend on top. Like Minecraft: a node can only be earned once
//    everything it requires is done ("available"); until then it is locked and its name is hidden.
//  - Progress comes from data we already have: character levels and professions (table characters + Blizzard API), kills / quests /
//    deaths / fish (Blizzard statistics), gold donated (gold_donations), events joined (signups), the guild bank (bank).
//  - "player" achievements are earned per player (all his characters together), "guild" goals are shared: everybody sees the same.
//  - Developers can change every achievement in the table achievement_overrides: switch it off, force it unlocked or locked, enter a
//    value, or reset it (progress counts from now on). See the dev panel in achievements.html and docs/instructies.md.
import { supabase } from './supabase.js?v=__V__';
import { loadCharacters, loadBlizzard, gameTotals } from './players.js?v=__V__';

export const BRANCHES = [
  { key: 'journey', name: 'Journey', blurb: 'Level up: one character, your alts, and all your characters together.', rows: 3 },
  { key: 'slayer', name: 'Slayer', blurb: 'Kills, quests and the occasional trip back from the graveyard.', rows: 3 },
  { key: 'craft', name: 'Craftsman', blurb: 'Professions, skill points and fishing.', rows: 3 },
  { key: 'treasury', name: 'Treasury', blurb: 'Gold for the guild bank, from the first coin to the full vault.', rows: 3 },
  { key: 'fellowship', name: 'Fellowship', blurb: 'Play together: events, full parties and a guild that shows up.', rows: 3 },
  { key: 'legend', name: 'Legend', blurb: 'The top of the tree.', rows: 1 },
];

// meter key -> [label shown after the number, scope]
export const METERS = {
  maxLevel: 'level (highest character)', totalLevel: 'player level (all characters together)', altBest: 'level (highest alt)', altTotal: 'alt levels together',
  bestSkill: 'skill (best profession)', totalSkill: 'skill points in total', profsAt75: 'professions at skill 75+', profsAt150: 'professions at skill 150+',
  profsAt225: 'professions at skill 225+', kills: 'kills', quests: 'quests completed', deaths: 'deaths', fish: 'fish caught', donated: 'gold donated',
  events: 'events joined',
  guildDonated: 'gold donated by the guild', donors: 'different donors', bankBought: 'guild bank bought', bigEvent: 'players signed up for one event',
  guildEvents: 'events held', playersAt40: 'players with a character at level 40+', playersAt60: 'players with a character at level 60',
  requiredDone: 'achievements done',
};

// [id, branch, col, row, glyph, tier, title, description, meter, target, points, hours (rough play time), requires, scope]
const rows = [
  // ---- Journey -------------------------------------------------------------------------------------------------------------------
  ['j1', 'journey', 0, 1, 'boot', 'bronze', 'First Steps', 'Reach level 10 with any character. From level 10 the game data (and this dashboard) can see you.', 'maxLevel', 10, 5, 5, []],
  ['j2', 'journey', 1, 1, 'flag', 'bronze', 'Getting Warmed Up', 'Reach level 20 with any character.', 'maxLevel', 20, 5, 20, ['j1']],
  ['j3', 'journey', 2, 1, 'mountain', 'silver', 'Halfway to the Top', 'Reach level 30 with any character.', 'maxLevel', 30, 10, 50, ['j2']],
  ['j4', 'journey', 3, 1, 'tent', 'silver', 'Seasoned Traveller', 'Reach level 40 with any character; mounts are within reach.', 'maxLevel', 40, 10, 90, ['j3']],
  ['j5', 'journey', 4, 1, 'shield', 'gold', 'Veteran of the Wild', 'Reach level 50 with any character.', 'maxLevel', 50, 25, 150, ['j4']],
  ['j6', 'journey', 5, 1, 'crown', 'crimson', 'Sixty Strong', 'Reach the level cap (60) with any character.', 'maxLevel', 60, 50, 220, ['j5']],
  ['j7', 'journey', 2, 0, 'fork', 'bronze', 'Twin Paths', 'Get an alt to level 10.', 'altBest', 10, 5, 25, ['j2']],
  ['j8', 'journey', 3, 0, 'party', 'silver', 'Alt Army', 'Add up 100 levels on your alts (every alt counts, Quit characters do not).', 'altTotal', 100, 15, 90, ['j7']],
  ['j9', 'journey', 3, 2, 'star', 'silver', 'Many Hands', 'Player level 150: the levels of all your characters added together.', 'totalLevel', 150, 15, 100, ['j3']],
  ['j10', 'journey', 4, 2, 'laurel', 'gold', 'Hundreds Strong', 'Player level 300: the levels of all your characters added together.', 'totalLevel', 300, 40, 300, ['j9', 'j6']],

  // ---- Slayer --------------------------------------------------------------------------------------------------------------------
  ['s1', 'slayer', 0, 1, 'sword', 'bronze', 'First Blood', 'Defeat 100 enemies, all your characters together.', 'kills', 100, 5, 2, []],
  ['s2', 'slayer', 1, 1, 'sword', 'bronze', 'Pest Control', 'Defeat 1,000 enemies.', 'kills', 1000, 5, 15, ['s1']],
  ['s3', 'slayer', 2, 1, 'swords', 'silver', 'Hunter', 'Defeat 5,000 enemies.', 'kills', 5000, 10, 60, ['s2']],
  ['s4', 'slayer', 3, 1, 'swords', 'gold', 'Slayer', 'Defeat 15,000 enemies.', 'kills', 15000, 25, 150, ['s3']],
  ['s5', 'slayer', 4, 1, 'skull', 'crimson', 'Relentless', 'Defeat 40,000 enemies. That is a lot of evenings.', 'kills', 40000, 50, 300, ['s4']],
  ['s6', 'slayer', 1, 0, 'questmark', 'bronze', 'Quest Taker', 'Complete 100 quests.', 'quests', 100, 5, 10, ['s1']],
  ['s7', 'slayer', 2, 0, 'book', 'silver', 'Quest Collector', 'Complete 500 quests.', 'quests', 500, 15, 60, ['s6']],
  ['s8', 'slayer', 3, 0, 'scroll', 'gold', 'Quest Master', 'Complete 1,500 quests.', 'quests', 1500, 30, 200, ['s7']],
  ['s9', 'slayer', 1, 2, 'tomb', 'bronze', 'Learning Experience', 'Die 10 times. Everyone does.', 'deaths', 10, 5, 3, ['s1']],
  ['s10', 'slayer', 2, 2, 'tomb', 'silver', 'Frequent Flyer', 'Die 100 times and run back every time.', 'deaths', 100, 10, 40, ['s9']],

  // ---- Craftsman -----------------------------------------------------------------------------------------------------------------
  ['c1', 'craft', 0, 1, 'hammer', 'bronze', 'Apprentice', 'Reach skill 75 in any profession.', 'bestSkill', 75, 5, 15, []],
  ['c2', 'craft', 1, 1, 'anvil', 'silver', 'Journeyman', 'Reach skill 150 in any profession.', 'bestSkill', 150, 10, 50, ['c1']],
  ['c3', 'craft', 2, 1, 'flask', 'silver', 'Expert', 'Reach skill 225 in any profession.', 'bestSkill', 225, 15, 120, ['c2']],
  ['c4', 'craft', 3, 1, 'gem', 'gold', 'Artisan', 'Reach skill 300 in any profession.', 'bestSkill', 300, 40, 250, ['c3']],
  ['c5', 'craft', 1, 0, 'pickaxe', 'bronze', 'Jack of All Trades', 'Have two professions at skill 75 or more.', 'profsAt75', 2, 5, 40, ['c1']],
  ['c6', 'craft', 2, 0, 'pickaxe', 'silver', 'Twice an Expert', 'Have two professions at skill 150 or more.', 'profsAt150', 2, 15, 110, ['c5', 'c2']],
  ['c7', 'craft', 3, 0, 'anvil', 'gold', 'Workshop Owner', 'Add up 600 profession skill points, all characters together.', 'totalSkill', 600, 25, 150, ['c6']],
  ['c8', 'craft', 4, 0, 'trophy', 'crimson', 'Guild Craftsmaster', 'Add up 1,200 profession skill points, all characters together.', 'totalSkill', 1200, 50, 300, ['c7', 'c4']],
  ['c9', 'craft', 1, 2, 'fish', 'bronze', 'Gone Fishin\'', 'Catch 100 fish.', 'fish', 100, 5, 10, ['c1']],
  ['c10', 'craft', 2, 2, 'rod', 'silver', 'Master Angler', 'Catch 1,000 fish.', 'fish', 1000, 20, 100, ['c9']],

  // ---- Treasury ------------------------------------------------------------------------------------------------------------------
  ['d1', 'treasury', 0, 1, 'coin', 'bronze', 'First Coin', 'Donate 1 gold to the guild bank.', 'donated', 1, 5, 3, []],
  ['d2', 'treasury', 1, 1, 'coin', 'bronze', 'Generous', 'Donate 10 gold in total.', 'donated', 10, 10, 12, ['d1']],
  ['d3', 'treasury', 2, 1, 'coins', 'silver', 'Patron', 'Donate 50 gold in total.', 'donated', 50, 15, 50, ['d2']],
  ['d4', 'treasury', 3, 1, 'coins', 'gold', 'Benefactor', 'Donate 100 gold in total.', 'donated', 100, 30, 100, ['d3']],
  ['d5', 'treasury', 4, 1, 'heart', 'crimson', 'Guild Banker', 'Donate 500 gold in total. The guild will remember.', 'donated', 500, 50, 300, ['d4']],
  ['d6', 'treasury', 0, 0, 'chest', 'guild', 'Bank Opened', 'The guild bank has been bought.', 'bankBought', 1, 20, 0, [], 'guild'],
  ['d7', 'treasury', 1, 0, 'vault', 'guild', 'Full Vault', 'The guild has donated 200 gold together.', 'guildDonated', 200, 25, 0, ['d6'], 'guild'],
  ['d8', 'treasury', 2, 0, 'vault', 'guild', 'Thousand Gold Club', 'The guild has donated 1,000 gold together.', 'guildDonated', 1000, 50, 0, ['d7'], 'guild'],
  ['d9', 'treasury', 0, 2, 'heart', 'guild', 'Everyone Chips In', 'Eight different players have donated gold.', 'donors', 8, 25, 0, [], 'guild'],
  ['d10', 'treasury', 1, 2, 'coins', 'guild', 'Gold Rush', 'The guild has donated 500 gold together.', 'guildDonated', 500, 35, 0, ['d9'], 'guild'],

  // ---- Fellowship ----------------------------------------------------------------------------------------------------------------
  ['f1', 'fellowship', 0, 1, 'calendar', 'bronze', 'Join the Party', 'Sign up for your first event.', 'events', 1, 5, 3, []],
  ['f2', 'fellowship', 1, 1, 'calendar', 'bronze', 'Regular', 'Sign up for 5 events.', 'events', 5, 10, 15, ['f1']],
  ['f3', 'fellowship', 2, 1, 'tankard', 'silver', 'Dedicated', 'Sign up for 15 events.', 'events', 15, 15, 45, ['f2']],
  ['f4', 'fellowship', 3, 1, 'banner', 'gold', 'Pillar of the Guild', 'Sign up for 40 events.', 'events', 40, 30, 120, ['f3']],
  ['f5', 'fellowship', 4, 1, 'trophy', 'crimson', 'Never Misses a Night', 'Sign up for 100 events.', 'events', 100, 50, 300, ['f4']],
  ['f6', 'fellowship', 0, 0, 'party', 'guild', 'Full Party', 'Five players signed up for one event.', 'bigEvent', 5, 20, 0, [], 'guild'],
  ['f7', 'fellowship', 1, 0, 'party', 'guild', 'Raid Ready', 'Ten players signed up for one event.', 'bigEvent', 10, 40, 0, ['f6'], 'guild'],
  ['f8', 'fellowship', 2, 0, 'tent', 'guild', 'Strength in Numbers', 'Five players have a character at level 40 or higher.', 'playersAt40', 5, 30, 0, ['f6'], 'guild'],
  ['f9', 'fellowship', 3, 0, 'crown', 'guild', 'The Whole Kitchen', 'Ten players have a character at level 60.', 'playersAt60', 10, 100, 0, ['f7', 'f8'], 'guild'],
  ['f10', 'fellowship', 1, 2, 'tankard', 'guild', 'Guild Hall Regular', 'Hold 25 guild events.', 'guildEvents', 25, 30, 0, [], 'guild'],

  // ---- Legend --------------------------------------------------------------------------------------------------------------------
  ['l1', 'legend', 2, 0, 'pot', 'crimson', 'Mannenkeuken Legend', 'Sixty Strong, Slayer, Artisan, Benefactor and Pillar of the Guild: the whole kitchen, one player.', 'requiredDone', 5, 100, 1000, ['j6', 's4', 'c4', 'd4', 'f4']],
];

export const ACHIEVEMENTS = rows.map(([id, branch, col, row, glyph, tier, title, desc, meter, target, points, hours, requires, scope]) => (
  { id, branch, col, row, glyph, tier, title, desc, meter, target, points, hours, requires, scope: scope ?? 'player' }));
export const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
// A guild goal may only require guild goals (it is the same for every player); checked here so a catalogue mistake shows up at once.
for (const a of ACHIEVEMENTS) {
  for (const r of a.requires) {
    if (!BY_ID.has(r)) throw new Error(`achievement ${a.id}: unknown requirement ${r}`);
    if (a.scope === 'guild' && BY_ID.get(r).scope !== 'guild') throw new Error(`guild goal ${a.id} requires the player achievement ${r}`);
  }
}

const GOLD = 10000; // copper per gold
export const fmtNum = (n) => Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 });

// Everything the meters need, read once.
export async function loadAchievementData() {
  const [{ characters }, blizzard] = await Promise.all([loadCharacters(), loadBlizzard()]);
  const read = async (table, cols, filter) => {
    if (!supabase) return [];
    try { let q = supabase.from(table).select(cols); if (filter) q = filter(q); return (await q).data ?? []; } catch { return []; }
  };
  const [donations, signups, events, bank, overrides] = await Promise.all([
    read('gold_donations', 'player_name,copper'),
    read('signups', 'event_id,author_name,answer', (q) => q.eq('answer', 'yes')),
    read('events', 'id,starts_at'),
    read('bank', 'guild_bank_bought'),
    read('achievement_overrides', '*'),
  ]);
  return { characters, blizzard, donations, signups, events, bank: bank[0] ?? null, overrides };
}

// What a player has reached, per meter.
export function playerMeters(data, player) {
  const cs = data.characters.filter((c) => c.player === player && c.status !== 'Gestopt');
  const levels = cs.map((c) => c.level).filter((l) => l > 0);
  const alts = cs.filter((c) => c.status === 'Alt').map((c) => c.level).filter((l) => l > 0);
  const profs = cs.flatMap((c) => c.profs.filter((p) => p.skill !== null));
  const primary = profs.filter((p) => !['Cooking', 'First Aid', 'Fishing'].includes(p.name));
  const game = gameTotals(cs, data.blizzard);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    maxLevel: levels.length ? Math.max(...levels) : 0,
    totalLevel: sum(levels),
    altBest: alts.length ? Math.max(...alts) : 0,
    altTotal: sum(alts),
    bestSkill: profs.length ? Math.max(...profs.map((p) => p.skill)) : 0,
    totalSkill: sum(profs.map((p) => p.skill)),
    profsAt75: primary.filter((p) => p.skill >= 75).length,
    profsAt150: primary.filter((p) => p.skill >= 150).length,
    profsAt225: primary.filter((p) => p.skill >= 225).length,
    kills: game.kills, quests: game.quests, deaths: game.deaths, fish: game.fish,
    donated: sum(data.donations.filter((d) => d.player_name === player).map((d) => d.copper)) / GOLD,
    events: data.signups.filter((s) => s.author_name === player).length,
  };
}

// What the guild has reached together (for the guild goals).
export function guildMeters(data, players) {
  const perPlayer = players.map((p) => playerMeters(data, p));
  const perEvent = new Map();
  for (const s of data.signups) perEvent.set(s.event_id, (perEvent.get(s.event_id) ?? 0) + 1);
  const now = Date.now();
  return {
    guildDonated: data.donations.reduce((a, d) => a + d.copper, 0) / GOLD,
    donors: new Set(data.donations.map((d) => d.player_name)).size,
    bankBought: data.bank?.guild_bank_bought ? 1 : 0,
    bigEvent: Math.max(0, ...perEvent.values()),
    guildEvents: data.events.filter((e) => new Date(e.starts_at).getTime() < now).length,
    playersAt40: perPlayer.filter((m) => m.maxLevel >= 40).length,
    playersAt60: perPlayer.filter((m) => m.maxLevel >= 60).length,
  };
}

// The developers' changes for one achievement and player. Row key: id|player (player '' = everyone / a guild goal).
function overrideFor(data, a, player) {
  const rowFor = (p) => data.overrides.find((o) => o.achievement_id === a.id && (o.player_name ?? '') === p);
  const all = rowFor('');
  const own = a.scope === 'guild' ? null : rowFor(player);
  const pick = own ?? all; // a player's own row wins over the "everyone" row for forced / value / baseline
  return { disabled: !!all?.disabled, forced: pick?.forced ?? null, manual: pick?.value ?? null, baseline: Number(pick?.baseline ?? 0), note: pick?.note ?? all?.note ?? null,
    updatedBy: (own ?? all)?.updated_by ?? null, updatedAt: (own ?? all)?.updated_at ?? null };
}

// State of every achievement for one player: { measured, value, target, pct, available, done, disabled, forced, ... }.
// ACHIEVEMENTS is ordered so that every requirement comes before the achievement that needs it.
export function evaluate(data, player, guild) {
  const mine = playerMeters(data, player);
  const states = new Map();
  for (const a of ACHIEVEMENTS) {
    const o = overrideFor(data, a, player);
    // A requirement that a developer switched off does not block the nodes behind it.
    const reqsOk = a.requires.every((r) => { const s = states.get(r); return s.done || s.disabled; });
    const target = a.meter === 'requiredDone' ? a.requires.length : a.target;
    const measured = a.meter === 'requiredDone' ? a.requires.filter((r) => states.get(r).done || states.get(r).disabled).length
      : (a.scope === 'guild' ? guild[a.meter] : mine[a.meter]) ?? 0;
    const value = o.manual !== null ? Number(o.manual) : Math.max(0, measured - (a.meter === 'requiredDone' ? 0 : o.baseline));
    const done = !o.disabled && (o.forced === 'unlocked' || (o.forced !== 'locked' && reqsOk && value >= target));
    states.set(a.id, { id: a.id, measured, value, target, pct: Math.max(0, Math.min(1, target ? value / target : 0)), available: !o.disabled && reqsOk, done,
      disabled: o.disabled, forced: o.forced, manual: o.manual, baseline: o.baseline, note: o.note, updatedBy: o.updatedBy, updatedAt: o.updatedAt });
  }
  return states;
}

// Points of a player (player achievements) and how many are done.
export function summarize(states) {
  let points = 0; let done = 0; let total = 0; let guildDone = 0; let guildTotal = 0;
  for (const a of ACHIEVEMENTS) {
    const s = states.get(a.id);
    if (s.disabled) continue;
    if (a.scope === 'guild') { guildTotal += 1; if (s.done) guildDone += 1; continue; }
    total += 1;
    if (s.done) { done += 1; points += a.points; }
  }
  return { points, done, total, guildDone, guildTotal };
}

// Developer changes. rows = [{ achievement_id, player_name, ...fields }]; upsert on (achievement_id, player_name).
export async function saveOverrides(rows, by) {
  if (!supabase) throw new Error('Not connected to the database.');
  const stamped = rows.map((r) => ({ player_name: '', ...r, updated_by: by, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('achievement_overrides').upsert(stamped, { onConflict: 'achievement_id,player_name' });
  if (error) throw new Error(error.message);
}
// Remove the developers' changes: for one player_name ('' = the "everyone" row), or all of them with '*'.
export async function clearOverrides(id, player = '*') {
  if (!supabase) throw new Error('Not connected to the database.');
  let q = supabase.from('achievement_overrides').delete().eq('achievement_id', id);
  if (player !== '*') q = q.eq('player_name', player);
  const { error } = await q;
  if (error) throw new Error(error.message);
}
export async function reloadOverrides() {
  if (!supabase) return [];
  try { return (await supabase.from('achievement_overrides').select('*')).data ?? []; } catch { return []; }
}
