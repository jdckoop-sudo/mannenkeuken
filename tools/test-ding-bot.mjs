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
const { plan, planPeriod, launchBase, LAUNCH_DAY, periodDue, localParts, addDays, isoWeek, characterFrom, gameTotalsFrom, totalXp, XP_TO_NEXT, dungeonRuns, levelBar } = await import(join(dir, 'ding.mjs'));
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
assert.match(m[0].content, /^<@123456789012345678> played Aa:$/, 'the head line names the characters that were played');
assert.equal(m[0].embed.title, '🎉 Aa reached level 15!');
assert.equal(m[0].embed.footer.text, 'Jelle · player level 23 (all characters)', 'the player level (Aa 15 + Cc 8) is only in the footer');
assert.deepEqual(m[0].allowed, { users: ['123456789012345678'] });
assert.match(m[0].embed.description, /^\*\*Aa\*\*\n⬆️ Level 12 → \*\*15\*\*/, 'the character level is the head line');
assert.ok(!/Total level|This session/.test(m[0].embed.description), 'no total level in the recap itself');
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
assert.match(tinus.embed.description, /⬆️ Level 30 → \*\*31\*\*/);

// 6. quit characters count for nothing; a level that goes down posts nothing
r = run([ch('Aa', 'Jelle', 10), ch('Bb', 'Tinus', 31, 'Gestopt')], [], prev());
assert.equal(r.messages.length, 0);

// 7. donated gold and guild goals are not announced at all (14 Nov 2026, Jelle: only after a session, end of the day, end of the week); they are remembered
const donations = [{ player_name: 'Jelle', copper: 120 * GOLD }, { player_name: 'Tinus', copper: 90 * GOLD }];
r = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], donations, prev());
assert.equal(r.messages.length, 0, 'no guild message and no message for a donation');
assert.ok(r.baseline.known.some((k) => k.player === '' && k.id === 'd7'), 'the guild goal is remembered');
assert.ok(r.baseline.known.some((k) => k.player === 'Tinus' && core.BY_ID.get(k.id).meter === 'donated'), 'the donation achievement is remembered');
// also together with a session: the recap does not mention them
r = run([ch('Aa', 'Jelle', 13), ch('Bb', 'Tinus', 30)], donations, prev());
assert.equal(r.messages.length, 1);
assert.ok(!r.messages[0].embed.description.includes('Full Vault') && !/Achievements/.test(r.messages[0].embed.description));

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
assert.match(m[0].embed.description, /\*\*Aa\*\*\n⬆️ Level 12 → \*\*14\*\*\n📜 \+12 quests · ⚔️ \+85 kills · 💀 \+1 death\n🔨 Mining 75 → \*\*80\*\*/);
assert.ok(!/Herbalism/.test(m[0].embed.description), 'a skill that did not change is not shown');
// the numbers of the player with the message are remembered after posting; those without news right away
assert.deepEqual(m[0].commit.snaps.find((x) => x.key === 'aa'), { key: 'aa', level: 14, quests: 112, kills: 885, deaths: 4, camps: null, xp: null, skills: { Mining: 80, Herbalism: 40 }, gear: null, dd: null, bosses: null });
assert.deepEqual(r.quietSnaps.map((x) => x.key), ['bb']);
// a character with only an alt that played (no level up): other characters of the player show up in the same recap
r = run([withStats('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3 }, { Mining: 75, Herbalism: 40 }), withStats('Cc', 'Jelle', 8, { quests: 30, kills: 90, deaths: 2 }, {}, 'Alt'), withStats('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0 }, {})], [], { ...snapPrev(), levels: new Map([['aa', 12], ['bb', 30], ['cc', 8]]), snaps: new Map([...snapPrev().snaps, ['cc', { quests: 20, kills: 60, deaths: 2, skills: {} }]]) });
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /\*\*Aa\*\*\n⬆️ Level 12 → \*\*14\*\*\n\n\*\*Cc\*\*\nLevel \*\*8\*\*\n📜 \+10 quests · ⚔️ \+30 kills/);
assert.equal(m[0].content, '**Jelle** played Aa and Cc:');
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
assert.match(m[0].embed.description, /^\*\*Aa\*\*\n⬆️ Level 12 → \*\*14\*\*\n▰▱▱▱▱▱▱▱▱▱ 5% to level 15\n✨ \+17,200 XP · 🔥 \+2 campfires/);
assert.equal(m[0].embed.footer.text, 'Jelle · player level 14 (all characters) · +17,200 XP this session');
assert.equal(m[0].commit.snaps.find((x) => x.key === 'aa').camps, 6);
assert.equal(m[0].commit.snaps.find((x) => x.key === 'aa').xp, totalXp(14, 700));
// two characters with XP: a total line; one campfire is singular
r = run([lvXp('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3, camps: 5 }, 700), lvXp('Cc', 'Jelle', 8, { quests: 20, kills: 60, deaths: 2, camps: 0 }, 1100, 'Alt')], [], xpPrev());
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /🔥 \+1 campfire\n/);
assert.match(m[0].embed.description, /\*\*Cc\*\*\nLevel \*\*8\*\*\n▰▰▱▱▱▱▱▱▱▱ 20% to level 9\n✨ \+1,000 XP/);
assert.equal(m[0].embed.footer.text, 'Jelle · player level 22 (all characters) · +18,200 XP this session');
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
assert.match(m[0].embed.description, /\*\*Aa\*\*\n⬆️ Level 12 → \*\*14\*\*\n[▰▱]+ \d+% to level 15\n✨ \+17,200 XP/);
assert.match(m[0].embed.description, /\*\*Cc\*\*\n⬆️ Level 8 → \*\*9\*\*\n[▰▱]+ \d+% to level 10\n✨ \+5,450 XP/);
assert.equal(m[0].embed.title, '🎉 Aa reached level 14! 🎉 Cc reached level 9!');
assert.equal(m[0].embed.footer.text, 'Jelle · player level 23 (all characters) · +22,650 XP this session');
assert.ok(!/total xp/i.test(m[0].embed.description), 'the XP of the whole character is never shown');
// only an achievement (no level up): the line has just the total level
const achOnly = run([ch('Aa', 'Jelle', 12), ch('Bb', 'Tinus', 30)], [], { ...prev(), levels: new Map([['aa', 12], ['bb', 30]]), known: new Set(), players: new Set(['Jelle', 'Tinus', '']) });
const achMsg = achOnly.messages.find((x) => x.kind === 'player' && x.player === 'Jelle');
if (achMsg) { assert.equal(achMsg.embed.footer.text, 'Jelle · player level 12 (all characters)'); assert.equal(achMsg.embed.title, 'Session recap'); }

// 13. Dag Dinky and Week Dinky: one message for the whole guild, players alphabetical, top 3 per stat, nobody without activity
const pc = (name, player, level, xp, stats, skills = {}, status = 'Main') => ({ ...withStats(name, player, level, stats, skills, status), xp });
const baseSnap = (level, xp, quests, kills, deaths, camps, boss, skills = {}, extra = {}) => ({ level, xp: totalXp(level, xp), quests, kills, deaths, camps, boss, skills, ...extra });
const VC = 'Edwin VanCleef (Deadmines)'; const WC = 'Mutanus the Devourer (Wailing Caverns)';
const periodRun = (kind, chars, base, extra = {}) => {
  const data = { characters: chars, blizzard, donations: [], overrides: [], gameTotals: gameTotalsFrom(blizzard) };
  const players = [...new Set(chars.filter((c) => c.status !== 'Gestopt').map((c) => c.player))];
  const guild = core.guildMeters(data, players);
  const states = new Map(players.map((p) => [p, core.evaluate(data, p, guild)]));
  return planPeriod({ kind, core, chars, states, base, today: '2026-11-09', since: '2026-11-02', prevXp: 0, discord: new Map(), ...extra });
};
const noAch = (chars) => ({ chars: new Map(chars), ach: new Map() });
const pbase = () => {
  const b = noAch([['pa', baseSnap(25, 0, 100, 1000, 2, 1, 0, { Mining: 75 }, { dd: 0, bosses: { [VC]: 1 } })], ['pb', baseSnap(10, 0, 20, 100, 0, 0, 0)], ['ha', baseSnap(31, 0, 300, 4000, 5, 2, 1, {}, { dd: 1, bosses: { [VC]: 2 } })], ['ja', baseSnap(20, 100, 50, 500, 1, 0, 0)]]);
  return b;
};
const pnow = () => [
  pc('Pa', 'Pim', 28, 500, { quests: 131, kills: 1410, deaths: 4, camps: 4, bossKills: 2, dungeonDeaths: 1, bosses: { [VC]: 2, [WC]: 1 } }, { Mining: 80 }),
  pc('Pb', 'Pim', 12, 50, { quests: 25, kills: 160, deaths: 0, camps: 0, bossKills: 0 }, {}, 'Alt'),
  pc('Ha', 'Henk', 33, 10, { quests: 324, kills: 4355, deaths: 10, camps: 3, bossKills: 2, dungeonDeaths: 4, bosses: { [VC]: 3 } }),
  pc('Ja', 'Justin', 20, 100, { quests: 50, kills: 500, deaths: 1, camps: 0, bossKills: 0 }), // did nothing
  pc('Ka', 'Jacco', 5, 0, undefined), // the game does not know him
];
const all = (res) => res.messages.map((x) => x.embed.description).join('\n');
r = periodRun('day', pnow(), pbase());
assert.equal(r.messages.length, 2, 'two separate messages: top 3 + guild total, and the players');
let d = r.messages[0];
assert.equal(d.content, '@everyone The day in review 🌙');
assert.deepEqual(d.allowed, { parse: ['everyone'] });
assert.equal(d.embed.title, 'Dag Dinky · Sunday 8 November');
const text = all(r);
assert.ok(/### 🏅 Top 3 of the day/.test(d.embed.description) && /### 🧮 Guild total/.test(d.embed.description) && !/Everyone/.test(d.embed.description), 'message 1 = top 3 + guild total');
assert.match(r.messages[1].embed.description, /^### 👥 Everyone\n/);
assert.equal(r.messages[1].content, '');
assert.deepEqual(r.messages[1].allowed, { parse: [] });
assert.ok(!/🧮|🏅/.test(r.messages[1].embed.description), 'message 2 = only the players');
assert.ok(text.indexOf('**Henk**') < text.indexOf('**Pim**'), 'players alphabetical');
assert.ok(!/Justin|Jacco/.test(text), 'a player without activity is left out');
assert.match(text, /### 🏅 Top 3 of the day\n/);
assert.match(text, /📜 \*\*Quests\*\* — 🥇 Pim 36 · 🥈 Henk 24/);
assert.match(text, /⬆️ \*\*Levels\*\* — 🥇 Pim \+5 · 🥈 Henk \+2/);
assert.match(text, /💀 \*\*Deaths\*\* — 🥇 Henk 5 · 🥈 Pim 2/);
assert.match(text, /🏰 \*\*Dungeons completed\*\* — 🥇 Pim 2 · 🥈 Henk 1/);
assert.match(text, /☠️ \*\*Dungeon deaths\*\* — 🥇 Henk 3 · 🥈 Pim 1/);
assert.match(text, /🏰 3 dungeons completed \(Deadmines ×2 · Wailing Caverns\)/, 'the guild total names the dungeons');
// one short line per player; all characters of a player are added up (alts included); under each other, alphabetical
assert.match(r.messages[1].embed.description, /### 👥 Everyone\n\*✨ XP[^\n]*\n\*\*Henk\*\* · ✨ 105,310 · ⬆️ \+2 · 📜 24 · ⚔️ 355 · 🏰 1 · 💀 5 · ☠️ 3 · 🔥 1\n\*\*Pim\*\* · ✨ [\d,]+ · ⬆️ \+5 · 📜 36 · ⚔️ 470 · 🏰 2 · 💀 2 · ☠️ 1 · 🔥 3 · 🔨 \+5$/);
assert.ok(!/🏆/.test(r.messages[1].embed.description), 'no achievements per player');
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
// a counter the starting point did not have (dungeons before this version of the bot): no difference yet
const oldBase = pbase(); for (const v of oldBase.chars.values()) { delete v.boss; delete v.bosses; delete v.dd; }
r = periodRun('day', pnow(), oldBase);
assert.ok(!/Dungeons completed|Dungeon deaths|\*\*Pim\*\* · [^\n]*(🏰|☠️)/.test(all(r)));
// nobody did a dungeon: no dungeon lines at all (26 Nov 2026, Jelle)
const noDungeons = pbase(); for (const v of noDungeons.chars.values()) { v.bosses = { [VC]: 9 }; v.dd = 99; }
r = periodRun('day', pnow().map((c) => (c.stats ? { ...c, stats: { ...c.stats, bosses: { [VC]: 9 }, dungeonDeaths: 99 } } : c)), noDungeons);
assert.ok(!/🏰|☠️ \*\*|☠️ \d/.test(r.messages[0].embed.description), 'no dungeon lines in the top 3 and guild total');
// dungeonRuns: completed runs per dungeon; two counted bosses in one dungeon (Scarlet Monastery) count once; a boss new in the data = 0 before
assert.deepEqual(dungeonRuns({ [VC]: 3, 'Mograine (Scarlet Monastery)': 2, 'Whitemane (Scarlet Monastery)': 2 }, { [VC]: 1, 'Mograine (Scarlet Monastery)': 1, 'Whitemane (Scarlet Monastery)': 1 }), [{ name: 'Deadmines', n: 2 }, { name: 'Scarlet Monastery', n: 1 }]);
assert.deepEqual(dungeonRuns({ [VC]: 3 }, null), [], 'no earlier counters: no difference');
// the level bar
assert.equal(levelBar(14, 700), '▰▱▱▱▱▱▱▱▱▱ 5% to level 15');
assert.equal(levelBar(60, 0), '👑 Max level');
assert.equal(levelBar(30, null), '');
// Maand Dinky: posted on the 1st of the month (= the end of the month before)
assert.equal(periodDue('month', { date: '2026-11-26' }, { date: '2026-12-01', minutes: 8, weekday: 'Tue' }), 'post');
assert.equal(periodDue('month', { date: '2026-11-26' }, { date: '2026-11-30', minutes: 8, weekday: 'Mon' }), null);
assert.equal(periodDue('month', { date: '2026-12-01' }, { date: '2026-12-01', minutes: 30, weekday: 'Tue' }), null, 'once');
assert.equal(periodDue('month', { date: '2026-11-26' }, { date: '2026-12-01', minutes: 3, weekday: 'Tue' }), null, 'not before 00:07');
r = periodRun('month', pnow(), pbase(), { today: '2026-12-01', prevXp: 100000 });
assert.equal(r.messages[0].embed.title, 'Maand Dinky · November 2026');
assert.equal(r.messages[0].content, '@everyone The month in review 🗓️');
assert.match(r.messages[0].embed.description, /### 🏅 Top 3 of the month/);
assert.match(r.messages[0].embed.description, /% vs last month\)/);
// achievements since the previous post: only in the guild total (9 nov, Jelle: not per player)
const achBase = pbase(); achBase.ach.set('Pim', new Set());
r = periodRun('day', pnow(), achBase);
assert.match(r.messages[0].embed.description, /🏆 \d+ new achievement/);
assert.ok(!/🏆/.test(r.messages[1].embed.description));
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
assert.equal(r.messages[0].embed.title, 'Dag Dinky · Sunday 8 November');
assert.match(r.messages[1].embed.title, /\(1\/\d\)$/);
assert.deepEqual(r.messages.slice(2).map((x) => x.content), r.messages.slice(2).map(() => ''));
for (const x of r.messages) assert.ok(x.embed.description.length < 2700 && x.embed.description.split('\n').length <= 40, 'a message stays below the size where Discord cut the first Week Dinky off');
// nobody gets lost between the messages
for (let i = 0; i < 45; i++) assert.ok(r.messages.some((x) => x.embed.description.includes(`**Player ${String(i).padStart(2, '0')}**`)), `player ${i} is in a message`);
assert.match(r.messages[0].embed.description, /### 🧮 Guild total/);

// the first Week Dinky: everything since the launch (level 1, skills at 1, all achievements)
const lb = launchBase(pnow());
assert.deepEqual([...lb.chars.keys()].sort(), ['ha', 'ja', 'pa', 'pb']);
assert.deepEqual(lb.chars.get('pa'), { level: 1, xp: 0, quests: 0, kills: 0, deaths: 0, camps: 0, boss: 0, dd: 0, bosses: {}, skills: { Mining: 1 } });
r = periodRun('week', pnow(), lb, { since: LAUNCH_DAY });
assert.equal(r.messages[0].embed.title, 'Week Dinky · week 45 (5 November – 8 November)');
assert.match(all(r), /\*\*Pim\*\* · ✨ [\d,]+ · ⬆️ \+38 /, 'levels since the launch: 2 characters from level 1 to 28 and 12');
assert.match(all(r), /🔨 \+79/, 'skills since the launch (1 → 80)');
assert.match(all(r), /\*\*Justin\*\*/, 'everybody who did something since the launch is in');
assert.match(r.messages[0].embed.description, /🏆 \d+ new achievement/, 'achievements since the launch');

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

// Only after the log out (14 Nov 2026, Jelle): the guild roster shows a new level while the player is still online, the profile (XP, quests, kills) only after the log out.
// The bot looks at the level of the profile (profileLevel), so there is no level-only message in the middle of a session and the recap after the log out has everything.
{
  const row = { name: 'Aa', player_name: 'Jelle', level: 10, professions: [], status: 'Main' };
  const stale = { status: 'ok', level: 31, profileLevel: 30, xp: 500, stats: { quests: 100, kills: 900, deaths: 2, camps: 1 } }; // roster says 31, the profile is still the one of the last log out
  const fresh = { status: 'ok', level: 31, profileLevel: 31, xp: 1200, stats: { quests: 112, kills: 985, deaths: 3, camps: 2 } }; // after the log out
  assert.equal(characterFrom(row, stale).level, 30, 'the level of the profile counts, not the roster');
  assert.equal(characterFrom(row, { status: 'ok', level: 31 }).level, 31, 'data without profileLevel (older update-characters): as before');
  assert.equal(characterFrom(row, { status: 'guild', level: 4 }).level, 10, 'no profile yet: the table, as before');
  const before = { quests: 100, kills: 900, deaths: 2, camps: 1, xp: totalXp(30, 500), skills: null, gear: null };
  const p0 = () => ({ levels: new Map([['aa', 30]]), snaps: new Map([['aa', { ...before }]]), known: new Set(first.baseline.known.map((k) => `${k.player}|${k.id}`)), players: new Set(['Jelle', '']) });
  const base = () => { const s = p0(); const q = run([characterFrom(row, { ...stale, profileLevel: 30, level: 30 })], [], { ...s, known: new Set(), players: new Set() }); return new Set(q.baseline.known.map((k) => `${k.player}|${k.id}`)); };
  const known = base();
  const online = run([characterFrom(row, stale)], [], { ...p0(), known });
  assert.equal(online.messages.length, 0, 'still online (only the roster has the new level): nothing is posted');
  assert.equal(online.quietSnaps.find((x) => x.key === 'aa').xp, totalXp(30, 500), 'and the remembered XP stays the one of the profile');
  const out = run([characterFrom(row, fresh)], [], { ...p0(), known });
  const mine = out.messages.filter((m) => m.kind === 'player' && m.player === 'Jelle');
  assert.equal(mine.length, 1, 'after the log out: one recap');
  const text = mine[0].embed.description;
  assert.match(text, /⬆️ Level 30 → \*\*31\*\*/);
  assert.match(text, new RegExp(`\\+${(XP_TO_NEXT[29] - 500 + 1200).toLocaleString('en-GB')} XP`), 'the XP of the whole session, over the level up');
  assert.match(text, /\+12 quests · ⚔️ \+85 kills/);
}

// A recap after EVERY session (14 Nov 2026, Jelle), also without a level up or an achievement; nothing done = no message
{
  const st = (name, player, level, stats, xp, status = 'Main') => ({ ...ch(name, player, level, status), stats, skills: {}, xp });
  const before = () => ({ ...prev(), snaps: new Map([['aa', { quests: 100, kills: 800, deaths: 3, camps: 4, xp: totalXp(12, 5000), skills: {}, gear: null }], ['bb', { quests: 10, kills: 50, deaths: 0, camps: 0, xp: totalXp(30, 10), skills: {}, gear: null }]]) });
  let q = run([st('Aa', 'Jelle', 12, { quests: 103, kills: 840, deaths: 3, camps: 4 }, 6500), st('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0, camps: 0 }, 10)], [], before(), new Map([['Jelle', '123456789012345678']]));
  assert.equal(q.messages.length, 1, 'Jelle played, Tinus did not');
  assert.equal(q.messages[0].player, 'Jelle');
  assert.match(q.messages[0].embed.description, /^\*\*Aa\*\*\nLevel \*\*12\*\*\n▰▰▰▰▰▰▱▱▱▱ 64% to level 13\n✨ \+1,500 XP · 📜 \+3 quests · ⚔️ \+40 kills/);
  assert.equal(q.messages[0].embed.title, 'Session recap · Aa');
  assert.equal(q.messages[0].embed.footer.text, 'Jelle · player level 12 (all characters) · +1,500 XP this session');
  assert.match(q.messages[0].embed.url, /character\.html\?name=Aa$/, 'without an achievement the link goes to the character');
  assert.deepEqual(q.messages[0].commit.levels, []);
  assert.equal(q.messages[0].commit.snaps.find((x) => x.key === 'aa').kills, 840);
  assert.deepEqual(q.quietSnaps.map((x) => x.key), ['bb']);
  // logged in and out without doing anything: nothing
  q = run([st('Aa', 'Jelle', 12, { quests: 100, kills: 800, deaths: 3, camps: 4 }, 5000), st('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0, camps: 0 }, 10)], [], before());
  assert.equal(q.messages.length, 0);

  // an achievement a developer unlocked by hand waits for the next session of that player
  const forced = (chars, prevState) => {
    const data = { characters: chars, blizzard, donations: [], overrides: [{ achievement_id: 's5', player_name: 'Jelle', forced: 'unlocked' }], gameTotals: gameTotalsFrom(blizzard) };
    const players = [...new Set(chars.map((x) => x.player))]; const guild = core.guildMeters(data, players);
    return plan({ core, chars, states: new Map(players.map((p) => [p, core.evaluate(data, p, guild)])), prev: prevState, discord: new Map() });
  };
  q = forced([st('Aa', 'Jelle', 12, { quests: 100, kills: 800, deaths: 3, camps: 4 }, 5000)], before());
  assert.equal(q.messages.length, 0, 'no session: the unlocked achievement waits');
  assert.ok(!q.baseline.known.some((k) => k.id === 's5'), 'and is not marked as announced');
  q = forced([st('Aa', 'Jelle', 12, { quests: 101, kills: 800, deaths: 3, camps: 4 }, 5200)], before());
  assert.equal(q.messages.length, 1);
  assert.match(q.messages[0].embed.description, /Relentless/);
  assert.ok(q.messages[0].commit.known.some((k) => k.id === 's5'));
}

console.log('Ding Dinky tests: all passed');

// The recap with race and class, dungeons and dungeon deaths (26 Nov 2026, Jelle): the character level first, dungeons only when one was completed
{
  const VC2 = 'Edwin VanCleef (Deadmines)'; const WC2 = 'Mutanus the Devourer (Wailing Caverns)';
  const wd = (level, xp, stats) => ({ ...ch('Willem Drie', 'Mike', level, 'Alt'), race: 'Troll', class: 'Hunter', stats, skills: { Skinning: 41 }, xp });
  const before = { levels: new Map([['willem drie', 11], ['willem één', 54]]), known: new Set(), players: new Set(['Mike', '']),
    snaps: new Map([['willem drie', { quests: 46, kills: 242, deaths: 0, camps: 0, xp: totalXp(11, 2000), skills: { Skinning: 29 }, gear: null, dd: 0, bosses: {} }]]) };
  const main = { ...ch('Willem Één', 'Mike', 54), race: 'Orc', class: 'Warrior', stats: null };
  let q = run([main, wd(13, 4800, { quests: 54, kills: 302, deaths: 2, camps: 0, dungeonDeaths: 2, bosses: { [VC2]: 2, [WC2]: 1 } })], [], before, new Map([['Mike', '42']]));
  const msg = q.messages.find((x) => x.player === 'Mike');
  assert.equal(msg.content, '<@42> played Willem Drie:');
  assert.equal(msg.embed.title, '🎉 Willem Drie reached level 13!');
  assert.match(msg.embed.description, /^\*\*Willem Drie\*\* · Troll Hunter\n⬆️ Level 11 → \*\*13\*\*\n▰▰▰▰▱▱▱▱▱▱ 42% to level 14\n✨ \+[\d,]+ XP · 📜 \+8 quests · ⚔️ \+60 kills · 💀 \+2 deaths · ☠️ \+2 dungeon deaths\n🏰 3 dungeons completed: Deadmines ×2 · Wailing Caverns\n🔨 Skinning 29 → \*\*41\*\*(\n\n### 🏆 Achievements|$)/);
  assert.match(msg.embed.footer.text, /^Mike · player level 67 \(all characters\) · \+[\d,]+ XP this session$/);
  assert.equal(msg.commit.snaps.find((x) => x.key === 'willem drie').dd, 2);
  // no dungeon: no dungeon line and no dungeon deaths
  q = run([main, wd(11, 2500, { quests: 47, kills: 250, deaths: 0, camps: 0, dungeonDeaths: 0, bosses: {} })], [], before);
  assert.ok(!/🏰|☠️/.test(q.messages[0].embed.description));
}
console.log('Recap with dungeons: passed');
