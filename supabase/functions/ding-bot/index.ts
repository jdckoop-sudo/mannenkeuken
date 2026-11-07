// Supabase Edge Function "ding-bot" (the bot in Discord is called Ding Dinky): posts a "Ding!" in the Discord channel #dings when a player's character has gone up a level or a player
// (or the whole guild) has earned an achievement of the dashboard. Started every 5 minutes by pg_cron (see supabase/schema.sql), a few
// minutes after update-characters, because the level only changes after the character has logged out.
//
// Setup and how to check it: docs/instructies.md, "Ding-bot".
// Function secrets (Edge Functions → Secrets), never in the repo:
//   DING_WEBHOOK_URL            the webhook of the channel #dings (Channel settings → Integrations → Webhooks)
//   UPDATE_CHARACTERS_SECRET    the same long random text that update-characters uses; the caller sends it as header x-update-secret
// Supabase provides SUPABASE_URL and the service key itself. "Enforce JWT verification" must be off (pg_cron has no user login).
//
// The rules (all of them in plan() below, which has no network calls and is tested in tools/test-ding-bot.mjs):
//  - The first run only looks: the current levels and achievements are the starting point and are NOT announced.
//  - A character or a player that is new in the data is also only looked at the first time (a new person would otherwise get everything at once).
//  - Everything that happened to one player in one run goes into ONE message: level ups of all his characters and all new achievements.
//  - A guild goal is announced once for the whole guild, with @everyone, not per player.
//  - Only what has been posted is remembered: when Discord refuses a message the same news comes back in the next run.
//
// The achievement rules are not written here: they are in achievements-core.js next to this file, an exact copy of js/achievements-core.js of the site
// (tools/test-ding-bot.mjs fails when the two differ). Supabase can neither load a module from the internet while the function runs nor fetch one
// when it is deployed, so after a new or changed achievement: copy the file again and deploy this function again (both files in the editor).
//
// POST body (optional): {"test": true} posts one hello message to check the webhook. {"dryRun": true} works out what would be posted and answers with it, but posts and writes nothing.
import * as core from './achievements-core.js';
const SITE = 'https://jdckoop-sudo.github.io/mannenkeuken';
const COLOR = 0xe8c15a;

const env = (name) => Deno.env.get(name) ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').trim().toLowerCase();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const num = (v) => { const n = Number(v); return v === null || v === undefined || v === '' || Number.isNaN(n) ? null : n; };
const fmt = (n) => Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 });

function serviceKey() {
  if (env('SUPABASE_SERVICE_ROLE_KEY')) return env('SUPABASE_SERVICE_ROLE_KEY');
  try { return JSON.parse(env('SUPABASE_SECRET_KEYS')).default ?? ''; } catch { return ''; }
}
async function db(path, options = {}) {
  const key = serviceKey();
  const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...(options.headers ?? {}) };
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`Database ${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const upsert = (table, rows, onConflict) => rows.length ? db(`${table}?on_conflict=${onConflict}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }) : null;

// ---- the data in the shape the achievement logic wants (the same as the site makes of it: loadMembers + applyApi in js/sheet.js)
const SECONDARY = ['Cooking', 'First Aid', 'Fishing'];
export function characterFrom(row, api) {
  const known = api && api.status === 'ok';
  const apiProfs = known ? (api.professions ?? []).filter((p) => p.skill !== null && p.skill !== undefined) : [];
  const source = apiProfs.length ? apiProfs : (row.professions ?? []);
  const primaries = source.filter((p) => p.kind === 'primary').slice(0, 2);
  const profs = [...primaries, ...SECONDARY.map((n) => source.find((p) => p.name === n)).filter(Boolean)]
    .map((p) => ({ name: p.name, skill: num(p.skill) })).filter((p) => !SECONDARY.includes(p.name) || p.skill !== null);
  const level = known && api.level != null ? api.level : num(row.level);
  return { name: row.name, player: row.player_name, status: row.status || 'Main', level, profs, race: known && api.race ? api.race : row.race, class: known && api.class ? api.class : row.class };
}
const GAME_KEYS = ['quests', 'kills', 'deaths', 'fish'];
export function gameTotalsFrom(blizzard) {
  return (chars) => {
    const stats = chars.map((c) => blizzard[norm(c.name)]?.stats).filter(Boolean);
    const totals = { known: stats.length };
    for (const k of GAME_KEYS) totals[k] = stats.reduce((sum, s) => sum + (s[k] ?? 0), 0);
    return totals;
  };
}

// ---- what to post. Pure: gets everything it needs, returns messages and what to remember when they are posted.
// prev = { levels: Map(key -> level), known: Set("player|id"), players: Set(player) }, discord = Map(player -> id)
export function plan({ core, chars, states, prev, discord }) {
  const { BY_ID, BRANCHES, METERS } = core;
  const branchName = (k) => BRANCHES.find((b) => b.key === k)?.name ?? 'Legend';
  const active = chars.filter((c) => c.player && c.status !== 'Gestopt');
  const players = [...new Set(active.map((c) => c.player))];
  const messages = []; // { kind, player, level: [...], achievements: [...], commit: { levels, known, players } }
  const baseline = { levels: [], known: [], players: [] }; // remembered without posting

  // levels
  const gains = new Map(); const newLevels = [];
  for (const c of active) {
    if (!(c.level > 0)) continue;
    const key = norm(c.name); const before = prev.levels.get(key);
    if (before === undefined) { baseline.levels.push({ key, name: c.name, player: c.player, level: c.level }); continue; }
    if (c.level > before) { if (!gains.has(c.player)) gains.set(c.player, []); gains.get(c.player).push({ name: c.name, from: before, to: c.level, key }); }
  }

  // achievements of players
  const earned = new Map();
  for (const p of players) {
    const st = states.get(p); const done = [...st.values()].filter((s) => s.done && BY_ID.get(s.id).scope !== 'guild').map((s) => s.id);
    if (!prev.players.has(p)) { baseline.players.push(p); for (const id of done) baseline.known.push({ player: p, id }); continue; }
    const fresh = done.filter((id) => !prev.known.has(`${p}|${id}`));
    if (fresh.length) earned.set(p, fresh.map((id) => ({ a: BY_ID.get(id), s: st.get(id) })));
  }

  // guild goals (the same for everybody: take them from the first player)
  let guildGoals = [];
  if (players.length) {
    const st = states.get(players[0]); const done = [...st.values()].filter((s) => s.done && BY_ID.get(s.id).scope === 'guild').map((s) => s.id);
    if (!prev.players.has('')) { baseline.players.push(''); for (const id of done) baseline.known.push({ player: '', id }); }
    else guildGoals = done.filter((id) => !prev.known.has(`|${id}`)).map((id) => ({ a: BY_ID.get(id), s: st.get(id) }));
  }

  // one message per player
  for (const p of new Set([...gains.keys(), ...earned.keys()])) {
    const lv = gains.get(p) ?? []; const ach = earned.get(p) ?? []; const id = discord.get(p);
    const lines = [];
    for (const g of lv) { const n = g.to - g.from; lines.push(`⬆️ **${g.name}** gained ${n} ${n === 1 ? 'level' : 'levels'} and is now **level ${g.to}** (was level ${g.from})`); }
    for (const { a, s } of ach) {
      const now = a.meter === 'requiredDone' ? '' : ` · now: ${fmt(s.value)} ${METERS[a.meter] ?? ''}`.trimEnd();
      lines.push(`🏆 **${a.title}** (${branchName(a.branch)}) — ${a.desc}${now}`);
    }
    const ids = ach.map(({ a }) => a.id);
    const link = ach.length ? `${SITE}/achievements.html?a=${ids.join(',')}&p=${encodeURIComponent(p)}` : `${SITE}/character.html?name=${encodeURIComponent(lv[0].name)}`;
    const points = ach.reduce((n, { a }) => n + a.points, 0);
    messages.push({
      kind: 'player', player: p, discordId: id ?? null,
      content: `${id ? `<@${id}>` : `**${p}**`} Ding! 🔔`,
      embed: { color: COLOR, title: ach.length ? 'New achievement' + (ach.length > 1 ? 's' : '') : 'Level up', url: link, description: lines.join('\n'),
        fields: [{ name: '​', value: `[View it on the dashboard](${link})${points ? ` · +${points} points` : ''}` }] },
      allowed: id ? { users: [id] } : { parse: [] },
      commit: { levels: lv.map((g) => ({ key: g.key, level: g.to })), known: ach.map(({ a }) => ({ player: p, id: a.id })), summary: lines.join(' | ') },
    });
  }
  if (guildGoals.length) {
    const link = `${SITE}/achievements.html?a=${guildGoals.map(({ a }) => a.id).join(',')}`;
    const lines = guildGoals.map(({ a, s }) => `🏆 **${a.title}** — ${a.desc}${a.meter === 'requiredDone' ? '' : ` · now: ${fmt(s.value)} ${METERS[a.meter] ?? ''}`.trimEnd()}`);
    messages.push({
      kind: 'guild', player: '', discordId: null,
      content: '@everyone Ding! The whole guild has reached something 🎉',
      embed: { color: COLOR, title: 'Guild goal' + (guildGoals.length > 1 ? 's' : '') + ' reached', url: link, description: lines.join('\n'), fields: [{ name: '​', value: `[View it on the dashboard](${link})` }] },
      allowed: { parse: ['everyone'] },
      commit: { levels: [], known: guildGoals.map(({ a }) => ({ player: '', id: a.id })), summary: lines.join(' | ') },
    });
  }
  // the levels of everybody that has no news are kept up to date too (when a level goes down, the highest one stays)
  const seen = new Set(messages.flatMap((m) => m.commit.levels.map((l) => l.key)));
  return { messages, baseline, players, quiet: active.filter((c) => c.level > 0 && !seen.has(norm(c.name)) && prev.levels.has(norm(c.name))) };
}

// ---- Discord
async function post(webhook, m) {
  const body = { username: 'Ding Dinky', content: m.content, embeds: [{ ...m.embed, footer: { text: 'Mannenkeuken · Ding Dinky' }, timestamp: new Date().toISOString() }], allowed_mentions: m.allowed };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${webhook}${webhook.includes('?') ? '&' : '?'}wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 429) { const wait = Number((await res.json().catch(() => ({}))).retry_after ?? 1); await sleep(Math.min(5, wait) * 1000 + 100); continue; }
    if (!res.ok) throw new Error(`Discord: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return;
  }
  throw new Error('Discord: still rate limited after 3 tries');
}

// ---- the run
async function run(dryRun) {
  const [rows, blizzardRows, donations, overrides, playerRows, levelRows, knownRows, doneRows] = await Promise.all([
    db('characters?select=name,player_name,race,class,level,professions,status'),
    db('blizzard_characters?select=key,data'),
    db('gold_donations?select=player_name,copper'),
    db('achievement_overrides?select=*'),
    db('players?select=player_name,discord_id'),
    db('ding_levels?select=character_key,level'),
    db('ding_known?select=player_name,achievement_id'),
    db('ding_players?select=player_name'),
  ]);
  const blizzard = Object.fromEntries(blizzardRows.map((r) => [r.key, r.data]));
  const chars = rows.map((r) => characterFrom(r, blizzard[norm(r.name)]));
  const data = { characters: chars, blizzard, donations, overrides, gameTotals: gameTotalsFrom(blizzard) };
  const players = [...new Set(chars.filter((c) => c.player && c.status !== 'Gestopt').map((c) => c.player))];
  const guild = core.guildMeters(data, players);
  const states = new Map(players.map((p) => [p, core.evaluate(data, p, guild)]));
  const prev = { levels: new Map(levelRows.map((r) => [r.character_key, r.level])), known: new Set(knownRows.map((r) => `${r.player_name}|${r.achievement_id}`)), players: new Set(doneRows.map((r) => r.player_name)) };
  const discord = new Map(playerRows.filter((p) => p.discord_id).map((p) => [p.player_name, p.discord_id]));
  const result = plan({ core, chars, states, prev, discord });
  const first = prev.players.size === 0 && prev.levels.size === 0;
  const out = { first, baselined: { characters: result.baseline.levels.length, players: result.baseline.players.length }, messages: result.messages.map((m) => ({ kind: m.kind, player: m.player, content: m.content, description: m.embed.description })), posted: 0 };
  if (dryRun) return out;

  const now = new Date().toISOString();
  // remembered without posting: the starting point and everybody that is new
  await upsert('ding_levels', [...result.baseline.levels.map((l) => ({ character_key: l.key, character_name: l.name, player_name: l.player, level: l.level, updated_at: now }))], 'character_key');
  await upsert('ding_players', result.baseline.players.map((p) => ({ player_name: p })), 'player_name');
  await upsert('ding_known', result.baseline.known.map((k) => ({ player_name: k.player, achievement_id: k.id })), 'player_name,achievement_id');
  // a level that went down (a glitch) is not written: the highest one stays
  const webhook = env('DING_WEBHOOK_URL');
  let error = null;
  if (result.messages.length && !webhook) error = 'DING_WEBHOOK_URL is not set: the news is kept until it is';
  else {
    for (const m of result.messages) {
      try {
        await post(webhook, m);
        await upsert('ding_levels', m.commit.levels.map((l) => ({ character_key: l.key, level: l.level, updated_at: now })), 'character_key');
        await upsert('ding_known', m.commit.known.map((k) => ({ player_name: k.player, achievement_id: k.id })), 'player_name,achievement_id');
        await db('ding_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: m.kind, player_name: m.player, summary: m.commit.summary }) });
        out.posted += 1;
        await sleep(800);
      } catch (e) { error = e.message; console.warn(error); break; }
    }
  }
  await upsert('ding_status', [{ id: 1, last_run_at: now, posted: out.posted, message: error, ...(first ? { activated_at: now } : {}) }], 'id');
  return { ...out, error };
}

Deno.serve(async (req) => {
  const secret = env('UPDATE_CHARACTERS_SECRET');
  if (!secret || req.headers.get('x-update-secret') !== secret) return json({ error: 'forbidden' }, 403);
  let dryRun = false; let test = false;
  try { const body = await req.json(); dryRun = !!body.dryRun; test = !!body.test; } catch { /* no body */ }
  // {"test": true}: posts one hello message in the channel to check the webhook, and nothing else (no state is read or written)
  if (test) {
    try {
      await post(env('DING_WEBHOOK_URL'), { content: 'Ding! \uD83D\uDD14 Ding Dinky is on.', embed: { color: COLOR, title: 'Test', description: 'If you can see this, the webhook works. Level ups and achievements will show up here from now on.' }, allowed: { parse: [] } });
      return json({ test: 'posted' });
    } catch (e) { return json({ test: 'failed', error: String(e.message ?? e) }, 500); }
  }
  try { return json(await run(dryRun)); } catch (e) { console.error(e); return json({ error: String(e.message ?? e) }, 500); }
});
