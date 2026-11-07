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
const { plan, characterFrom, gameTotalsFrom, totalXp, XP_TO_NEXT } = await import(join(dir, 'ding.mjs'));
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
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ \+3 levels \(12 → \*\*15\*\*\)/);
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
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ \+2 levels \(12 → \*\*14\*\*\) · 📜 \+12 quests · ⚔️ \+85 kills · 💀 \+1 death · 🔨 Mining 75 → \*\*80\*\*/);
assert.ok(!/Herbalism/.test(m[0].embed.description), 'a skill that did not change is not shown');
// the numbers of the player with the message are remembered after posting; those without news right away
assert.deepEqual(m[0].commit.snaps.find((x) => x.key === 'aa'), { key: 'aa', level: 14, quests: 112, kills: 885, deaths: 4, camps: null, xp: null, skills: { Mining: 80, Herbalism: 40 }, gear: null });
assert.deepEqual(r.quietSnaps.map((x) => x.key), ['bb']);
// a character with only an alt that played (no level up): other characters of the player show up in the same recap
r = run([withStats('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3 }, { Mining: 75, Herbalism: 40 }), withStats('Cc', 'Jelle', 8, { quests: 30, kills: 90, deaths: 2 }, {}, 'Alt'), withStats('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0 }, {})], [], { ...snapPrev(), levels: new Map([['aa', 12], ['bb', 30], ['cc', 8]]), snaps: new Map([...snapPrev().snaps, ['cc', { quests: 20, kills: 60, deaths: 2, skills: {} }]]) });
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ \+2 levels \(12 → \*\*14\*\*\)\n\*\*Cc\*\* · 📜 \+10 quests · ⚔️ \+30 kills/);
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

// 11. new gear: items that were not worn in the previous run (by item id, so swapping two rings is nothing)
const wear = (...ids) => ids.map((id) => ({ id, name: `Item ${id}` }));
const gearPrev = () => ({ ...prev(), snaps: new Map([['aa', { quests: 100, kills: 800, deaths: 3, skills: {}, gear: [1, 2, 3, 4] }]]) });
const withGear = (level, gear) => ({ ...withStats('Aa', 'Jelle', level, { quests: 100, kills: 800, deaths: 3 }, {}), gear });
r = run([withGear(14, wear(1, 2, 9, 10))], [], gearPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /🛡️ 2 new gear pieces: Item 9, Item 10/);
r = run([withGear(14, wear(1, 2, 3, 9))], [], gearPrev());
assert.match(r.messages[0].embed.description, /🛡️ 1 new gear piece: Item 9/);
r = run([withGear(14, wear(4, 3, 2, 1))], [], gearPrev());
assert.ok(!/🛡️/.test(r.messages[0].embed.description), 'same items in other slots are not new');
r = run([withGear(14, wear(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))], [], gearPrev());
assert.match(r.messages[0].embed.description, /🛡️ 6 new gear pieces: Item 5, Item 6, Item 7, Item 8 \+2 more/);
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
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ \+2 levels \(12 → \*\*14\*\*\) · 🔥 \+2 campfires · ✨ \+17,200 XP/);
assert.equal(m[0].commit.snaps.find((x) => x.key === 'aa').camps, 6);
assert.equal(m[0].commit.snaps.find((x) => x.key === 'aa').xp, totalXp(14, 700));
// two characters with XP: a total line; one campfire is singular
r = run([lvXp('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3, camps: 5 }, 700), lvXp('Cc', 'Jelle', 8, { quests: 20, kills: 60, deaths: 2, camps: 0 }, 1100, 'Alt')], [], xpPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /🔥 \+1 campfire · /);
assert.match(m[0].embed.description, /\*\*Cc\*\* · ✨ \+1,000 XP/);
assert.match(m[0].embed.description, /📊 \*\*This session:\*\* ⬆️ \+2 levels · ✨ \+18,200 XP · \*\*Total level 22\*\*/);
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
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ \+2 levels \(12 → \*\*14\*\*\) · ✨ \+17,200 XP/);
assert.match(m[0].embed.description, /\*\*Cc\*\* · ⬆️ \+1 level \(8 → \*\*9\*\*\) · ✨ \+5,450 XP/);
assert.match(m[0].embed.description, /📊 \*\*This session:\*\* ⬆️ \+3 levels · ✨ \+22,650 XP · \*\*Total level 23\*\*/);
assert.ok(!/total xp/i.test(m[0].embed.description), 'the XP of the whole character is never shown');
// only an achievement (no level up): the line has just the total level
const achOnly = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], [], { ...prev(), levels: new Map([['aa', 12], ['bb', 30]]), known: new Set(), players: new Set(['Jelle', 'Tinus', '']) });
const achMsg = achOnly.messages.find((x) => x.kind === 'player' && x.player === 'Jelle');
if (achMsg) assert.match(achMsg.embed.description, /📊 \*\*Total level 12\*\*/);

console.log('Ding Dinky tests: all passed');
