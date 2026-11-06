// Supabase Edge Function "update-characters": reads the characters of the guild from the Blizzard API and stores them in the
// tables blizzard_characters + blizzard_update. Started every 15 minutes by pg_cron (see supabase/schema.sql); the site reads the
// tables with loadBlizzard() in js/sheet.js, so new data needs no commit and no deploy.
//
// Setup and how to check it: docs/instructies.md, "Update characters: elke 15 minuten".
// Function secrets (Edge Functions → Secrets), never in the repo:
//   BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET   the Battle.net client
//   UPDATE_CHARACTERS_SECRET                     long random text; the caller sends it as header x-update-secret
// Supabase provides SUPABASE_URL and the service key itself. "Enforce JWT verification" must be off: pg_cron has no user login,
// the secret above is what protects this function.
//
// POST body (optional): {"dryRun": true} looks everything up and answers with the result, but writes nothing.
//
// WoW: Forever: no realms; /profile/wow/character/<first>-<surname> in profile-forever-<region>. Public profiles exist from level 10,
// so a 404 can simply mean "below level 10". Blizzard refreshes a character after it logs out.
const REGION = 'eu';
const NAMESPACE = `profile-forever-${REGION}`;
const DELAY_MS = 100;
const TIME_BUDGET_MS = 120000; // stop in time: a function may run about 150 seconds

const env = (name) => Deno.env.get(name) ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').trim().toLowerCase();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// The service key: the classic SUPABASE_SERVICE_ROLE_KEY, or the default of the newer SUPABASE_SECRET_KEYS.
function serviceKey() {
  if (env('SUPABASE_SERVICE_ROLE_KEY')) return env('SUPABASE_SERVICE_ROLE_KEY');
  try { return JSON.parse(env('SUPABASE_SECRET_KEYS')).default ?? ''; } catch { return ''; }
}
// Database through the REST API (plain fetch: no dependencies). A classic key is a JWT and also goes in Authorization; a new sb_secret key does not.
async function db(path, options = {}) {
  const key = serviceKey();
  const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...(options.headers ?? {}) };
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`Database ${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Which characters? The table characters, without the ones with Status Gestopt.
// complete = false when a source could not be read: then no rows may be removed from the table.
async function guildCharacters() {
  const found = new Map();
  const add = (name) => { const n = String(name ?? '').trim(); if (n && !found.has(norm(n))) found.set(norm(n), n); };
  let complete = true;
  try {
    for (const x of await db('characters?select=name&status=neq.Gestopt')) add(x.name);
  } catch (e) { complete = false; console.warn(`Could not read the table characters: ${e.message}`); }
  return { names: [...found.values()], complete };
}

// The character pictures: {avatar, inset, main, ...}. Null when the game has none.
function pictures(body) {
  const list = (body.assets ?? []).filter((a) => a.key && /^https:\/\//.test(a.value ?? ''));
  return list.length ? Object.fromEntries(list.map((a) => [a.key, a.value])) : null;
}

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

async function run(dryRun) {
  const started = Date.now();
  const tokenRes = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env('BLIZZARD_CLIENT_ID')}:${env('BLIZZARD_CLIENT_SECRET')}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) throw new Error(`Blizzard token: HTTP ${tokenRes.status}. Check BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.`);
  const { access_token: token } = await tokenRes.json();

  // One call, with a pause afterwards and a retry on "too many requests" (429) or server errors.
  const call = async (path) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://${REGION}.api.blizzard.com${path}?namespace=${NAMESPACE}&locale=en_US`, { headers: { Authorization: `Bearer ${token}` } });
      await sleep(DELAY_MS);
      if (res.status === 429 || res.status >= 500) { await sleep(Number(res.headers.get('retry-after')) * 1000 || attempt * 1000); continue; }
      let body = null;
      try { body = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, body };
    }
    return { status: 0, body: null };
  };

  const { names, complete: listComplete } = await guildCharacters();
  if (!names.length) throw new Error('No characters to look up (the tables could not be read, or are empty).');
  const oldRows = await db('blizzard_characters?select=key,data');
  const previous = new Map(oldRows.map((r) => [r.key, r.data]));

  const now = new Date().toISOString();
  const rows = [];
  const counts = { ok: 0, notFound: 0, errors: 0 };
  let complete = listComplete;
  for (const name of names) {
    if (Date.now() - started > TIME_BUDGET_MS) { complete = false; console.warn(`Out of time, stopped before ${name}`); break; }
    const key = norm(name);
    const old = previous.get(key);
    const base = `/profile/wow/character/${encodeURIComponent(key.replace(/\s+/g, '-'))}`;
    const summary = await call(base);
    let entry;
    if (summary.status === 200) {
      const b = summary.body;
      const prof = await call(`${base}/professions`);
      const stats = await call(`${base}/achievements/statistics`);
      const media = await call(`${base}/character-media`);
      entry = {
        name: b.name ?? name, status: 'ok', level: b.level ?? null, race: b.race?.name ?? null, class: b.character_class?.name ?? null,
        faction: b.faction?.name ?? null, guild: b.guild?.name ?? null,
        lastLogin: b.last_login_timestamp ? new Date(b.last_login_timestamp).toISOString() : null,
        professions: prof.status === 200 ? professionList(prof.body) : (old?.professions ?? []),
        stats: stats.status === 200 ? gameStats(stats.body) : (old?.stats ?? null),
        media: media.status === 200 ? pictures(media.body) : (old?.media ?? null),
        fetched: now,
      };
      counts.ok += 1;
    } else if (summary.status === 404) {
      entry = { ...(old ?? { name }), status: 'not_found', fetched: old?.fetched ?? now }; // not (yet) known: keep what we had, but say so
      counts.notFound += 1;
    } else {
      entry = { ...(old ?? { name }), status: 'error', error: `HTTP ${summary.status}`, fetched: old?.fetched ?? now };
      counts.errors += 1;
    }
    rows.push({ key, data: entry, updated_at: now });
  }

  // Characters that are no longer in the guild lists; only when every list was read and every character was looked up.
  const current = new Set(rows.map((r) => r.key));
  const remove = complete ? [...previous.keys()].filter((k) => !current.has(k)) : [];
  const message = complete ? null : 'Not complete: see the function logs.';
  const result = { dryRun, characters: names.length, ...counts, removed: remove.length, complete, seconds: Math.round((Date.now() - started) / 1000) };
  if (dryRun) return { ...result, rows: rows.map((r) => ({ key: r.key, status: r.data.status, level: r.data.level ?? null, media: r.data.media ?? null })) };

  await db('blizzard_characters?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  for (const k of remove) await db(`blizzard_characters?key=eq.${encodeURIComponent(k)}`, { method: 'DELETE' });
  await saveStatus({ updated_at: now, ok: counts.ok, not_found: counts.notFound, errors: counts.errors, message });
  return result;
}

const saveStatus = (row) => db('blizzard_update?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id: 1, ...row }]) });

Deno.serve(async (req) => {
  const secret = env('UPDATE_CHARACTERS_SECRET');
  if (!secret || req.headers.get('x-update-secret') !== secret) return json({ error: 'Not allowed' }, 401);
  let dryRun = false;
  try { dryRun = (await req.json())?.dryRun === true; } catch { /* no body */ }
  try {
    const result = await run(dryRun);
    console.log(JSON.stringify({ ...result, rows: undefined }));
    return json(result);
  } catch (e) {
    console.error(e.message);
    // Keep updated_at as it was: the developer page then shows how old the data really is, plus this message.
    if (!dryRun) { try { await saveStatus({ message: String(e.message).slice(0, 500) }); } catch { /* database not reachable */ } }
    return json({ error: e.message }, 500);
  }
});
