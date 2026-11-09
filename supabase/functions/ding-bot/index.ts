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
//  - Everything that happened to one player in one run goes into ONE message, written as a session recap ("<player> achieved this session:"): level ups, quests, kills,
//    deaths, campfires, XP and profession skill gains of his characters since the previous run, plus all new achievements. The recap is only posted when there is a level up or an achievement;
//    the quests, kills, deaths, campfires, XP and skills are remembered per character in ding_levels (columns quests, kills, deaths, camps, xp, skills, gear) and are only compared when the game knows the character.
//  - A guild goal is announced once for the whole guild, with @everyone, not per player.
//  - Dag Dinky (every night from 00:07 Dutch time) and Week Dinky (Mondays, same run) summarise the stats of ALL players in one message with @everyone, see planPeriod().
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
  const skills = known && apiProfs.length ? Object.fromEntries(apiProfs.map((p) => [p.name, num(p.skill)]).filter(([, v]) => v !== null)) : null;
  return { name: row.name, player: row.player_name, status: row.status || 'Main', level, profs, stats: known ? (api.stats ?? null) : null, xp: known ? num(api.xp) : null, skills, gear: known && Array.isArray(api.equipment) && api.equipment.length ? api.equipment.filter((e) => e && e.id).map((e) => ({ id: e.id, name: e.name })) : null, race: known && api.race ? api.race : row.race, class: known && api.class ? api.class : row.class };
}
// XP needed to go from level n to n + 1 (index 0 = level 1), the Classic table. The API gives only the XP inside the current level (`experience`),
// so the XP of a whole session = the XP of the levels completed in between + the difference inside the level.
export const XP_TO_NEXT = [400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400, 12900, 14400, 16000, 17700, 19400, 21300, 23200, 25200, 27300, 29400, 31700, 34000, 36400, 38900, 41400, 44300, 47400, 50800, 54500, 58600, 62800, 67100, 71600, 76100, 80800, 85700, 90700, 95800, 101000, 106300, 111800, 117500, 123200, 129100, 135100, 141200, 147500, 153900, 160400, 167100, 173900, 180800, 187900, 195000, 202300, 209800];
export const totalXp = (level, xp) => (level == null || xp == null ? null : XP_TO_NEXT.slice(0, Math.max(0, Math.min(level, XP_TO_NEXT.length + 1) - 1)).reduce((a, b) => a + b, 0) + xp);
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
// prev = { levels: Map(key -> level), snaps: Map(key -> { quests, kills, deaths, camps, xp (total XP), skills, gear: [item ids] }), known: Set("player|id"), players: Set(player) }, discord = Map(player -> id)
export function plan({ core, chars, states, prev, discord }) {
  const { BY_ID, BRANCHES, METERS } = core;
  const branchName = (k) => BRANCHES.find((b) => b.key === k)?.name ?? 'Legend';
  const active = chars.filter((c) => c.player && c.status !== 'Gestopt');
  const players = [...new Set(active.map((c) => c.player))];
  const messages = []; // { kind, player, level: [...], achievements: [...], commit: { levels, known, players } }
  const baseline = { levels: [], known: [], players: [] }; // remembered without posting
  const snaps = prev.snaps ?? new Map();
  // what the game says now about one character (null when the game does not know it: then nothing is compared or remembered)
  // skills and gear that the game did not give this time (a failed call) keep the earlier values, so one bad run does not wipe the starting point
  const snapOf = (c) => { const old = snaps.get(norm(c.name)); return c.stats ? { quests: num(c.stats.quests) ?? 0, kills: num(c.stats.kills) ?? 0, deaths: num(c.stats.deaths) ?? 0, camps: num(c.stats.camps) ?? old?.camps ?? null, xp: totalXp(c.level, c.xp) ?? old?.xp ?? null, skills: c.skills ?? old?.skills ?? null, gear: c.gear ? c.gear.map((g) => g.id) : (old?.gear ?? null) } : null; };
  // what a character did since the previous run (only when both runs have numbers)
  const sessionOf = (c) => {
    const now = snapOf(c); const before = snaps.get(norm(c.name));
    if (!now || !before || before.quests == null) return null;
    const up = (a, b) => Math.max(0, a - (b ?? a));
    const upN = (a, b) => (a == null || b == null ? 0 : Math.max(0, a - b)); // counters that an older snapshot did not have: no difference yet
    const skills = Object.entries(now.skills ?? {}).filter(([n, v]) => before.skills && before.skills[n] != null && v > before.skills[n]).map(([n, v]) => ({ name: n, from: before.skills[n], to: v }));
    return { quests: up(now.quests, before.quests), kills: up(now.kills, before.kills), deaths: up(now.deaths, before.deaths), camps: upN(now.camps, before.camps), xp: upN(now.xp, before.xp), skills };
  };

  // levels
  const gains = new Map(); const newLevels = [];
  for (const c of active) {
    if (!(c.level > 0)) continue;
    const key = norm(c.name); const before = prev.levels.get(key);
    if (before === undefined) { baseline.levels.push({ key, name: c.name, player: c.player, level: c.level, snap: snapOf(c) }); continue; }
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
    // the recap: a small block per character that did something (name, then progress / activity / skills on their own lines), then the totals, then the new achievements
    const blocks = []; const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`; let xpTotal = 0;
    const row = (...bits) => bits.filter(Boolean).join(' · ');
    const mine = active.filter((x) => x.player === p);
    for (const c of mine) {
      const g = lv.find((x) => x.key === norm(c.name)); const ses = sessionOf(c);
      if (ses?.xp) xpTotal += ses.xp;
      const rows = [
        // with one character the progress is already the summary on top
        mine.length > 1 ? row(g && `⬆️ +${plural(g.to - g.from, 'level')} (${g.from} → **${g.to}**)`, ses?.xp && `✨ +${fmt(ses.xp)} XP`) : '',
        row(ses?.quests && `📜 +${plural(ses.quests, 'quest')}`, ses?.kills && `⚔️ +${plural(ses.kills, 'kill')}`, ses?.deaths && `💀 +${plural(ses.deaths, 'death')}`, ses?.camps && `🔥 +${plural(ses.camps, 'campfire')}`),
        ses?.skills?.length ? `🔨 ${ses.skills.map((k) => `${k.name} ${k.from} → **${k.to}**`).join(' · ')}` : '',
      ].filter(Boolean);
      if (rows.length) blocks.push([`**${c.name}**`, ...rows].join('\n'));
    }
    // the summary of the player, on top: XP and levels gained this session and the total level (the levels of all his characters added up, like the dashboard)
    const levelsGained = lv.reduce((n, g) => n + (g.to - g.from), 0);
    const totalLevel = mine.filter((x) => x.level > 0).reduce((n, x) => n + x.level, 0);
    blocks.unshift(`### 📊 This session\n${row(xpTotal && `✨ +${fmt(xpTotal)} XP`, levelsGained && `⬆️ +${plural(levelsGained, 'level')} (${fmt(totalLevel - levelsGained)} → **${fmt(totalLevel)}**)`, `**Total level ${fmt(totalLevel)}**`)}`);
    if (ach.length) blocks.push(`### 🏆 Achievements\n${ach.map(({ a, s }) => {
      const now = a.meter === 'requiredDone' ? '' : ` · now: ${fmt(s.value)} ${METERS[a.meter] ?? ''}`.trimEnd();
      return `**${a.title}** (${branchName(a.branch)})\n↳ ${a.desc}${now}`;
    }).join('\n')}`);
    const lines = blocks; // separated by an empty line
    const ids = ach.map(({ a }) => a.id);
    const link = ach.length ? `${SITE}/achievements.html?a=${ids.join(',')}&p=${encodeURIComponent(p)}` : `${SITE}/character.html?name=${encodeURIComponent(lv[0].name)}`;
    const points = ach.reduce((n, { a }) => n + a.points, 0);
    messages.push({
      kind: 'player', player: p, discordId: id ?? null,
      content: `${id ? `<@${id}>` : `**${p}**`} achieved this session:`,
      embed: { color: COLOR, title: 'Session recap', url: link, description: lines.join('\n\n'),
        fields: [{ name: '​', value: `[View it on the dashboard](${link})${points ? ` · +${points} points` : ''}` }] },
      allowed: id ? { users: [id] } : { parse: [] },
      commit: { levels: lv.map((g) => ({ key: g.key, level: g.to })), snaps: active.filter((x) => x.player === p && prev.levels.has(norm(x.name)) && snapOf(x)).map((x) => ({ key: norm(x.name), level: Math.max(prev.levels.get(norm(x.name)), x.level), ...snapOf(x) })), known: ach.map(({ a }) => ({ player: p, id: a.id })), summary: lines.join(' | ').replace(/\n/g, ' · ') },
    });
  }
  if (guildGoals.length) {
    const link = `${SITE}/achievements.html?a=${guildGoals.map(({ a }) => a.id).join(',')}`;
    const lines = guildGoals.map(({ a, s }) => `🏆 **${a.title}** — ${a.desc}${a.meter === 'requiredDone' ? '' : ` · now: ${fmt(s.value)} ${METERS[a.meter] ?? ''}`.trimEnd()}`);
    messages.push({
      kind: 'guild', player: '', discordId: null,
      content: '@everyone The whole guild has reached something 🎉',
      embed: { color: COLOR, title: 'Guild goal' + (guildGoals.length > 1 ? 's' : '') + ' reached', url: link, description: lines.join('\n'), fields: [{ name: '​', value: `[View it on the dashboard](${link})` }] },
      allowed: { parse: ['everyone'] },
      commit: { levels: [], known: guildGoals.map(({ a }) => ({ player: '', id: a.id })), summary: lines.join(' | ') },
    });
  }
  // the levels of everybody that has no news are kept up to date too (when a level goes down, the highest one stays)
  const seen = new Set(messages.flatMap((m) => m.commit.levels.map((l) => l.key)));
  const quiet = active.filter((c) => c.level > 0 && !seen.has(norm(c.name)) && prev.levels.has(norm(c.name)));
  // the numbers of everybody whose player gets no message are remembered right away, so the next recap only shows what is new
  const quietPlayers = new Set(messages.map((m) => m.player));
  const quietSnaps = active.filter((c) => c.level > 0 && !quietPlayers.has(c.player) && prev.levels.has(norm(c.name)) && snapOf(c)).map((c) => ({ key: norm(c.name), level: Math.max(prev.levels.get(norm(c.name)), c.level), ...snapOf(c) }));
  return { messages, baseline, players, quiet, quietSnaps };
}

// ---- Dag Dinky (every day) and Week Dinky (every Monday just after midnight = the end of Sunday): one message for the whole guild with @everyone.
// Dutch time. The day is posted by the first run at or after 00:07 (update-characters has run at 00:05 by then); the week on Mondays, in the same run, after the day.
// What a day / week is = the stats of now minus the stats at the previous post (kept in ding_period, per kind 'day' / 'week'), so a character that logs out after
// midnight simply counts in the next day. The first run only remembers the starting point of the Dag Dinky (started in the last two hours before midnight: the first Dag Dinky is the day after); the first Week Dinky is the whole time since the launch (launchBase).
const TZ = 'Europe/Amsterdam';
const MIN_MINUTES = 7; // 00:07
export function localParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
}
export const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const dayMonth = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' });
export function isoWeek(date) {
  const d = new Date(`${date}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow + 3); // the Thursday of this week decides the year
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12));
  return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
// last = the remembered state of this kind ({ date }) or null. 'init' = only remember the starting point, 'post' = post and move on, null = nothing to do now
export function periodDue(kind, last, now) {
  if (!last) return 'init';
  if (now.minutes < MIN_MINUTES) return null;
  if (kind === 'day') return last.date < now.date ? 'post' : null;
  return now.weekday === 'Mon' && last.date < now.date ? 'post' : null;
}

// The first Week Dinky (the first week of WoW: Forever, 9 nov, Jelle): there is no earlier snapshot, but every counter of the game started at the launch, so the starting point is
// "level 1, nothing done, every profession at skill 1, no achievements" and the first Week Dinky is the whole time since the launch.
export const LAUNCH_DAY = '2026-11-05'; // the launch in Dutch time (LAUNCH in js/releases.js is 2026-11-04T23:00:00Z)
export function launchBase(chars) {
  const active = chars.filter((c) => c.player && c.status !== 'Gestopt' && c.level > 0);
  return {
    chars: new Map(active.filter((c) => c.stats).map((c) => [norm(c.name), { level: 1, xp: 0, quests: 0, kills: 0, deaths: 0, camps: 0, boss: 0, skills: Object.fromEntries(Object.keys(c.skills ?? {}).map((n) => [n, 1])) }])),
    ach: new Map([...new Set(active.map((c) => c.player))].map((p) => [p, new Set()])),
  };
}

const PERIOD_STATS = [
  { key: 'xp', icon: '✨', label: 'XP', show: (v) => fmt(v) },
  { key: 'levels', icon: '⬆️', label: 'Levels', show: (v) => `+${fmt(v)}` },
  { key: 'quests', icon: '📜', label: 'Quests', show: (v) => fmt(v) },
  { key: 'kills', icon: '⚔️', label: 'Kills', show: (v) => fmt(v) },
  { key: 'boss', icon: '🏰', label: 'Boss kills', show: (v) => fmt(v) },
  { key: 'camps', icon: '🔥', label: 'Campfires', show: (v) => fmt(v) },
  { key: 'skillpts', icon: '🔨', label: 'Profession skill', show: (v) => `+${fmt(v)}` },
  { key: 'deaths', icon: '💀', label: 'Deaths', show: (v) => fmt(v) },
];
const MEDALS = ['🥇', '🥈', '🥉'];
// Discord says 4096 characters, but the first Week Dinky (9 nov) was cut off after 2,687 characters / 52 lines (the rest of that message, with the block of Mike, never showed in Discord), so a message stays well below that
const EMBED_LIMIT = 2200;
const EMBED_LINES = 32;

// base = { chars: Map(key -> snapshot), ach: Map(player -> Set(achievement ids)) } as it was at the previous post (empty = starting point only)
// Returns { messages, newBase, players }: all players (alphabetical) with everything their characters did, the guild total and the messages to post (none when nothing happened).
export function planPeriod({ kind, core, chars, states, base, today, since, prevXp, discord }) {
  const { BY_ID } = core;
  const active = chars.filter((c) => c.player && c.status !== 'Gestopt' && c.level > 0);
  const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  const players = [...new Set(active.map((c) => c.player))].sort(byName);
  const newBase = { chars: new Map(), ach: new Map() };
  const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
  const row = (...bits) => bits.filter(Boolean).join(' · ');
  const up = (a, b) => (a == null || b == null ? 0 : Math.max(0, a - b)); // a counter the earlier snapshot did not have: no difference yet

  const results = [];
  for (const p of players) {
    const mine = active.filter((c) => c.player === p).sort((a, b) => byName(a.name, b.name));
    const cs = [];
    for (const c of mine) {
      if (!c.stats) continue; // the game does not know this character (yet): nothing to compare
      const key = norm(c.name); const old = base.chars.get(key);
      const now = { level: c.level, xp: totalXp(c.level, c.xp) ?? old?.xp ?? null, quests: num(c.stats.quests) ?? 0, kills: num(c.stats.kills) ?? 0, deaths: num(c.stats.deaths) ?? 0,
        camps: num(c.stats.camps) ?? old?.camps ?? null, boss: num(c.stats.bossKills) ?? old?.boss ?? null, skills: c.skills ?? old?.skills ?? null };
      newBase.chars.set(key, now);
      if (!old) continue; // new in the data: starting point only
      const skills = Object.entries(now.skills ?? {}).filter(([n, v]) => old.skills && old.skills[n] != null && v > old.skills[n]).map(([n, v]) => ({ name: n, from: old.skills[n], to: v }));
      const d = { name: c.name, level: now.level, from: Math.min(old.level, now.level), levels: Math.max(0, now.level - old.level), xp: up(now.xp, old.xp), quests: up(now.quests, old.quests), kills: up(now.kills, old.kills),
        deaths: up(now.deaths, old.deaths), camps: up(now.camps, old.camps), boss: up(now.boss, old.boss), skills, skillpts: skills.reduce((n, k) => n + (k.to - k.from), 0) };
      d.any = !!(d.levels || d.xp || d.quests || d.kills || d.deaths || d.camps || d.boss || skills.length);
      cs.push(d);
    }
    // achievements of the player since the previous post
    const st = states.get(p);
    const done = st ? [...st.values()].filter((s) => s.done && BY_ID.get(s.id).scope !== 'guild').map((s) => s.id) : [];
    const before = base.ach.get(p);
    newBase.ach.set(p, new Set(done));
    const ach = before ? done.filter((id) => !before.has(id)).map((id) => BY_ID.get(id)) : [];
    const t = { xp: 0, levels: 0, quests: 0, kills: 0, deaths: 0, camps: 0, boss: 0, skillpts: 0 };
    for (const c of cs) for (const k of Object.keys(t)) t[k] += c[k];
    const totalLevel = mine.reduce((n, c) => n + c.level, 0);
    results.push({ name: p, chars: cs.filter((c) => c.any), totals: t, totalLevel, ach, any: cs.some((c) => c.any) || ach.length > 0, discordId: discord?.get(p) ?? null });
  }
  const busy = results.filter((r) => r.any); // somebody who did nothing is left out
  if (!busy.length) return { messages: [], newBase, players: results };

  const word = kind === 'week' ? 'week' : 'day';
  // top 3 per stat (ties share the medal, at most three names), over the totals of all characters of a player
  const top = PERIOD_STATS.map((s) => {
    const list = busy.filter((r) => r.totals[s.key] > 0).sort((a, b) => b.totals[s.key] - a.totals[s.key] || byName(a.name, b.name));
    const ranked = list.map((r) => ({ r, rank: list.filter((x) => x.totals[s.key] > r.totals[s.key]).length })).filter((x) => x.rank < 3);
    // at most three names; a tie that does not fit ends with "+N more"
    const more = ranked.length > 3 ? ` · +${ranked.length - 3} more` : '';
    return ranked.length ? `${s.icon} **${s.label}** — ${ranked.slice(0, 3).map(({ r, rank }) => `${MEDALS[rank]} ${r.name} ${s.show(r.totals[s.key])}`).join(' · ')}${more}` : null;
  }).filter(Boolean);
  const blocks = [];
  if (top.length) blocks.push(`### 🏅 Top 3 of the ${word}\n${top.join('\n')}`);
  // one short line per player (all his characters added up), alphabetical; the details per character are not in the message (9 nov, Jelle: too long)
  const legend = '*✨ XP · ⬆️ levels · 📜 quests · ⚔️ kills · 🏰 boss kills · 💀 deaths · 🔥 campfires · 🔨 profession skill · 🏆 achievements*';
  const lineOf = (r) => { const t = r.totals; return `**${r.name}** · ${row(t.xp && `✨ ${fmt(t.xp)}`, t.levels && `⬆️ +${fmt(t.levels)}`, t.quests && `📜 ${fmt(t.quests)}`, t.kills && `⚔️ ${fmt(t.kills)}`, t.boss && `🏰 ${fmt(t.boss)}`, t.deaths && `💀 ${fmt(t.deaths)}`, t.camps && `🔥 ${fmt(t.camps)}`, t.skillpts && `🔨 +${fmt(t.skillpts)}`, r.ach.length && `🏆 ${fmt(r.ach.length)}`)}`; };
  const lines = new Set(); // the player lines come under each other (no empty line in between)
  busy.forEach((r, i) => { const b = (i === 0 ? `### 👥 Everyone\n${legend}\n` : '') + lineOf(r); lines.add(b); blocks.push(b); });
  const g = { xp: 0, levels: 0, quests: 0, kills: 0, deaths: 0, camps: 0, boss: 0, skillpts: 0 }; let achN = 0;
  for (const r of busy) { for (const k of Object.keys(g)) g[k] += r.totals[k]; achN += r.ach.length; }
  const trend = kind === 'week' && prevXp > 0 && g.xp > 0 ? ` (${g.xp >= prevXp ? '▲' : '▼'} ${Math.abs(Math.round(((g.xp - prevXp) / prevXp) * 100))}% vs last week)` : '';
  blocks.push(`### 🧮 Guild total\n${row(g.xp && `✨ ${fmt(g.xp)} XP${trend}`, g.levels && `⬆️ +${plural(g.levels, 'level')}`, g.quests && `📜 ${plural(g.quests, 'quest')}`, g.kills && `⚔️ ${plural(g.kills, 'kill')}`, g.boss && `🏰 ${plural(g.boss, 'boss kill')}`, g.deaths && `💀 ${plural(g.deaths, 'death')}`, g.camps && `🔥 ${plural(g.camps, 'campfire')}`, g.skillpts && `🔨 +${fmt(g.skillpts)} profession skill`, achN && `🏆 ${plural(achN, 'new achievement')}`)}`);

  // pack the blocks into as few messages as fit (@everyone only in the first)
  const pages = [[]]; let size = 0; let rows = 0;
  for (const b of blocks) {
    const n = b.split('\n').length + 1;
    if ((size + b.length > EMBED_LIMIT || rows + n > EMBED_LINES) && pages[pages.length - 1].length) { pages.push([]); size = 0; rows = 0; }
    pages[pages.length - 1].push(b); size += b.length + 2; rows += n;
  }
  const title = kind === 'week' ? `Week Dinky · week ${isoWeek(addDays(today, -1))} (${since >= addDays(today, -1) ? dayMonth(addDays(today, -1)) : `${dayMonth(since)} – ${dayMonth(addDays(today, -1))}`})` : `Dag Dinky · ${dayName(addDays(today, -1))}`;
  const messages = pages.map((bl, i) => ({
    kind, player: '', discordId: null,
    content: i === 0 ? `@everyone ${kind === 'week' ? 'The week in review 📅' : 'The day in review 🌙'}` : '',
    embed: { color: COLOR, title: pages.length > 1 ? `${title} (${i + 1}/${pages.length})` : title, url: `${SITE}/overview.html`, description: bl.reduce((acc, b, k) => (k ? acc + (lines.has(b) && lines.has(bl[k - 1]) ? '\n' : '\n\n') + b : b), '') },
    allowed: i === 0 ? { parse: ['everyone'] } : { parse: [] },
    commit: { levels: [], known: [], summary: `${title}: ${busy.map((r) => r.name).join(', ')}` },
  }));
  return { messages, newBase, players: results, totalXp: g.xp };
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

// Dag Dinky / Week Dinky: see planPeriod. Everything is kept per kind in ding_period (key c:<character> = the stats at the previous post, p:<player> = the finished achievements, _run = { date, since, xp }).
// force = 'day' | 'week' (only together with dryRun): works out what would be posted now, as if it were time.
async function runPeriods(data, chars, states, discord, dryRun, force) {
  const now = localParts(new Date());
  const all = await db('ding_period?select=kind,key,snap');
  const webhook = env('DING_WEBHOOK_URL');
  const out = []; let error = null;
  for (const kind of ['day', 'week']) {
    const rows = all.filter((r) => r.kind === kind);
    // no earlier post: the first Dag Dinky starts from now, the first Week Dinky is the whole time since the launch (posted on the first Monday)
    const seeded = kind === 'week' && !rows.some((r) => r.key === '_run');
    const last = rows.find((r) => r.key === '_run')?.snap ?? (seeded ? { date: '1970-01-01', since: LAUNCH_DAY, xp: 0 } : null);
    const due = force === kind ? 'post' : periodDue(kind, last, now);
    if (!due) continue;
    const base = due === 'init' ? { chars: new Map(), ach: new Map() } : seeded ? launchBase(chars) : { chars: new Map(rows.filter((r) => r.key.startsWith('c:')).map((r) => [r.key.slice(2), r.snap])), ach: new Map(rows.filter((r) => r.key.startsWith('p:')).map((r) => [r.key.slice(2), new Set(r.snap.done ?? [])])) };
    const since = kind === 'week' && last?.since && last.since > addDays(now.date, -7) ? last.since : addDays(now.date, -7);
    const result = planPeriod({ kind, core, chars, states, base, today: now.date, since, prevXp: last?.xp ?? 0, discord });
    out.push({ kind, due, messages: result.messages.map((m) => ({ content: m.content, title: m.embed.title, description: m.embed.description })) });
    if (dryRun) continue;
    if (result.messages.length && !webhook) { error = 'DING_WEBHOOK_URL is not set: the news is kept until it is'; continue; }
    try {
      for (const m of result.messages) {
        await post(webhook, m);
        await db('ding_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: m.kind, player_name: '', summary: m.commit.summary }) });
        await sleep(800);
      }
    } catch (e) { error = e.message; console.warn(error); continue; } // nothing is moved on: the same day or week is tried again in the next run
    const stamp = new Date().toISOString();
    const snaps = [...result.newBase.chars].map(([k, v]) => ({ kind, key: `c:${k}`, snap: v, updated_at: stamp }));
    const achs = [...result.newBase.ach].map(([p, ids]) => ({ kind, key: `p:${p}`, snap: { done: [...ids] }, updated_at: stamp }));
    await upsert('ding_period', [...snaps, ...achs, { kind, key: '_run', snap: { date: due === 'init' && now.minutes >= 22 * 60 ? addDays(now.date, 1) : now.date, since: now.date, xp: kind === 'week' ? (result.totalXp ?? 0) : null }, updated_at: stamp }], 'kind,key');
  }
  return { out, error };
}

// ---- the run
export async function run(dryRun, force) {
  const [rows, blizzardRows, donations, overrides, playerRows, levelRows, knownRows, doneRows] = await Promise.all([
    db('characters?select=name,player_name,race,class,level,professions,status'),
    db('blizzard_characters?select=key,data'),
    db('gold_donations?select=player_name,copper'),
    db('achievement_overrides?select=*'),
    db('players?select=player_name,discord_id'),
    db('ding_levels?select=character_key,level,quests,kills,deaths,camps,xp,skills,gear'),
    db('ding_known?select=player_name,achievement_id'),
    db('ding_players?select=player_name'),
  ]);
  const blizzard = Object.fromEntries(blizzardRows.map((r) => [r.key, r.data]));
  const chars = rows.map((r) => characterFrom(r, blizzard[norm(r.name)]));
  const data = { characters: chars, blizzard, donations, overrides, gameTotals: gameTotalsFrom(blizzard) };
  const players = [...new Set(chars.filter((c) => c.player && c.status !== 'Gestopt').map((c) => c.player))];
  const guild = core.guildMeters(data, players);
  const states = new Map(players.map((p) => [p, core.evaluate(data, p, guild)]));
  const prev = { levels: new Map(levelRows.map((r) => [r.character_key, r.level])), snaps: new Map(levelRows.filter((r) => r.quests !== null && r.quests !== undefined).map((r) => [r.character_key, { quests: r.quests, kills: r.kills, deaths: r.deaths, camps: r.camps, xp: r.xp, skills: r.skills, gear: r.gear }])), known: new Set(knownRows.map((r) => `${r.player_name}|${r.achievement_id}`)), players: new Set(doneRows.map((r) => r.player_name)) };
  const discord = new Map(playerRows.filter((p) => p.discord_id).map((p) => [p.player_name, p.discord_id]));
  const result = plan({ core, chars, states, prev, discord });
  const first = prev.players.size === 0 && prev.levels.size === 0;
  const out = { first, baselined: { characters: result.baseline.levels.length, players: result.baseline.players.length }, messages: result.messages.map((m) => ({ kind: m.kind, player: m.player, content: m.content, description: m.embed.description })), posted: 0 };
  if (dryRun) { try { out.periods = (await runPeriods(data, chars, states, discord, true, force)).out; } catch (e) { out.periods = String(e.message ?? e); } return out; }

  const now = new Date().toISOString();
  // remembered without posting: the starting point and everybody that is new
  const snapRow = (l) => ({ character_key: l.key, level: l.level, quests: l.snap?.quests ?? null, kills: l.snap?.kills ?? null, deaths: l.snap?.deaths ?? null, camps: l.snap?.camps ?? null, xp: l.snap?.xp ?? null, skills: l.snap?.skills ?? null, gear: l.snap?.gear ?? null, updated_at: now });
  await upsert('ding_levels', result.baseline.levels.map((l) => ({ ...snapRow(l), character_name: l.name, player_name: l.player })), 'character_key');
  // the numbers of players without news (nothing to post, so nothing can be lost)
  await upsert('ding_levels', result.quietSnaps.map((l) => snapRow({ key: l.key, level: l.level, snap: l })), 'character_key');
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
        // the new levels and the numbers of this player's characters are remembered only now that the message is posted
        await upsert('ding_levels', m.commit.levels.map((l) => ({ character_key: l.key, level: l.level, updated_at: now })), 'character_key');
        await upsert('ding_levels', m.commit.snaps.map((l) => snapRow({ key: l.key, level: l.level, snap: l })), 'character_key');
        await upsert('ding_known', m.commit.known.map((k) => ({ player_name: k.player, achievement_id: k.id })), 'player_name,achievement_id');
        await db('ding_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: m.kind, player_name: m.player, summary: m.commit.summary }) });
        out.posted += 1;
        await sleep(800);
      } catch (e) { error = e.message; console.warn(error); break; }
    }
  }
  // Dag Dinky and Week Dinky: a problem here (for instance the table ding_period does not exist yet) never stops the session recaps above
  try { const pr = await runPeriods(data, chars, states, discord, false, null); out.periods = pr.out.map((x) => `${x.kind}: ${x.due} (${x.messages.length})`); if (pr.error && !error) error = pr.error; out.posted += pr.out.reduce((n, x) => n + (x.due === 'post' ? x.messages.length : 0), 0); }
  catch (e) { console.warn(e); if (!error) error = `Dag/Week Dinky: ${String(e.message ?? e).slice(0, 200)}`; }
  await upsert('ding_status', [{ id: 1, last_run_at: now, posted: out.posted, message: error, ...(first ? { activated_at: now } : {}) }], 'id');
  return { ...out, error };
}

Deno.serve(async (req) => {
  const secret = env('UPDATE_CHARACTERS_SECRET');
  if (!secret || req.headers.get('x-update-secret') !== secret) return json({ error: 'forbidden' }, 403);
  let dryRun = false; let test = false; let force = null;
  try { const body = await req.json(); dryRun = !!body.dryRun; test = !!body.test; force = dryRun && ['day', 'week'].includes(body.force) ? body.force : null; } catch { /* no body */ }
  // {"test": true}: posts one hello message in the channel to check the webhook, and nothing else (no state is read or written)
  if (test) {
    try {
      await post(env('DING_WEBHOOK_URL'), { content: 'Ding! \uD83D\uDD14 Ding Dinky is on.', embed: { color: COLOR, title: 'Test', description: 'If you can see this, the webhook works. Session recaps (level ups, quests, kills, deaths, campfires, XP, profession skills and achievements) will show up here from now on.' }, allowed: { parse: [] } });
      return json({ test: 'posted' });
    } catch (e) { return json({ test: 'failed', error: String(e.message ?? e) }, 500); }
  }
  try { return json(await run(dryRun, force)); } catch (e) { console.error(e); return json({ error: String(e.message ?? e) }, 500); }
});
