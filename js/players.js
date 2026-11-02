// Players and their characters, merged from the guild sheet (Members tab) and the site's profiles/alts.
// The sheet is leading for levels and professions; the site fills in what the sheet does not have.
import { supabase, displayName } from './supabase.js?v=__V__';
import { loadMembers } from './sheet.js?v=__V__';

export const SECONDARY = ['Cooking', 'First Aid', 'Fishing'];
const norm = (s) => String(s ?? '').trim().toLowerCase();
// "Skyborne (Horde)" (profile form) and "Skyborne" (sheet) are the same race.
export const baseRace = (r) => String(r ?? '').replace(/\s*\((Horde|Alliance)\)$/, '');
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

export const playerUrl = (name) => `player.html?name=${encodeURIComponent(name)}`;
export const characterUrl = (name) => `character.html?name=${encodeURIComponent(name)}`;

// players table: player_name (sheet column A) <-> discord_name
export async function loadPlayers() {
  if (!supabase) return [];
  const { data } = await supabase.from('players').select('*');
  return data ?? [];
}

// Which sheet player is this Discord login? (by display name or username)
export function playerForUser(user, players) {
  if (!user) return null;
  const names = [displayName(user), user.user_metadata?.full_name, user.user_metadata?.name, user.user_metadata?.custom_claims?.global_name].map(norm).filter(Boolean);
  return players.find((p) => p.discord_name && names.includes(norm(p.discord_name)))?.player_name ?? null;
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
