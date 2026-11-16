// Test of the decision logic of the agenda bot (supabase/functions/event-bot/index.ts): what is posted, edited or marked cancelled, and what the message says.
// Run: node tools/test-event-bot.mjs   (Node 22+, no dependencies, no network)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: () => '' }, serve: () => {} };
const dir = mkdtempSync(join(tmpdir(), 'event-'));
writeFileSync(join(dir, 'bot.mjs'), readFileSync(new URL('../supabase/functions/event-bot/index.ts', import.meta.url), 'utf8'));
const { plan, renderEvent, renderCancelled, needOf, hashOf } = await import(join(dir, 'bot.mjs'));

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

const NOW = new Date('2026-11-14T10:00:00Z');
const ev = (over = {}) => ({ id: 'e1', title: 'Wailing Caverns', kind: 'dungeon', dungeon: 'Wailing Caverns', quest: null, starts_at: '2026-11-14T18:00:00Z', min_level: 15,
  tanks_needed: 1, healers_needed: 1, dps_needed: 3, players_needed: null, pinged: [], note: null, author_name: 'Jelle', ...over });
const su = (name, role, answer = 'yes', event_id = 'e1') => ({ event_id, author_name: name, role, answer });
const run = (o) => plan({ events: [], signups: [], posts: [], discord: new Map(), now: NOW, ...o });

test('a new event is posted once, with @everyone and a link to the event', () => {
  const r = run({ events: [ev()] });
  assert.equal(r.post.length, 1);
  assert.match(r.post[0].msg.content, /^@everyone/);
  assert.match(r.post[0].msg.embed.url, /events\.html#ev-e1$/);
  assert.match(JSON.stringify(r.post[0].msg.embed.fields), /Sign up on the dashboard/);
});

test('always 1 tank, 1 healer and 3 DPS needed by default', () => {
  const m = renderEvent(ev(), []);
  const still = m.embed.fields.find((f) => /Still needed/.test(f.name));
  assert.equal(still.value, '🛡️ 1 Tank · 💚 1 Healer · ⚔️ 3 DPS');
  assert.match(m.embed.fields.find((f) => /Signed up/.test(f.name)).name, /0\/5/);
});

test('the time is Dutch time, 24-hour clock', () => {
  const m = renderEvent(ev({ starts_at: '2026-11-14T18:00:00Z' }), []);
  assert.match(m.embed.description, /Saturday 14 November · 19:00/); // November = UTC+1
  const summer = renderEvent(ev({ starts_at: '2026-07-14T18:00:00Z' }), []);
  assert.match(summer.embed.description, /20:00/); // summer time = UTC+2
});

test('a sign-up changes what is still needed; the same message is edited without a new ping', () => {
  const posted = renderEvent(ev(), []);
  const posts = [{ event_id: 'e1', message_id: 'm1', hash: posted.hash, title: 'Wailing Caverns', starts_at: ev().starts_at, cancelled: false }];
  const r = run({ events: [ev()], posts, signups: [su('Jelle', 'Tank'), su('Pim', 'DPS')] });
  assert.equal(r.post.length, 0);
  assert.equal(r.edit.length, 1);
  assert.equal(r.edit[0].post.message_id, 'm1');
  const still = r.edit[0].msg.embed.fields.find((f) => /Still needed/.test(f.name));
  assert.equal(still.value, '💚 1 Healer · ⚔️ 2 DPS');
});

test('nothing changed: nothing is edited', () => {
  const sign = [su('Jelle', 'Tank')];
  const posts = [{ event_id: 'e1', message_id: 'm1', hash: renderEvent(ev(), sign).hash, title: 'x', starts_at: ev().starts_at, cancelled: false }];
  const r = run({ events: [ev()], posts, signups: sign });
  assert.deepEqual([r.post.length, r.edit.length, r.cancel.length], [0, 0, 0]);
});

test('a full group says so', () => {
  const sign = [su('A', 'Tank'), su('B', 'Healer'), su('C', 'DPS'), su('D', 'DPS'), su('E', 'DPS')];
  const m = renderEvent(ev(), sign);
  assert.ok(m.embed.fields.some((f) => /Group is full/.test(f.name)));
  assert.equal(m.embed.color, 0x4caf7a);
  assert.equal(needOf(ev(), sign).full, true);
});

test('"Maybe" is listed but does not fill a slot, "Can\'t come" is not shown', () => {
  const sign = [su('A', 'Tank', 'maybe'), su('B', 'Healer', 'no')];
  const m = renderEvent(ev(), sign);
  assert.equal(m.embed.fields.find((f) => /Still needed/.test(f.name)).value, '🛡️ 1 Tank · 💚 1 Healer · ⚔️ 3 DPS');
  assert.match(m.embed.fields.find((f) => f.name === 'Maybe').value, /A \(Tank\)/);
  assert.doesNotMatch(JSON.stringify(m.embed), /B \(Healer\)/);
});

test('an event for a number of players counts players, not roles', () => {
  const e = ev({ kind: 'quest', quest: 'Wanted: Foo', dungeon: null, players_needed: 2, tanks_needed: 0, healers_needed: 0, dps_needed: 0 });
  const m = renderEvent(e, [su('A', 'DPS')]);
  assert.equal(m.embed.fields.find((f) => /Still needed/.test(f.name)).value, '1 player');
  assert.match(m.embed.description, /Quest: Wanted: Foo/);
});

test('tagged players are @mentioned in the first message (Discord id), in bold without an id', () => {
  const e = ev({ pinged: ['Pim', 'Mike'] });
  const r = run({ events: [e], discord: new Map([['Pim', '123']]) });
  assert.match(r.post[0].msg.content, /Tagged: <@123> \*\*Mike\*\*/);
  assert.deepEqual(r.post[0].msg.mentions, ['123']);
});

test('an event that has already started is not announced, but an announced one is followed until 6 hours after its start', () => {
  const started = ev({ starts_at: '2026-11-14T09:00:00Z' });
  assert.equal(run({ events: [started] }).post.length, 0);
  const old = renderEvent(started, []);
  const posts = [{ event_id: 'e1', message_id: 'm1', hash: 'old', title: 'x', starts_at: started.starts_at, cancelled: false }];
  assert.equal(run({ events: [started], posts, signups: [su('A', 'Tank')] }).edit.length, 1);
  const later = new Date('2026-11-14T15:30:00Z'); // 6.5 hours after the start
  assert.equal(plan({ events: [started], signups: [su('A', 'Tank')], posts, discord: new Map(), now: later }).edit.length, 0);
  assert.ok(old.hash);
});

test('a deleted event: its message is marked cancelled once', () => {
  const posts = [{ event_id: 'gone', message_id: 'm9', hash: 'h', title: 'Raid night', starts_at: '2026-11-14T18:00:00Z', cancelled: false }];
  const r = run({ events: [], posts });
  assert.equal(r.cancel.length, 1);
  assert.match(r.cancel[0].msg.embed.title, /cancelled/);
  assert.equal(r.cancel[0].msg.content, '');
  const again = run({ events: [], posts: [{ ...posts[0], cancelled: true }] });
  assert.equal(again.cancel.length, 0);
});

test('an old deleted event is left alone', () => {
  const posts = [{ event_id: 'gone', message_id: 'm9', hash: 'h', title: 'Old', starts_at: '2026-11-01T18:00:00Z', cancelled: false }];
  assert.equal(run({ events: [], posts }).cancel.length, 0);
});

test('hashOf is stable and differs for different text', () => {
  assert.equal(hashOf('abc'), hashOf('abc'));
  assert.notEqual(hashOf('abc'), hashOf('abd'));
});

test('renderCancelled does not break without a time', () => {
  assert.match(renderCancelled({ title: 'X' }).embed.description, /cancelled/);
});

test('proposed times are listed with their votes; a changed vote edits the message', () => {
  const time = { proposals: [{ id: 'p1', event_id: 'e1', starts_at: '2026-11-14T19:30:00Z', votes_needed: 3, created_at: '2026-11-13T12:00:00Z' }], votes: [{ event_id: 'e1', voter: 'Pim', proposal_id: 'p1' }] };
  const m = renderEvent(ev(), [], new Map(), time);
  const f = m.embed.fields.find((x) => /Another time/.test(x.name));
  assert.match(f.value, /20:30/); // 19:30 UTC = 20:30 Dutch time (UTC+1)
  assert.match(f.value, /1\/3 votes \(Pim\)/);
  assert.match(JSON.stringify(m.embed.fields), /Sign up or vote on the dashboard/);
  assert.equal(renderEvent(ev(), []).embed.fields.some((x) => /Another time/.test(x.name)), false);
  const posts = [{ event_id: 'e1', message_id: 'm1', hash: renderEvent(ev(), []).hash, title: 'x', starts_at: ev().starts_at, cancelled: false }];
  assert.equal(run({ events: [ev()], posts, time }).edit.length, 1);
});

test('a new time of the event is shown in the same message (edit, no new post)', () => {
  const posts = [{ event_id: 'e1', message_id: 'm1', hash: renderEvent(ev(), []).hash, title: 'x', starts_at: ev().starts_at, cancelled: false }];
  const r = run({ events: [ev({ starts_at: '2026-11-14T19:30:00Z' })], posts });
  assert.equal(r.post.length, 0);
  assert.equal(r.edit.length, 1);
  assert.match(r.edit[0].msg.embed.description, /20:30/);
});

console.log(`\n${passed} tests passed`);
