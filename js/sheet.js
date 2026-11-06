import { supabase } from './supabase.js?v=__V__';

// Characters (table characters) and the data from the game (Blizzard API). The file keeps its old name: nearly every page imports it.
// Character data from the Blizzard API: the tables blizzard_characters + blizzard_update, filled every 15 minutes by the Edge Function
// supabase/functions/update-characters.
// Result: { source, updated, ok, notFound, errors, message, characters }, or null when there is no data. Entries are keyed by the lowercase character name.
async function blizzardFromDatabase() {
  if (!supabase) return null;
  try {
    const [{ data: rows, error }, { data: run }] = await Promise.all([
      supabase.from('blizzard_characters').select('key,data'),
      supabase.from('blizzard_update').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (error || !rows?.length) return null;
    return { source: 'database', updated: run?.updated_at ?? null, ok: run?.ok ?? null, notFound: run?.not_found ?? null, errors: run?.errors ?? null, message: run?.message ?? null, characters: Object.fromEntries(rows.map((r) => [r.key, r.data])) };
  } catch { return null; }
}
let blizzardPromise = null;
export function loadBlizzard() {
  blizzardPromise ??= blizzardFromDatabase();
  return blizzardPromise;
}

// The Blizzard API is leading, the table characters is the fallback (decided 5 Nov 2026):
//  - the API knows the character (status "ok"): level, race, class and the professions (with skill) come from the API.
//    The professions are replaced: other professions in the table are overwritten on the site; Cooking / First Aid / Fishing that the API does not
//    report are emptied. If the API gave no professions at all (call failed, or none learned yet) the table's professions stay.
//  - the API does not know the character (not found: e.g. under level 10, or an error): everything stays as in the table.
// Player, Role, Status, Notes and the key recipes always come from the table (the API has no such data).
export function applyApi(rows, blizzard) {
  const entries = blizzard?.characters;
  if (!entries) return rows;
  for (const r of rows) {
    const e = entries[String(r.character ?? '').trim().toLowerCase()];
    if (!e || e.status !== 'ok') continue;
    r.fromApi = true;
    if (e.level != null) r.level = e.level;
    if (e.race) r.race = e.race;
    if (e.class) r.cls = e.class;
    const profs = (e.professions ?? []).filter((p) => p.skill !== null && p.skill !== undefined);
    if (!profs.length) continue;
    const primaries = profs.filter((p) => p.kind === 'primary');
    const [p1, p2] = primaries;
    r.prof1 = p1?.name ?? ''; r.skill1 = p1?.skill ?? '';
    r.prof2 = p2?.name ?? ''; r.skill2 = p2?.skill ?? '';
    for (const [field, name] of [['cooking', 'Cooking'], ['firstAid', 'First Aid'], ['fishing', 'Fishing']]) {
      const p = profs.find((x) => x.name === name);
      r[field] = p ? p.skill : '';
    }
  }
  return rows;
}

// A row of the table characters in the shape the pages use. Empty values are '', the date is the Dutch day.
export function memberFromCharacter(c) {
  const profs = c.professions ?? [];
  const [p1, p2] = profs.filter((p) => p.kind === 'primary');
  const secondary = (name) => profs.find((p) => p.name === name)?.skill ?? '';
  return {
    player: c.player_name, character: c.name, race: c.race ?? '', cls: c.class ?? '', role: c.role ?? '', level: c.level ?? '',
    prof1: p1?.name ?? '', skill1: p1?.skill ?? '', prof2: p2?.name ?? '', skill2: p2?.skill ?? '',
    cooking: secondary('Cooking'), firstAid: secondary('First Aid'), fishing: secondary('Fishing'), recipes: c.recipes ?? '',
    updated: c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB', { timeZone: 'Europe/Amsterdam' }).replace(/\//g, '-') : '',
    status: c.status || 'Main', notes: c.notes ?? '',
  };
}
async function fetchCharacters() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('characters').select('*').order('created_at');
  if (error) throw new Error('Could not read the characters');
  return (data ?? []).map(memberFromCharacter);
}

// One request per page load: everybody who asks shares it. A failed request is tried again next time.
let membersPromise = null;
export function loadMembers() {
  membersPromise ??= Promise.all([fetchCharacters(), loadBlizzard()]).then(([rows, blizzard]) => applyMainRule(applyApi(rows, blizzard))).catch((err) => { membersPromise = null; throw err; });
  return membersPromise.then((rows) => rows.map((r) => ({ ...r }))); // copies, so a page that sorts or edits its list leaves the others alone
}
// Main / Alt per player. Characters that quit (Status Gestopt) are left alone.
//  - 1 active character: that one is the main.
//  - 2 or more without exactly one Main: the player's rows get needsMain = true (Home and My profile ask them to choose).
export function applyMainRule(rows) {
  const k = (s) => String(s ?? '').trim().toLowerCase();
  const groups = new Map();
  for (const r of rows) {
    if (!k(r.character) || r.status === 'Gestopt') continue;
    if (!groups.has(k(r.player))) groups.set(k(r.player), []);
    groups.get(k(r.player)).push(r);
  }
  for (const list of groups.values()) {
    if (list.length === 1) list[0].status = 'Main';
    else if (list.filter((r) => r.status === 'Main').length !== 1) list.forEach((r) => { r.needsMain = true; });
  }
  return rows;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
