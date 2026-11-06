// Reads character data (level, race, class, professions, last login, game statistics) from the Blizzard (Battle.net) API
// for every character of the guild and writes data/blizzard-characters.json.
// Which characters: the table characters plus the mains and alts on My profile (Supabase).
// Settings that change per game version (region, namespace, realm, name format) live in data/blizzard-config.json.
// Runs in GitHub Actions (see .github/workflows/update-characters.yml) or by hand. Node 20+, no dependencies.
//
//   node --env-file=<private .env> tools/update-characters.mjs                       full run, writes the data file
//   node --env-file=<private .env> tools/update-characters.mjs --dry-run             full run, only prints
//   node --env-file=<private .env> tools/update-characters.mjs --only "Markrutte:outland" --dry-run
//        only the given character(s), "Name:realm-slug" (comma separated); the realm part is optional
//
// Needs BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET (GitHub Actions secrets, or your private .env file).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG_FILE = 'data/blizzard-config.json';
const OUT = 'data/blizzard-characters.json';
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = flag('--dry-run');

const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET are not set (GitHub: Settings → Secrets and variables → Actions; locally: node --env-file=<your private .env> …).');
  process.exit(1);
}
const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
const { region, namespace, realm: defaultRealm, nameFormat = 'encode', delayMs = 150 } = config;
const api = `https://${region}.api.blizzard.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').trim().toLowerCase();

// "Bertrand Bakkebaard" -> how the API wants it in the URL: see nameFormat in the config.
// WoW: Forever ("realmless"): /profile/wow/character/<first>-<surname>, lowercase, no realm, in profile-forever-<region>.
// Public profiles exist from level 10, so a 404 there can simply mean "below level 10".
const realmless = nameFormat === 'realmless';
const nameForUrl = (name) => {
  const n = norm(name);
  if (nameFormat === 'hyphen' || realmless) return encodeURIComponent(n.replace(/\s+/g, '-'));
  if (nameFormat === 'nospace') return encodeURIComponent(n.replace(/\s+/g, ''));
  return encodeURIComponent(n);
};
const realmSlug = (r) => norm(r).replace(/['’]/g, '').replace(/\s+/g, '-');

// ---- 1. Which characters? -------------------------------------------------------------------------------
const publicSetting = (file, key) => readFileSync(file, 'utf8').match(new RegExp(`${key}\\s*=\\s*'([^']*)'`))?.[1];

async function guildCharacters() {
  const found = new Map(); // lowercase name -> { name, player }
  const add = (name, player) => { const n = String(name ?? '').trim(); if (n && !found.has(norm(n))) found.set(norm(n), { name: n, player: player || null }); };

  // Mains and alts saved on the dashboard (public read with the anon key, like the site does)
  try {
    const url = publicSetting('js/config.js', 'SUPABASE_URL');
    const key = publicSetting('js/config.js', 'SUPABASE_ANON_KEY');
    const main = await fetch(`${url}/rest/v1/characters?select=name,player_name&status=neq.Gestopt`, { headers: { apikey: key } });
    if (main.ok) for (const x of await main.json()) add(x.name, x.player_name);
    console.log(`Table: ${found.size} characters`);
    for (const [table, withPlayer] of [['profiles', true], ['alts', false]]) {
      const r = await fetch(`${url}/rest/v1/${table}?select=character_name${withPlayer ? ',player_name' : ''}`, { headers: { apikey: key } });
      if (r.ok) for (const x of await r.json()) add(x.character_name, x.player_name);
    }
    console.log(`With My profile: ${found.size} characters`);
  } catch (e) { console.warn(`Could not read the dashboard (${e.message}); continuing without it.`); }
  return [...found.values()];
}

let characters;
const only = option('--only');
if (only) {
  characters = only.split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [name, realm] = s.split(':'); return { name: name.trim(), realm: realm?.trim() || null, player: null }; });
  console.log(`Only: ${characters.map((c) => c.name).join(', ')}`);
} else {
  characters = await guildCharacters();
}
if (!characters.length) { console.error('No characters to look up.'); process.exit(1); }

// ---- 2. Token and calls ---------------------------------------------------------------------------------
const tokenRes = await fetch('https://oauth.battle.net/token', {
  method: 'POST',
  headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
if (!tokenRes.ok) { console.error(`Token request failed: ${tokenRes.status}. Check the Client ID and Secret.`); process.exit(1); }
const { access_token: token } = await tokenRes.json();

// One call, with a pause afterwards and a retry on "too many requests" (429) or server errors.
async function call(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${api}${path}${path.includes('?') ? '&' : '?'}namespace=${namespace}&locale=en_US`, { headers: { Authorization: `Bearer ${token}` } });
    await sleep(delayMs);
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || attempt * 2000;
      console.warn(`  HTTP ${res.status}, waiting ${Math.round(wait / 1000)}s (attempt ${attempt}/3)`);
      await sleep(wait);
      continue;
    }
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, body };
  }
  return { status: 0, body: null };
}

// Retail gives professions per expansion tier; Classic-style versions give one. Keep all tiers; the headline is the tier with the highest maximum (1-300 like on the site).
function professionList(body) {
  const one = (p, kind) => {
    const tiers = (p.tiers ?? []).map((t) => ({ name: t.tier?.name ?? null, skill: t.skill_points ?? 0, max: t.max_skill_points ?? 0 }));
    const best = [...tiers].sort((a, b) => b.max - a.max || b.skill - a.skill)[0];
    return { name: p.profession?.name ?? '?', kind, skill: best?.skill ?? null, max: best?.max ?? null, tiers };
  };
  return [...(body.primaries ?? []).map((p) => one(p, 'primary')), ...(body.secondaries ?? []).map((p) => one(p, 'secondary'))];
}

// Totals from the in-game statistics (/achievements/statistics; the ids are Blizzard's own). A statistic that is missing means 0: the API leaves out what never happened yet.
const GAME_STATS = { quests: 98, kills: 1197, deaths: 60, fish: 1518 };
function gameStats(body) {
  const list = (body.categories ?? []).flatMap((c) => [...(c.statistics ?? []), ...(c.sub_categories ?? []).flatMap((s) => s.statistics ?? [])]);
  return Object.fromEntries(Object.entries(GAME_STATS).map(([key, id]) => [key, list.find((s) => s.id === id)?.quantity ?? 0]));
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const result = {};
const now = new Date().toISOString();
const counts = { ok: 0, not_found: 0, error: 0 };

for (const ch of characters) {
  const key = norm(ch.name);
  const base = realmless ? `/profile/wow/character/${nameForUrl(ch.name)}` : `/profile/wow/character/${realmSlug(ch.realm || defaultRealm)}/${nameForUrl(ch.name)}`;
  const old = previous?.characters?.[key];
  const summary = await call(base);
  let entry;
  if (summary.status === 200) {
    const b = summary.body;
    const prof = await call(`${base}/professions`);
    const stats = await call(`${base}/achievements/statistics`);
    entry = {
      name: b.name ?? ch.name, status: 'ok', level: b.level ?? null, race: b.race?.name ?? null, class: b.character_class?.name ?? null,
      faction: b.faction?.name ?? null, guild: b.guild?.name ?? null,
      lastLogin: b.last_login_timestamp ? new Date(b.last_login_timestamp).toISOString() : null,
      professions: prof.status === 200 ? professionList(prof.body) : (old?.professions ?? []),
      stats: stats.status === 200 ? gameStats(stats.body) : (old?.stats ?? null),
    };
    counts.ok += 1;
  } else if (summary.status === 404) {
    // not (yet) known to the API: keep what we had before, but say so
    entry = { ...(old ?? { name: ch.name }), status: 'not_found' };
    counts.not_found += 1;
  } else {
    entry = { ...(old ?? { name: ch.name }), status: 'error', error: `HTTP ${summary.status}` };
    counts.error += 1;
  }
  if (entry.status === 'ok' || !old) entry.fetched = now; else entry.fetched = old.fetched ?? now;
  result[key] = entry;
  console.log(`${ch.name}: ${entry.status}${entry.status === 'ok' ? ` – level ${entry.level} ${entry.race} ${entry.class}, ${entry.professions.length} profession(s)` : entry.status === 'not_found' && realmless ? ' (not known yet: under level 10, or the name is spelled differently)' : ''}`);
  if (dryRun && entry.status === 'ok') console.log(`    last login ${entry.lastLogin}; ${entry.professions.map((p) => `${p.name} ${p.skill ?? '?'}/${p.max ?? '?'}`).join(', ') || 'no professions'}`);
}

console.log(`\nDone: ${counts.ok} ok, ${counts.not_found} not found, ${counts.error} errors (of ${characters.length}).`);

// ---- 3. Write (only when something changed, so the repo does not get a commit on every run) ---------------
const strip = (o) => JSON.stringify(o, (k, v) => (k === 'fetched' || k === 'updated' ? undefined : v));
const output = { source: 'Blizzard API', region, namespace, realm: defaultRealm, updated: now, characters: only ? { ...(previous?.characters ?? {}), ...result } : result };
if (dryRun) {
  console.log('\n--dry-run: nothing written. First entry as it would be stored:');
  console.log(JSON.stringify(Object.values(result)[0], null, 2));
} else if (previous && strip(previous) === strip(output)) {
  console.log(`${OUT} is unchanged.`);
} else {
  writeFileSync(OUT, `${JSON.stringify(output, null, 1)}\n`);
  console.log(`Written ${OUT}.`);
}
