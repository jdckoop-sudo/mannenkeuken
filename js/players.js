// Players and their characters, merged from the guild sheet (Members tab) and the site's profiles/alts.
// The sheet is leading for levels and professions; the site fills in what the sheet does not have.
import { supabase } from './supabase.js?v=__V__';
import { loadMembers } from './sheet.js?v=__V__';

export const SECONDARY = ['Cooking', 'First Aid', 'Fishing'];
const norm = (s) => String(s ?? '').trim().toLowerCase();
// "Skyborne (Horde)" (profile form) and "Skyborne" (sheet) are the same race.
export const baseRace = (r) => String(r ?? '').replace(/\s*\((Horde|Alliance)\)$/, '');
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

export const playerUrl = (name) => `player.html?name=${encodeURIComponent(name)}`;
export const characterUrl = (name) => `character.html?name=${encodeURIComponent(name)}`;

// Character data from the Blizzard API (data/blizzard-characters.json, filled by the "Update characters" workflow).
// null while that file does not exist yet. Entries are keyed by the lowercase character name.
let blizzardPromise = null;
export function loadBlizzard() {
  blizzardPromise ??= fetch('data/blizzard-characters.json?v=__V__').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return blizzardPromise;
}

// How active is a character? From the last login (data/blizzard-characters.json, lastLogin as ISO text).
// One place for the thresholds, so Roster, Home, player pages and checks all agree.
export const ACTIVITY = { activeDays: 3, quietDays: 14 };
// level: active | quiet | inactive | unknown (no login known: the file does not exist yet, or the character was not found)
export function activityOf(iso, now = new Date()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return { level: 'unknown', label: '–', title: 'Not known yet: appears when the game data is available', ts: null, days: null };
  const ms = Math.max(0, now.getTime() - t);
  const hours = ms / 3600e3;
  const days = ms / 86400e3;
  const label = hours < 1 ? 'Just now' : hours < 24 ? `${Math.floor(hours)} h ago` : `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago`;
  const level = days <= ACTIVITY.activeDays ? 'active' : days <= ACTIVITY.quietDays ? 'quiet' : 'inactive';
  const title = `Last login ${new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', hourCycle: 'h23', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (Dutch time)`;
  return { level, label, title, ts: t, days };
}

// players table: player_name (sheet column A) <-> discord_name
export async function loadPlayers() {
  if (!supabase) return [];
  const { data } = await supabase.from('players').select('*');
  return data ?? [];
}

// Which sheet player is logged in? (chosen in "Choose your player")
export function playerForUser(user) {
  return user?.player ?? null;
}

// All characters of the guild, one entry per character name.
export async function loadCharacters() {
  const [sheet, players, profilesRes, altsRes] = await Promise.all([
    loadMembers().catch(() => []),
    loadPlayers(),
    supabase ? supabase.from('profiles').select('*') : { data: [] },
    supabase ? supabase.from('alts').select('*') : { data: [] },
  ]);
  const profiles = profilesRes.data ?? [];
  const playerOfUser = new Map(profiles.map((p) => [p.user_id, p.player_name]));
  const byName = new Map();

  for (const m of sheet) {
    const name = m.character || `${m.player} (no name yet)`;
    const profs = [[m.prof1, m.skill1], [m.prof2, m.skill2], ['Cooking', m.cooking], ['First Aid', m.firstAid], ['Fishing', m.fishing]]
      .filter(([p]) => p).map(([p, s]) => ({ name: p, skill: num(s) })).filter((p) => !SECONDARY.includes(p.name) || p.skill !== null);
    byName.set(norm(name), {
      name, player: m.player, kind: m.status === 'Alt' ? 'Alt' : 'Main', status: m.status || 'Main',
      race: m.race, class: m.cls, role: m.role, level: num(m.level), profs, recipes: m.recipes, notes: m.notes, updated: m.updated,
      inSheet: true, onSite: false, hasName: !!m.character,
    });
  }
  const addSite = (row, kind) => {
    if (!row.character_name) return;
    const key = norm(row.character_name);
    const player = row.player_name ?? playerOfUser.get(row.user_id) ?? null;
    const existing = byName.get(key);
    if (existing) {
      existing.onSite = true;
      existing.race ||= baseRace(row.race); existing.class ||= row.class; existing.role ||= row.role;
      existing.player ||= player; existing.userId = row.user_id;
      return;
    }
    byName.set(key, {
      name: row.character_name, player, kind, status: kind, race: baseRace(row.race), class: row.class, role: row.role,
      level: null, profs: [], inSheet: false, onSite: true, hasName: true, userId: row.user_id,
    });
  };
  profiles.forEach((p) => addSite(p, 'Main'));
  (altsRes.data ?? []).forEach((a) => addSite(a, 'Alt'));
  return { characters: [...byName.values()], players, profiles };
}

// Summary numbers for a list of characters.
export function statsFor(chars) {
  const levels = chars.map((c) => c.level).filter((l) => l > 0);
  const profs = chars.flatMap((c) => c.profs.filter((p) => p.skill !== null));
  const best = profs.sort((a, b) => b.skill - a.skill)[0];
  return {
    characters: chars.length,
    totalLevel: levels.reduce((a, b) => a + b, 0),
    highestLevel: levels.length ? Math.max(...levels) : null,
    averageLevel: levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null,
    totalSkill: profs.reduce((a, p) => a + p.skill, 0),
    bestProfession: best ?? null,
  };
}
