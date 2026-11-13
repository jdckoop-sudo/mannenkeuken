// Supabase Edge Function "event-bot": puts every event of the dashboard agenda (Raids & Events) in the Discord channel for the agenda, as ONE message per event,
// with a link to the event on the dashboard where people sign up. When somebody signs up (or changes or withdraws) the message is EDITED to show
// what is still needed. A cancelled event is marked "Cancelled". Started every minute by pg_cron (see supabase/schema.sql).
//
// Setup and how to check it: docs/instructies.md, "Event-bot".
// Function secrets (Edge Functions → Secrets), never in the repo:
//   EVENTS_WEBHOOK_URL          the webhook of the agenda channel (Channel settings → Integrations → Webhooks)
//   UPDATE_CHARACTERS_SECRET    the same long random text that update-characters and ding-bot use; the caller sends it as header x-update-secret
// Supabase provides SUPABASE_URL and the service key itself. "Enforce JWT verification" must be off (pg_cron has no user login).
//
// The rules (all of them in plan() and renderEvent() below, which have no network calls and are tested in tools/test-event-bot.mjs):
//  - A new event that has not started yet is posted once, with @everyone and an @mention of every player that was tagged on the dashboard (players.discord_id, like Ding Dinky;
//    without a Discord id the name is shown in bold). Only that first message pings: an edit never pings again.
//  - Needed people come from the event itself: 1 tank, 1 healer and 3 DPS by default (what the form fills in), or a number of players.
//    Only "Sign up" counts; "Maybe" is listed but does not fill a slot.
//  - Proposals for another time (event_time_proposals, voted on at the dashboard) are listed in the message with their votes. When more than half of the players agree,
//    the database changes the time of the event (supabase/schema.sql, event_time_apply) and this function edits the message to the new time.
//  - The message is edited only when what it shows has changed (a fingerprint of the message is kept in event_posts).
//  - An event is followed until 6 hours after its start, the same time the dashboard keeps it in the list.
//  - A deleted event (Cancel event on the dashboard) leaves no row, so event_posts keeps its title and time: its message is edited to "Cancelled".
//  - Only what has been posted is remembered: when Discord refuses a message, the next run tries again.
//
// POST body (optional): {"test": true} posts one hello message to check the webhook. {"dryRun": true} works out what would be posted and answers with it, but posts and writes nothing.
const SITE = 'https://jdckoop-sudo.github.io/mannenkeuken';
const COLOR_OPEN = 0xe8c15a;
const COLOR_FULL = 0x4caf7a;
const COLOR_CANCELLED = 0x777777;
const FOLLOW_MS = 6 * 3600e3; // like the dashboard: an event stays in the list until 6 hours after its start
const MAX_ACTIONS = 8;        // per run; the rest follows in the next minute

const env = (name) => Deno.env.get(name) ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

// ---- the message
const KIND = { dungeon: ['🏰', 'Dungeon'], raid: ['💀', 'Raid'], quest: ['❗', 'Quest help'], guild: ['🚩', 'Guild night'], other: ['⭐', 'Event'] };
const ROLES = [['Tank', '🛡️'], ['Healer', '💚'], ['DPS', '⚔️']];

// Dutch time, 24-hour clock (the same as everywhere on the site)
const whenText = (iso) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { timeZone: 'Europe/Amsterdam', weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Amsterdam', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
};

// a short fingerprint of the text of a message (cyrb53), kept in event_posts so a message is only edited when it changed
export function hashOf(str) {
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// What is still needed for one event: { open: [{ label, n }], full, yes, total }
export function needOf(e, signups) {
  const yes = signups.filter((s) => s.event_id === e.id && s.answer === 'yes');
  if (e.players_needed != null) {
    const n = Math.max(0, e.players_needed - yes.length);
    return { open: n ? [{ label: `${n} player${n === 1 ? '' : 's'}`, n }] : [], full: n === 0, yes: yes.length, total: e.players_needed };
  }
  const need = { Tank: e.tanks_needed ?? 0, Healer: e.healers_needed ?? 0, DPS: e.dps_needed ?? 0 };
  const open = ROLES.map(([r, icon]) => ({ r, icon, n: Math.max(0, need[r] - yes.filter((s) => s.role === r).length) })).filter((x) => x.n > 0)
    .map((x) => ({ label: `${x.icon} ${x.n} ${x.r}`, n: x.n }));
  const total = need.Tank + need.Healer + need.DPS;
  return { open, full: open.length === 0, yes: yes.length, total };
}

// The Discord message of one event: { content, embed, hash }. `link` is where people sign up.
export function renderEvent(e, signups, discord = new Map(), time = { proposals: [], votes: [] }) {
  const [emoji, kindName] = KIND[e.kind] ?? KIND.other;
  const link = `${SITE}/events.html#ev-${e.id}`;
  const mine = signups.filter((s) => s.event_id === e.id);
  const need = needOf(e, signups);
  const lines = [];
  lines.push(`🕒 **${whenText(e.starts_at)}** (Dutch time) · <t:${Math.floor(new Date(e.starts_at).getTime() / 1000)}:R>`);
  const place = [e.dungeon, e.quest ? `Quest: ${e.quest}` : ''].filter(Boolean).join(' · ');
  if (place) lines.push(`📍 ${place}`);
  if (e.min_level) lines.push(`Min. level ${e.min_level}`);
  if (e.note) lines.push(`> ${String(e.note).replace(/\n+/g, ' ').slice(0, 300)}`);
  lines.push(`Organised by **${e.author_name}**`);
  const yesList = mine.filter((s) => s.answer === 'yes').sort((a, b) => a.author_name.localeCompare(b.author_name));
  const maybeList = mine.filter((s) => s.answer === 'maybe').sort((a, b) => a.author_name.localeCompare(b.author_name));
  const fields = [
    { name: need.full ? '✅ Group is full' : '🔎 Still needed', value: need.full ? 'Everybody is in. Have fun!' : need.open.map((o) => o.label).join(' · '), inline: false },
    { name: `Signed up (${need.yes}/${need.total})`, value: yesList.length ? yesList.map((s) => `${s.author_name} (${s.role})`).join('\n').slice(0, 1000) : '*Nobody yet*', inline: true },
  ];
  if (maybeList.length) fields.push({ name: 'Maybe', value: maybeList.map((s) => `${s.author_name} (${s.role})`).join('\n').slice(0, 1000), inline: true });
  const props = (time.proposals ?? []).filter((p) => p.event_id === e.id)
    .map((p) => ({ ...p, voters: (time.votes ?? []).filter((v) => v.proposal_id === p.id).map((v) => v.voter).sort() }))
    .sort((a, b) => b.voters.length - a.voters.length || String(a.created_at).localeCompare(String(b.created_at)));
  if (props.length) fields.push({ name: '🗳️ Another time proposed', value: props.map((p) => `⏰ **${whenText(p.starts_at)}** · ${p.voters.length}/${p.votes_needed} votes (${p.voters.join(', ') || 'nobody yet'})`).join('\n').slice(0, 1000), inline: false });
  fields.push({ name: '​', value: `[${props.length ? 'Sign up or vote' : 'Sign up'} on the dashboard](${link})`, inline: false });
  const tagged = (e.pinged ?? []).map((p) => ({ name: p, id: discord.get(p) ?? null }));
  const tagText = tagged.map((t) => (t.id ? `<@${t.id}>` : `**${t.name}**`)).join(' ');
  const body = {
    content: `@everyone A new event is on the agenda 📅${tagged.length ? `\nTagged: ${tagText}` : ''}`,
    mentions: tagged.filter((t) => t.id).map((t) => t.id),
    embed: { color: need.full ? COLOR_FULL : COLOR_OPEN, title: `${emoji} ${e.title}`, url: link, description: `**${kindName}**\n${lines.join('\n')}`, fields, footer: { text: 'Mannenkeuken · Agenda' } },
  };
  return { ...body, hash: hashOf(JSON.stringify(body)) };
}

// A cancelled event: only its title and time are still known (event_posts)
export function renderCancelled(post) {
  const body = {
    content: '',
    mentions: [],
    embed: { color: COLOR_CANCELLED, title: `❌ ~~${post.title ?? 'Event'}~~ (cancelled)`, description: post.starts_at ? `This event on **${whenText(post.starts_at)}** (Dutch time) has been cancelled.` : 'This event has been cancelled.', footer: { text: 'Mannenkeuken · Agenda' } },
  };
  return { ...body, hash: hashOf(JSON.stringify(body)) };
}

// What has to be done now. events = rows of events, signups = rows of signups, posts = rows of event_posts, now = Date.
// Answers { post: [{ event, msg }], edit: [{ event, post, msg }], cancel: [{ post, msg }] }.
export function plan({ events, signups, posts, discord = new Map(), time = { proposals: [], votes: [] }, now = new Date() }) {
  const byId = new Map(posts.map((p) => [p.event_id, p]));
  const out = { post: [], edit: [], cancel: [] };
  const ids = new Set(events.map((e) => e.id));
  for (const e of events) {
    const startsMs = new Date(e.starts_at).getTime();
    const post = byId.get(e.id);
    if (!post) {
      if (startsMs > now.getTime()) out.post.push({ event: e, msg: renderEvent(e, signups, discord, time) }); // an event that has already started is not announced any more
      continue;
    }
    if (post.cancelled || now.getTime() > startsMs + FOLLOW_MS) continue;
    const msg = renderEvent(e, signups, discord, time);
    if (msg.hash !== post.hash) out.edit.push({ event: e, post, msg });
  }
  for (const p of posts) {
    if (ids.has(p.event_id) || p.cancelled) continue;
    if (p.starts_at && now.getTime() > new Date(p.starts_at).getTime() + FOLLOW_MS) continue; // long gone: leave it
    out.cancel.push({ post: p, msg: renderCancelled(p) });
  }
  return out;
}

// ---- Discord
async function sendDiscord(webhook, method, path, body) {
  const base = webhook.split('?')[0];
  const url = `${base}${path}?wait=true`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 429) { const wait = Number((await res.json().catch(() => ({}))).retry_after ?? 1); await sleep(Math.min(5, wait) * 1000 + 100); continue; }
    if (!res.ok) throw new Error(`Discord: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  }
  throw new Error('Discord: still rate limited after 3 tries');
}
const payload = (msg, ping) => ({ username: 'Opie Groep', content: msg.content, embeds: [msg.embed], allowed_mentions: ping ? { parse: ['everyone'], users: msg.mentions ?? [] } : { parse: [] } });

export async function run(dryRun) {
  const since = new Date(Date.now() - FOLLOW_MS - 3600e3).toISOString();
  // proposals for another time: when these tables do not exist yet the agenda still works
  const optional = (path) => db(path).catch((err) => { console.warn(String(err.message ?? err)); return []; });
  const [events, signups, posts, playerRows, proposals, votes] = await Promise.all([
    db(`events?select=*&starts_at=gte.${since}&order=starts_at`),
    db('signups?select=event_id,author_name,role,answer'),
    db('event_posts?select=*'),
    db('players?select=player_name,discord_id'),
    optional('event_time_proposals?select=*'),
    optional('event_time_votes?select=*'),
  ]);
  const discord = new Map(playerRows.filter((p) => p.discord_id).map((p) => [p.player_name, String(p.discord_id)]));
  const todo = plan({ events, signups, posts, discord, time: { proposals, votes } });
  const out = { post: todo.post.map((x) => x.event.title), edit: todo.edit.map((x) => x.event.title), cancel: todo.cancel.map((x) => x.post.title), posted: 0, error: null };
  if (dryRun) return { ...out, preview: [...todo.post, ...todo.edit].map((x) => ({ title: x.event.title, embed: x.msg.embed })) };

  const now = new Date().toISOString();
  const webhook = env('EVENTS_WEBHOOK_URL');
  let left = MAX_ACTIONS;
  const anything = todo.post.length + todo.edit.length + todo.cancel.length;
  if (anything && !webhook) out.error = 'EVENTS_WEBHOOK_URL is not set: the agenda news is kept until it is';
  else if (anything) {
    try {
      for (const x of todo.post) {
        if (left-- <= 0) break;
        const sent = await sendDiscord(webhook, 'POST', '', payload(x.msg, true));
        await upsert('event_posts', [{ event_id: x.event.id, message_id: sent.id, hash: x.msg.hash, title: x.event.title, starts_at: x.event.starts_at, cancelled: false, updated_at: now }], 'event_id');
        out.posted += 1; await sleep(700);
      }
      for (const x of todo.edit) {
        if (left-- <= 0) break;
        await sendDiscord(webhook, 'PATCH', `/messages/${x.post.message_id}`, payload(x.msg, false));
        await upsert('event_posts', [{ event_id: x.event.id, message_id: x.post.message_id, hash: x.msg.hash, title: x.event.title, starts_at: x.event.starts_at, cancelled: false, updated_at: now }], 'event_id');
        out.posted += 1; await sleep(700);
      }
      for (const x of todo.cancel) {
        if (left-- <= 0) break;
        await sendDiscord(webhook, 'PATCH', `/messages/${x.post.message_id}`, payload(x.msg, false));
        await upsert('event_posts', [{ event_id: x.post.event_id, message_id: x.post.message_id, hash: x.msg.hash, title: x.post.title, starts_at: x.post.starts_at, cancelled: true, updated_at: now }], 'event_id');
        out.posted += 1; await sleep(700);
      }
    } catch (e) { out.error = String(e.message ?? e).slice(0, 300); console.warn(out.error); }
  }
  await upsert('event_bot_status', [{ id: 1, last_run_at: now, posted: out.posted, message: out.error }], 'id');
  return out;
}

Deno.serve(async (req) => {
  const secret = env('UPDATE_CHARACTERS_SECRET');
  if (!secret || req.headers.get('x-update-secret') !== secret) return json({ error: 'forbidden' }, 403);
  let dryRun = false; let test = false;
  try { const body = await req.json(); dryRun = !!body.dryRun; test = !!body.test; } catch { /* no body */ }
  // {"test": true}: posts one hello message in the agenda channel to check the webhook, and nothing else (no state is read or written)
  if (test) {
    try {
      await sendDiscord(env('EVENTS_WEBHOOK_URL'), 'POST', '', { username: 'Opie Groep', content: 'Agenda test 📅', embeds: [{ color: COLOR_OPEN, title: 'Test', description: 'If you can see this, the webhook works. New events from the dashboard agenda will show up here, with what is still needed.' }], allowed_mentions: { parse: [] } });
      return json({ test: 'posted' });
    } catch (e) { return json({ test: 'failed', error: String(e.message ?? e) }, 500); }
  }
  try { return json(await run(dryRun)); } catch (e) { console.error(e); return json({ error: String(e.message ?? e) }, 500); }
});
