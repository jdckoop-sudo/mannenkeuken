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
const { plan, characterFrom, gameTotalsFrom } = await import(join(dir, 'ding.mjs'));
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
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ level 12 → \*\*15\*\*/);
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
assert.match(tinus.embed.description, /level 30 → \*\*31\*\*/);

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
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ level 12 → \*\*14\*\* · 📜 \+12 quests · ⚔️ \+85 kills · 💀 \+1 death · 🔨 Mining 75 → \*\*80\*\*/);
assert.ok(!/Herbalism/.test(m[0].embed.description), 'a skill that did not change is not shown');
// the numbers of the player with the message are remembered after posting; those without news right away
assert.deepEqual(m[0].commit.snaps.find((x) => x.key === 'aa'), { key: 'aa', level: 14, quests: 112, kills: 885, deaths: 4, skills: { Mining: 80, Herbalism: 40 } });
assert.deepEqual(r.quietSnaps.map((x) => x.key), ['bb']);
// a character with only an alt that played (no level up): other characters of the player show up in the same recap
r = run([withStats('Aa', 'Jelle', 14, { quests: 100, kills: 800, deaths: 3 }, { Mining: 75, Herbalism: 40 }), withStats('Cc', 'Jelle', 8, { quests: 30, kills: 90, deaths: 2 }, {}, 'Alt'), withStats('Bb', 'Tinus', 30, { quests: 10, kills: 50, deaths: 0 }, {})], [], { ...snapPrev(), levels: new Map([['aa', 12], ['bb', 30], ['cc', 8]]), snaps: new Map([...snapPrev().snaps, ['cc', { quests: 20, kills: 60, deaths: 2, skills: {} }]]) });
m = r.messages.filter((x) => x.kind === 'player');
assert.match(m[0].embed.description, /\*\*Aa\*\* · ⬆️ level 12 → \*\*14\*\*\n\*\*Cc\*\* · 📜 \+10 quests · ⚔️ \+30 kills/);
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

console.log('Ding Dinky tests: all passed');
