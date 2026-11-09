// Test of the decision logic of Ding Dinky (the bot in Discord) (supabase/functions/ding-bot/index.ts): what is posted, what is only remembered.
// Run: node tools/test-ding-bot.mjs   (Node 22+, no dependencies, no network)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: () => '' }, serve: () => {} };
const dir = mkdtempSync(join(tmpdir(), 'ding-'));
// the function imports ./achievements-core.js: an exact copy of the one of the site, so both must stay the same
const rules = readFileSync(new URL('../js/achievements-core.js', import.meta.url), 'utf8');
assert.equal(readFileSync(new URL('../supabase/functions/ding-bot/achievements-core.js', import.meta.url), 'utf8'), rules,
  'supabase/functions/ding-bot/achievements-core.js is not the same as js/achievements-core.js: copy it again (cp js/achievements-core.js supabase/functions/ding-bot/)');
writeFileSync(join(dir, 'ding.mjs'), readFileSync(new URL('../supabase/functions/ding-bot/index.ts', import.meta.url), 'utf8'));
writeFileSync(join(dir, 'achievements-core.js'), rules);
const { plan, planPeriod, launchBase, LAUNCH_DAY, periodDue, localParts, addDays, isoWeek, characterFrom, gameTotalsFrom, totalXp, XP_TO_NEXT } = await import(join(dir, 'ding.mjs'));
const core = await import(new URL('../js/achievements-core.js', import.meta.url));

const ch = (name, player, level, status = 'Main', profs = []) => ({ name, player, level, status, profs });
const blizzard = {};
const run = (chars, donations, prev, discord = new Map()) => {
  const data = { characters: chars, blizzard, donations, overrides: [], gameTotals: gameTotalsFrom(blizzard) };
  const players = [...new Set(chars.filter((c) => c.status !== 'Gestopt').map((c) => c.player))];
  const guild = core.guildMeters(data, players);
  const states = new Map(players.map((p) => [p, core.evaluate(data, p, guild)]));
  return plan({ core, chars, states, prev, discord });
};
const empty = () => ({ levels: new Map(), known: new Set(), players: new Set() });
const GOLD = 10000;

// 1. first run: everything is baseline, nothing is posted
let r = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], [{ player_name: 'Jelle', copper: 50 * GOLD }], empty());
assert.equal(r.messages.length, 0);
assert.equal(r.baseline.levels.length, 2);
assert.ok(r.baseline.players.includes('Jelle') && r.baseline.players.includes('') );
assert.ok(r.baseline.known.some((k) => k.player === 'Jelle' && k.id === 'j1'));

// state after the first run
const first = r;
const prev = () => ({
  levels: new Map([['aa', 12], ['bb', 30]]),
  known: new Set(first.baseline.known.map((k) => `${k.player}|${k.id}`)),
  players: new Set(first.baseline.players),
});

// 2. nothing changed: nothing posted
assert.equal(run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], [{ player_name: 'Jelle', copper: 50 * GOLD }], prev()).messages.length, 0);

// 3. two characters of one player level up + an achievement: ONE message, with the numbers and the @mention
r = run([ch('Aa', 'Jelle', 15), ch('Cc', 'Jelle', 8, 'Alt'), ch('Bb', 'Tinus', 30)], [{ player_name: 'Jelle', copper: 50 * GOLD }], prev(), new Map([['Jelle', '123456789012345678']]));
let m = r.messages.filter((x) => x.kind === 'player');
assert.equal(m.length, 1, 'one message for Jelle');
assert.match(m[0].content, /^<@123456789012345678> achieved this session:$/);
assert.equal(m[0].embed.title, 'Session recap');
assert.deepEqual(m[0].allowed, { users: ['123456789012345678'] });
assert.match(m[0].embed.description, /\*\*Aa\*\*\n⬆️ \+3 levels \(12 → \*\*15\*\*\)/);
assert.ok(!/Cc/.test(m[0].embed.description), 'a new character is only a baseline');
assert.ok(r.baseline.levels.some((l) => l.key === 'cc'));

// 4. new player: no messages, even with achievements
r = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30), ch('Nn', 'Nieuw', 60)], [], { ...prev(), players: new Set(['Jelle', 'Tinus', '']) });
assert.equal(r.messages.length, 0);
assert.ok(r.baseline.players.includes('Nieuw'));

// 5. level up of one player, achievement of another: separate messages; a level reaching 20 gives the achievement
r = run([ch('Aa', 'Jelle', 20), ch('Bb', 'Tinus', 31)], [{ player_name: 'Jelle', copper: 50 * GOLD }], prev());
m = r.messages.filter((x) => x.kind === 'player');
assert.equal(m.length, 2);
const jelle = m.find((x) => x.player === 'Jelle');
assert.match(jelle.embed.description, /Getting Warmed Up/);
assert.match(jelle.embed.url, /achievements\.html\?a=.*j2.*&p=Jelle/);
assert.match(jelle.content, /^\*\*Jelle\*\*/, 'no discord id: bold name, no mention');
assert.deepEqual(jelle.allowed, { parse: [] });
const tinus = m.find((x) => x.player === 'Tinus');
assert.match(tinus.embed.description, /⬆️ \+1 level \(30 → \*\*31\*\*\)/);

// 6. quit characters count for nothing; a level that goes down posts nothing
r = run([ch('Aa', 'Jelle', 10), ch('Bb', 'Tinus', 31, 'Gestopt')], [], prev());
assert.equal(r.messages.length, 0);

// 7. guild goal: ONE message with @everyone, none per player
const donations = [{ player_name: 'Jelle', copper: 120 * GOLD }, { player_name: 'Tinus', copper: 90 * GOLD }];
r = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], donations, prev());
const g = r.messages.filter((x) => x.kind === 'guild');
assert.equal(g.length, 1);
assert.match(g[0].content, /^@everyone/);
assert.deepEqual(g[0].allowed, { parse: ['everyone'] });
assert.match(g[0].embed.description, /Full Vault/);
assert.ok(!r.messages.some((x) => x.kind === 'player' && /Full Vault/.test(x.embed.description)), 'guild goals not per player');

// 8. already announced: not again
const announced = prev(); announced.known.add('|d7');
r = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], donations, announced);
assert.equal(r.messages.filter((x) => x.kind === 'guild').length, 0);

// 9. API leads over the table (characterFrom)
const c = characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [{ name: 'Mining', skill: 5, kind: 'primary' }], status: 'Main' },
  { status: 'ok', level: 22, professions: [{ name: 'Herbalism', skill: 80, kind: 'primary' }, { name: 'Fishing', skill: 30, kind: 'secondary' }] });
assert.equal(c.level, 22);
assert.deepEqual(c.profs.map((p) => p.name), ['Herbalism', 'Fishing']);
const t = characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [{ name: 'Mining', skill: 5, kind: 'primary' }], status: 'Main' }, null);
assert.equal(t.level, 10);

// 10. the recap also shows what the characters did since the previous run: quests, kills, deaths, profession skills (English text)
const withStats = (name, player, level, stats, skills, status = 'Main') => ({ ...ch(name, player, level, status), stats, skills });
const snapPrev = () => ({ ...prev(), snaps: new Map([['aa', { quests: 100, kills: 800, deaths: 3, skills: { Mining: 75, Herbalism: 40 } }], ['bb', { quests: 10, kills: 50, deaths: 0, skills: {} }]]) });
r = run([withStats('Aa', 'Jelle', 14, { quests: 112, kills: 885, deaths: 4 }, { Mining: 80, Herbalism: 40 }), withStats('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0 }, {})], [], snapPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.equal(m.length, 1, 'only Jelle has a level up');
assert.match(m[0].embed.description, /\*\*Aa\*\*\n📜 \+12 quests · ⚔️ \+85 kills · 💀 \+1 death\n🔨 Mining 75 → \*\*80\*\*/);
assert.ok(!/Herbalism/.test(m[0].embed.description), 'a skill that did not change is not shown');
// the numbers of the player with the message are remembered after posting; those without news right away
assert.deepEqual(m[0].commit.snaps.find((x) => x.key === 'aa'), { key: 'aa', level: 14, quests: 112, kills: 885, deaths: 4, camps: null, xp: null, skills: { Mining: 80, Herbalism: 40 }, gear: null });
assert.deepEqual(r.quietSnaps.map((x) => x.key), ['bb']);
// a character with only an alt that played (no level up): other characters of the player show up in the same recap
r = run([withStats('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3 }, { Mining: 75, Herbalism: 40 }), withStats('Cc', 'Jelle', 8, { quests: 30, kills: 90, deaths: 2 }, {}, 'Alt'), withStats('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0 }, {})], [], { ...snapPrev(), levels: new Map([['aa', 12], ['bb', 30], ['cc', 8]]), snaps: new Map([...snapPrev().snaps, ['cc', { quests: 20, kills: 60, deaths: 2, skills: {} }]]) });
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /\*\*Aa\*\*\n⬆️ \+2 levels \(12 → \*\*14\*\*\)\n\n\*\*Cc\*\*\n📜 \+10 quests · ⚔️ \+30 kills/);
// no earlier numbers (first run after the update): no numbers in the recap, but they are remembered
r = run([withStats('Aa', 'Jelle', 14, { quests: 112, kills: 885, deaths: 4 }, { Mining: 80 })], [], prev());
m = r.messages.filter((x) => x.kind === 'player');
assert.ok(!/📜|⚔️|💀|🔨/.test(m[0].embed.description));
assert.equal(m[0].commit.snaps[0].quests, 112);
// a character the game does not know (no stats): nothing is compared or remembered
r = run([ch('Aa', 'Jelle', 14), ch('Bb', 'Tinus', 30)], [], snapPrev());
assert.equal(r.quietSnaps.length, 0);
assert.deepEqual(r.messages.filter((x) => x.kind === 'player')[0].commit.snaps, []);
// characterFrom hands over the game's numbers and skills (the table's skills are not compared: only the API's)
const g1 = characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [], status: 'Main' }, { status: 'ok', level: 22, stats: { quests: 5, kills: 6, deaths: 7, fish: 1 }, professions: [{ name: 'Herbalism', skill: 80, kind: 'primary' }] });
assert.deepEqual(g1.stats, { quests: 5, kills: 6, deaths: 7, fish: 1 });
assert.deepEqual(g1.skills, { Herbalism: 80 });
assert.equal(characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [{ name: 'Mining', skill: 5, kind: 'primary' }], status: 'Main' }, null).skills, null);

// 11. gear (armor) is not part of the recap any more (9 nov, Jelle); the worn items are still remembered
const wear = (...ids) => ids.map((id) => ({ id, name: `Item ${id}` }));
const gearPrev = () => ({ ...prev(), snaps: new Map([['aa', { quests: 100, kills: 800, deaths: 3, skills: {}, gear: [1, 2, 3, 4] }]]) });
const withGear = (level, gear) => ({ ...withStats('Aa', 'Jelle', level, { quests: 100, kills: 800, deaths: 3 }, {}), gear });
r = run([withGear(14, wear(1, 2, 9, 10))], [], gearPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.ok(!/🛡️|gear/i.test(m[0].embed.description), 'new gear is not shown');
// the game gave no gear this time (failed call): nothing is compared and the earlier list is kept
r = run([withGear(14, null)], [], gearPrev());
assert.ok(!/🛡️/.test(r.messages[0].embed.description));
assert.deepEqual(r.messages[0].commit.snaps[0].gear, [1, 2, 3, 4]);
// no earlier gear (first run with this feature): remembered, not shown
r = run([withGear(14, wear(1, 2))], [], snapPrev());
assert.ok(!/🛡️/.test(r.messages[0].embed.description));
assert.deepEqual(r.messages[0].commit.snaps.find((x) => x.key === 'aa').gear, [1, 2]);
// characterFrom hands over the worn items (an empty list from the game counts as unknown)
const g2 = characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [], status: 'Main' }, { status: 'ok', level: 22, stats: {}, equipment: [{ slot: 'HEAD', id: 5, name: 'Cap', quality: 2 }] });
assert.deepEqual(g2.gear, [{ id: 5, name: 'Cap' }]);
assert.equal(characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [], status: 'Main' }, { status: 'ok', level: 22, equipment: [] }).gear, null);

// 12. campfires and XP per session (XP = the levels completed in between + the XP inside the level; a counter the earlier snapshot did not have shows nothing yet)
assert.equal(totalXp(1, 0), 0); assert.equal(totalXp(2, 100), 500); assert.equal(totalXp(19, 3427), XP_TO_NEXT.slice(0, 18).reduce((x, y) => x + y, 0) + 3427);
assert.equal(totalXp(null, 5), null); assert.equal(totalXp(10, null), null);
const lvXp = (name, player, level, stats, xp, status = 'Main') => ({ ...withStats(name, player, level, stats, {}, status), xp });
const xpPrev = () => ({ ...prev(), snaps: new Map([['aa', { quests: 100, kills: 800, deaths: 3, camps: 4, xp: totalXp(12, 5000), skills: {}, gear: null }], ['cc', { quests: 20, kills: 60, deaths: 2, camps: 0, xp: totalXp(8, 100), skills: {}, gear: null }]]), levels: new Map([['aa', 12], ['bb', 30], ['cc', 8]]) });
// level up from 12 to 14 and 2 more campfires: XP left in level 12, all of level 13 + the 700 into level 14, that is (10100 - 5000) + 11400 + 700
r = run([lvXp('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3, camps: 6 }, 700), withStats('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0 }, {})], [], xpPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /### 📊 This session\n✨ \+17,200 XP · ⬆️ \+2 levels \(12 → \*\*14\*\*\) · \*\*Total level 14\*\*\n\n\*\*Aa\*\*\n🔥 \+2 campfires/);
assert.equal(m[0].commit.snaps.find((x) => x.key === 'aa').camps, 6);
assert.equal(m[0].commit.snaps.find((x) => x.key === 'aa').xp, totalXp(14, 700));
// two characters with XP: a total line; one campfire is singular
r = run([lvXp('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3, camps: 5 }, 700), lvXp('Cc', 'Jelle', 8, { quests: 20, kills: 60, deaths: 2, camps: 0 }, 1100, 'Alt')], [], xpPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /🔥 \+1 campfire\n/);
assert.match(m[0].embed.description, /\*\*Cc\*\*\n✨ \+1,000 XP/);
assert.match(m[0].embed.description, /### 📊 This session\n✨ \+18,200 XP · ⬆️ \+2 levels \(20 → \*\*22\*\*\) · \*\*Total level 22\*\*/);
// no campfire / XP numbers in the earlier snapshot (first run with this feature): nothing shown, but remembered
r = run([lvXp('Aa', 'Jelle', 14, { quests: 112, kills: 800, deaths: 3, camps: 9 }, 700)], [], snapPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.ok(!/🔥|✨/.test(m[0].embed.description));
assert.equal(m[0].commit.snaps[0].camps, 9); assert.equal(m[0].commit.snaps[0].xp, totalXp(14, 700));
// a failed call (no XP this time) keeps the earlier XP, a character without XP in the API is not compared
r = run([withStats('Aa', 'Jelle', 14, { quests: 101, kills: 800, deaths: 3, camps: 4 }, {})], [], xpPrev());
assert.equal(r.messages.filter((x) => x.kind === 'player')[0].commit.snaps[0].xp, totalXp(12, 5000));
// characterFrom hands over the XP of the API
assert.equal(characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [], status: 'Main' }, { status: 'ok', level: 22, xp: 321, stats: {} }).xp, 321);
assert.equal(characterFrom({ name: 'Aa', player_name: 'Jelle', level: 10, professions: [], status: 'Main' }, null).xp, null);

// 13. the totals line: levels gained, XP gained and the total level (all characters of the player added up); no totals of XP
r = run([lvXp('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3, camps: 4 }, 700), lvXp('Cc', 'Jelle', 9, { quests: 20, kills: 60, deaths: 2, camps: 0 }, 150, 'Alt')], [], { ...xpPrev(), levels: new Map([['aa', 12], ['bb', 30], ['cc', 8]]) });
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /\*\*Aa\*\*\n⬆️ \+2 levels \(12 → \*\*14\*\*\) · ✨ \+17,200 XP/);
assert.match(m[0].embed.description, /\*\*Cc\*\*\n⬆️ \+1 level \(8 → \*\*9\*\*\) · ✨ \+5,450 XP/);
assert.match(m[0].embed.description, /### 📊 This session\n✨ \+22,650 XP · ⬆️ \+3 levels \(20 → \*\*23\*\*\) · \*\*Total level 23\*\*/);
assert.ok(!/total xp/i.test(m[0].embed.description), 'the XP of the whole character is never shown');
// only an achievement (no level up): the line has just the total level
const achOnly = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], [], { ...prev(), levels: new Map([['aa', 12], ['bb', 30]]), known: new Set(), players: new Set(['Jelle', 'Tinus', '']) });
const achMsg = achOnly.messages.find((x) => x.kind === 'player' && x.player === 'Jelle');
if (achMsg) assert.match(achMsg.embed.description, /### 📊 This session\n\*\*Total level 12\*\*/);

// 13. Dag Dinky and Week Dinky: one message for the whole guild, players alphabetical, top 3 per stat, nobody without activity
const pc = (name, player, level, xp, stats, skills = {}, status = 'Main') => ({ ...withStats(name, player, level, stats, skills, status), xp });
const baseSnap = (level, xp, quests, kills, deaths, camps, boss, skills = {}) => ({ level, xp: totalXp(level, xp), quests, kills, deaths, camps, boss, skills });
const periodRun = (kind, chars, base, extra = {}) => {
  const data = { characters: chars, blizzard, donations: [], overrides: [], gameTotals: gameTotalsFrom(blizzard) };
  const players = [...new Set(chars.filter((c) => c.status !== 'Gestopt').map((c) => c.player))];
  const guild = core.guildMeters(data, players);
  const states = new Map(players.map((p) => [p, core.evaluate(data, p, guild)]));
  return planPeriod({ kind, core, chars, states, base, today: '2026-11-09', since: '2026-11-02', prevXp: 0, discord: new Map(), ...extra });
};
const noAch = (chars) => ({ chars: new Map(chars), ach: new Map() });
const pbase = () => {
  const b = noAch([['pa', baseSnap(25, 0, 100, 1000, 2, 1, 0, { Mining: 75 })], ['pb', baseSnap(10, 0, 20, 100, 0, 0, 0)], ['ha', baseSnap(31, 0, 300, 4000, 5, 2, 1)], ['ja', baseSnap(20, 100, 50, 500, 1, 0, 0)]]);
  return b;
};
const pnow = () => [
  pc('Pa', 'Pim', 28, 500, { quests: 131, kills: 1410, deaths: 4, camps: 4, bossKills: 2 }, { Mining: 80 }),
  pc('Pb', 'Pim', 12, 50, { quests: 25, kills: 160, deaths: 0, camps: 0, bossKills: 0 }, {}, 'Alt'),
  pc('Ha', 'Henk', 33, 10, { quests: 324, kills: 4355, deaths: 10, camps: 3, bossKills: 2 }),
  pc('Ja', 'Justin', 20, 100, { quests: 50, kills: 500, deaths: 1, camps: 0, bossKills: 0 }), // did nothing
  pc('Ka', 'Jacco', 5, 0, undefined), // the game does not know him
];
r = periodRun('day', pnow(), pbase());
assert.equal(r.messages.length, 1);
let d = r.messages[0];
assert.equal(d.content, '@everyone The day in review 🌙');
assert.deepEqual(d.allowed, { parse: ['everyone'] });
assert.equal(d.embed.title, 'Dag Dinky · Sunday 8 November');
const text = d.embed.description;
assert.ok(text.indexOf('**Henk**') < text.indexOf('**Pim**'), 'players alphabetical');
assert.ok(!/Justin|Jacco/.test(text), 'a player without activity is left out');
assert.match(text, /### 🏅 Top 3 of the day\n/);
assert.match(text, /📜 \*\*Quests\*\* — 🥇 Pim 36 · 🥈 Henk 24/);
assert.match(text, /⬆️ \*\*Levels\*\* — 🥇 Pim \+5 · 🥈 Henk \+2/);
assert.match(text, /💀 \*\*Deaths\*\* — 🥇 Henk 5 · 🥈 Pim 2/);
assert.match(text, /🏰 \*\*Boss kills\*\* — 🥇 Pim 2 · 🥈 Henk 1/);
// one short line per player; all characters of a player are added up (alts included); under each other, alphabetical
assert.match(text, /### 👥 Everyone\n\*✨ XP[^\n]*\n\*\*Henk\*\* · ✨ 105,310 · ⬆️ \+2 · 📜 24 · ⚔️ 355 · 🏰 1 · 💀 5 · 🔥 1\n\*\*Pim\*\* · ✨ [\d,]+ · ⬆️ \+5 · 📜 36 · ⚔️ 470 · 🏰 2 · 💀 2 · 🔥 3 · 🔨 \+5\n\n### 🧮/);
assert.ok(!/↳|Mining/.test(text), 'no lines per character in the message');
assert.ok(/### 🧮 Guild total\n/.test(text) && /📜 60 quests/.test(text));
assert.ok(!/🛡️|gear/i.test(text));
// the starting point of the next period = the stats of now (all characters the game knows)
assert.deepEqual([...r.newBase.chars.keys()].sort(), ['ha', 'ja', 'pa', 'pb']);
assert.equal(r.newBase.chars.get('pa').quests, 131);
// nothing happened: no message, but the starting point still moves on
r = periodRun('day', [pc('Pa', 'Pim', 25, 0, { quests: 100, kills: 1000, deaths: 2, camps: 1, bossKills: 0 }, { Mining: 75 })], noAch([['pa', baseSnap(25, 0, 100, 1000, 2, 1, 0, { Mining: 75 })]]));
assert.equal(r.messages.length, 0);
assert.equal(r.newBase.chars.size, 1);
// the first run (no starting point): nothing posted
r = periodRun('day', pnow(), noAch([]));
assert.equal(r.messages.length, 0);
assert.equal(r.newBase.chars.size, 4);
// a counter the starting point did not have (boss kills before the Edge Function was redeployed): no difference yet
const oldBase = pbase(); for (const v of oldBase.chars.values()) { delete v.boss; }
r = periodRun('day', pnow(), oldBase);
assert.ok(!/Boss kills|\*\*Pim\*\* · [^\n]*🏰/.test(r.messages[0].embed.description));
// achievements since the previous post are listed per player
const achBase = pbase(); achBase.ach.set('Pim', new Set());
r = periodRun('day', pnow(), achBase);
assert.match(r.messages[0].embed.description, /\*\*Pim\*\* · [^\n]*🏆 \d/);
// the week: same layout, week number and dates in the title, trend against last week
r = periodRun('week', pnow(), pbase(), { prevXp: 1000 });
assert.equal(r.messages[0].embed.title, 'Week Dinky · week 45 (2 November – 8 November)');
assert.equal(r.messages[0].content, '@everyone The week in review 📅');
assert.match(r.messages[0].embed.description, /### 🏅 Top 3 of the week/);
assert.match(r.messages[0].embed.description, /\(▲ \d+% vs last week\)/);
// many players: split over several messages, @everyone only in the first, each within the Discord limit
const many = []; const manyBase = noAch([]);
for (let i = 0; i < 45; i++) { many.push(pc(`Char${i}`, `Player ${String(i).padStart(2, '0')}`, 20, 0, { quests: 50 + i, kills: 500 + i, deaths: 1, camps: 1, bossKills: 1 }, { Mining: 60 })); manyBase.chars.set(`char${i}`, baseSnap(18, 0, 10, 100, 0, 0, 0, { Mining: 50 })); }
r = periodRun('day', many, manyBase);
assert.ok(r.messages.length > 1, 'split');
assert.match(r.messages[0].embed.description, /💀 \*\*Deaths\*\* — 🥇 Player 00 1 · 🥇 Player 01 1 · 🥇 Player 02 1 · \+42 more/, 'a big tie is cut');
assert.equal(r.messages[0].allowed.parse[0], 'everyone');
assert.deepEqual(r.messages[1].allowed, { parse: [] });
assert.equal(r.messages[1].content, '');
assert.match(r.messages[0].embed.title, /\(1\/\d\)$/);
for (const x of r.messages) assert.ok(x.embed.description.length < 4096);
assert.match(r.messages[r.messages.length - 1].embed.description, /### 🧮 Guild total/);

// the first Week Dinky: everything since the launch (level 1, skills at 1, all achievements)
const lb = launchBase(pnow());
assert.deepEqual([...lb.chars.keys()].sort(), ['ha', 'ja', 'pa', 'pb']);
assert.deepEqual(lb.chars.get('pa'), { level: 1, xp: 0, quests: 0, kills: 0, deaths: 0, camps: 0, boss: 0, skills: { Mining: 1 } });
r = periodRun('week', pnow(), lb, { since: LAUNCH_DAY });
assert.equal(r.messages[0].embed.title, 'Week Dinky · week 45 (5 November – 8 November)');
assert.match(r.messages[0].embed.description, /\*\*Pim\*\* · ✨ [\d,]+ · ⬆️ \+38 /, 'levels since the launch: 2 characters from level 1 to 28 and 12');
assert.match(r.messages[0].embed.description, /🔨 \+79/, 'skills since the launch (1 → 80)');
assert.match(r.messages[0].embed.description, /\*\*Justin\*\*/, 'everybody who did something since the launch is in');
assert.match(r.messages[0].embed.description, /🏆 \d/, 'achievements since the launch');

// 14. when are they posted (Dutch time, the first run from 00:07)
const at = (iso) => localParts(new Date(iso));
assert.deepEqual(at('2026-11-09T23:30:00Z'), { date: '2026-11-10', minutes: 30, weekday: 'Tue' }); // winter time
assert.deepEqual(at('2026-07-05T22:10:00Z'), { date: '2026-07-06', minutes: 10, weekday: 'Mon' }); // summer time
assert.equal(periodDue('day', null, at('2026-11-09T12:00:00Z')), 'init');
assert.equal(periodDue('day', { date: '2026-11-08' }, at('2026-11-08T23:05:00Z')), null, 'same day');
assert.equal(periodDue('day', { date: '2026-11-08' }, at('2026-11-08T23:02:00Z')), null, 'before 00:07');
assert.equal(periodDue('day', { date: '2026-11-08' }, at('2026-11-08T23:07:00Z')), 'post');
assert.equal(periodDue('day', { date: '2026-11-09' }, at('2026-11-09T23:07:00Z')), 'post');
assert.equal(periodDue('day', { date: '2026-11-10' }, at('2026-11-10T08:00:00Z')), null, 'already posted today');
assert.equal(periodDue('week', { date: '2026-11-02' }, at('2026-11-09T23:12:00Z')), null, 'Tuesday');
assert.equal(periodDue('week', { date: '2026-11-02' }, at('2026-11-08T23:12:00Z')), 'post', 'Monday 00:12');
assert.equal(periodDue('week', { date: '2026-11-09' }, at('2026-11-09T09:00:00Z')), null, 'once a week');
assert.equal(addDays('2026-11-01', -1), '2026-10-31');
assert.equal(isoWeek('2026-11-08'), 45);
assert.equal(isoWeek('2026-11-09'), 46);
assert.equal(isoWeek('2027-01-03'), 53);

console.log('Ding Dinky tests: all passed');
