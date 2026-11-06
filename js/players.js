// Players and their characters, from the table characters (loadMembers).
// The sheet has the characters; for level, race, class and professions the Blizzard API leads where it knows the character (applyApi() in js/sheet.js); the site fills in what the sheet does not have.
import { supabase } from './supabase.js?v=__V__';
import { loadMembers } from './sheet.js?v=__V__';

export const SECONDARY = ['Cooking', 'First Aid', 'Fishing'];
// The sheet's Status column uses the Dutch value "Gestopt" (the sync and the code compare with it); the site shows it in English.
export const statusLabel = (status) => (status === 'Gestopt' ? 'Quit' : status);
const norm = (s) => String(s ?? '').trim().toLowerCase();
// "Skyborne (Horde)" (profile form) and "Skyborne" (sheet) are the same race.
export const baseRace = (r) => String(r ?? '').replace(/\s*\((Horde|Alliance)\)$/, '');
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

export const playerUrl = (name) => `player.html?name=${encodeURIComponent(name)}`;
export const characterUrl = (name) => `character.html?name=${encodeURIComponent(name)}`;

// Character data from the Blizzard API: loadBlizzard() lives in js/sheet.js (loadMembers() uses it to let the API lead); re-exported here.
export { loadBlizzard } from './sheet.js?v=__V__';

// How active is a character? From the last login (loadBlizzard(), lastLogin as ISO text).
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

// Totals from the game (quests, kills, deaths, fish) over a list of characters, from loadBlizzard(). The last known numbers keep counting when an
// update could not read a character. known = how many characters have numbers: characters show up from level 10.
export const GAME_STATS = [['quests', 'Quests completed'], ['kills', 'Kills'], ['deaths', 'Deaths'], ['fish', 'Fish caught']];
export function gameTotals(chars, blizzard) {
  const stats = chars.map((c) => blizzard?.characters?.[norm(c.name)]?.stats).filter(Boolean);
  const totals = { known: stats.length };
  for (const [key] of GAME_STATS) totals[key] = stats.reduce((sum, s) => sum + (s[key] ?? 0), 0);
  return totals;
}
// The four tiles, for inside a .grid.glance
export const gameStatTiles = (totals) => GAME_STATS.map(([key, label]) => `<div class="box stat"><span class="muted">${label}</span><strong>${totals.known ? totals[key].toLocaleString('en-GB') : '–'}</strong></div>`).join('');

// players table: player_name (sheet column A) <-> discord_name
export async function loadPlayers() {
  if (!supabase) return [];
  const { data } = await supabase.from('players').select('player_name,discord_name');
  return data ?? [];
}

// Which sheet player is logged in? (chosen in "Choose your player")
export function playerForUser(user) {
  return user?.player ?? null;
}

// All characters of the guild, one entry per character name.
export async function loadCharacters() {
  const [sheet, players] = await Promise.all([loadMembers().catch(() => []), loadPlayers()]);
  const byName = new Map();

  for (const m of sheet) {
    const name = m.character || `${m.player} (no name yet)`;
    const profs = [[m.prof1, m.skill1], [m.prof2, m.skill2], ['Cooking', m.cooking], ['First Aid', m.firstAid], ['Fishing', m.fishing]]
      .filter(([p]) => p).map(([p, s]) => ({ name: p, skill: num(s) })).filter((p) => !SECONDARY.includes(p.name) || p.skill !== null);
    byName.set(norm(name), {
      name, player: m.player, kind: m.status === 'Alt' ? 'Alt' : 'Main', status: m.status || 'Main',
      race: m.race, class: m.cls, role: m.role, level: num(m.level), profs, recipes: m.recipes, notes: m.notes, updated: m.updated,
      hasName: !!m.character, needsMain: !!m.needsMain, fromApi: !!m.fromApi,
    });
  }
  return { characters: [...byName.values()], players };
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
