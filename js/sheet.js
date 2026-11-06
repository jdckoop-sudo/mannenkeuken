import { SHEET_ID } from './config.js?v=__V__';
import { supabase } from './supabase.js?v=__V__';

// Characters come from the table characters (loadMembers); the Google Sheet is being phased out and is only the fallback.
// fetchMembers() reads the "Members" tab of the Google Sheet (must be shared as "Anyone with the link can view").
// Columns: A Player, B Character, C Race, D Class, E Role, F Level, G Prof 1, H Skill 1,
// I Prof 2, J Skill 2, K Cooking, L First Aid, M Fishing, N Key recipes, O Last updated (set automatically by the sheet's onEdit script), P Status, Q Notes.
// Character data from the Blizzard API: the tables blizzard_characters + blizzard_update, filled every 15 minutes by the Edge Function
// supabase/functions/update-characters. While those are empty or not there, the old file data/blizzard-characters.json is used.
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
  blizzardPromise ??= blizzardFromDatabase().then((data) => data ?? fetch('data/blizzard-characters.json?v=__V__').then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return blizzardPromise;
}

// The Blizzard API is leading, the sheet is the fallback (decided 5 Nov 2026):
//  - the API knows the character (status "ok"): level, race, class and the professions (with skill) come from the API.
//    The profession columns are replaced: other professions in the sheet are overwritten; Cooking / First Aid / Fishing that the API does not
//    report are emptied. If the API gave no professions at all (call failed, or none learned yet) the sheet's professions stay.
//  - the API does not know the character (not found: e.g. under level 10, or an error, or no data file yet): everything stays as typed in the sheet.
// Player, Role, Status, Notes and the key recipes always come from the sheet (the API has no such data).
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

// A row of the table characters in the shape the pages use. Empty values are '' (as they were from the sheet), the date is the Dutch day.
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
// null when the table cannot be read or is empty: then the sheet is used.
async function fetchCharacters() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('characters').select('*').order('created_at');
    return error || !data?.length ? null : data.map(memberFromCharacter);
  } catch { return null; }
}
// Where the rows came from: 'database' or 'sheet' (shown in developer mode → Checks).
let membersFrom = null;
export const membersSource = () => membersFrom;
async function fetchRows() {
  const rows = await fetchCharacters();
  membersFrom = rows ? 'database' : 'sheet';
  return rows ?? fetchMembers();
}

// One request per page load: everybody who asks shares it (Home used to fetch the sheet twice). A failed request is tried again next time.
let membersPromise = null;
export function loadMembers() {
  membersPromise ??= Promise.all([fetchRows(), loadBlizzard()]).then(async ([rows, blizzard]) => applyMainChoices(applyApi(rows, blizzard), membersFrom === 'database' ? [] : await fetchMainChoices())).catch((err) => { membersPromise = null; throw err; });
  return membersPromise.then((rows) => rows.map((r) => ({ ...r }))); // copies, so a page that sorts or edits its list leaves the others alone
}
// The main a player chose on My profile; only for the sheet fallback, in the table characters it is the Status (set_main_character() keeps both).
async function fetchMainChoices() {
  if (!supabase) return [];
  try { return (await supabase.from('main_characters').select('player_name,character_name')).data ?? []; } catch { return []; }
}
// Main / Alt per player. Characters that quit (Status Gestopt) and rows without a character name are left alone.
//  - 1 active character: that one is the main.
//  - 2 or more: the chosen main is Main and the others are Alt. No (valid) choice: the sheet's Status stays; if that does not name
//    exactly one main, the player's rows get needsMain = true (Home and My profile ask them to choose).
export function applyMainChoices(rows, choices) {
  const k = (s) => String(s ?? '').trim().toLowerCase();
  const groups = new Map();
  for (const r of rows) {
    if (!k(r.character) || r.status === 'Gestopt') continue;
    if (!groups.has(k(r.player))) groups.set(k(r.player), []);
    groups.get(k(r.player)).push(r);
  }
  for (const [player, list] of groups) {
    if (list.length === 1) { list[0].status = 'Main'; continue; }
    const choice = choices.find((c) => k(c.player_name) === player);
    const chosen = choice && list.find((r) => k(r.character) === k(choice.character_name));
    if (chosen) list.forEach((r) => { r.status = r === chosen ? 'Main' : 'Alt'; });
    else if (list.filter((r) => r.status === 'Main').length !== 1) list.forEach((r) => { r.needsMain = true; });
  }
  return rows;
}

export async function fetchMembers() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Members&range=A5:Q200&headers=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sheet not reachable');
  const rows = parseCsv(await res.text());
  return rows
    .filter((r) => r[0] && r[0].trim())
    .map((r) => ({
      player: r[0], character: r[1], race: r[2], cls: r[3], role: r[4], level: r[5],
      prof1: r[6], skill1: r[7], prof2: r[8], skill2: r[9],
      cooking: r[10], firstAid: r[11], fishing: r[12], recipes: r[13],
      updated: r[14], status: r[15] || 'Main', notes: r[16] ?? '',
    }));
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
