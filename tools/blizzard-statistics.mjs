// Prints every in-game statistic the Blizzard API gives for one WoW: Forever character: category, id, name and quantity.
// Used to find the ids of statistics we want to show (critters killed, deaths by cause, emotes, consumables, gold ...).
// Runs only by hand: "Blizzard statistics" workflow (.github/workflows/blizzard-statistics.yml). Prints no secrets, writes no files.
//   BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET   required
//   CHARACTER   e.g. "Bunte Bapsimus"      REGION   eu | us | kr | tw (default eu)
const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
const region = (process.env.REGION || 'eu').toLowerCase();
const character = (process.env.CHARACTER || '').trim();
if (!id || !secret || !character) { console.error('Set BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET and CHARACTER.'); process.exit(1); }
const tokenRes = await fetch('https://oauth.battle.net/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
if (!tokenRes.ok) { console.error(`Token request failed: ${tokenRes.status}`); process.exit(1); }
const { access_token: token } = await tokenRes.json();
const key = character.toLowerCase().replace(/\s+/g, '-');
// Which fields does the character summary have (is there an experience / XP value?). Prints names and the numbers among them only.
const sumRes = await fetch(`https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(key)}?namespace=profile-forever-${region}&locale=en_US`, { headers: { Authorization: `Bearer ${token}` } });
if (sumRes.ok) {
  const sum = await sumRes.json();
  console.log(`Summary fields: ${Object.keys(sum).filter((k) => !k.startsWith('_')).join(', ')}`);
  for (const [k, v] of Object.entries(sum)) if (typeof v === 'number') console.log(`Summary number: ${k} = ${v}`);
} else console.log(`Summary of ${character}: HTTP ${sumRes.status}`);
// Other things we may show: what is in the summary besides numbers, and do /achievements and /titles exist for Forever?
if (sumRes.ok) {
  const sum = await sumRes.clone().json();
  for (const k of ['gender', 'faction', 'guild', 'race', 'character_class']) console.log(`Summary ${k}: ${sum[k] ? JSON.stringify(sum[k].name ?? sum[k]) : '(none)'}`);
  for (const k of ['achievements', 'titles', 'pvp_summary', 'encounters']) console.log(`Summary ${k}: ${sum[k] ? JSON.stringify(sum[k]).slice(0, 160) : '(none)'}`);
}
for (const part of ['achievements', 'titles']) {
  const r = await fetch(`https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(key)}/${part}?namespace=profile-forever-${region}&locale=en_US`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { console.log(`/${part}: HTTP ${r.status}`); continue; }
  const b = await r.json();
  console.log(`/${part}: fields ${Object.keys(b).filter((k) => !k.startsWith('_')).join(', ')}`);
  for (const [k, v] of Object.entries(b)) if (typeof v === 'number') console.log(`/${part} number: ${k} = ${v}`);
  const list = b.achievements ?? b.titles ?? [];
  console.log(`/${part}: ${list.length} entries${list[0] ? `, first: ${JSON.stringify(list[0]).slice(0, 200)}` : ''}`);
}
const res = await fetch(`https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(key)}/achievements/statistics?namespace=profile-forever-${region}&locale=en_US`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) { console.error(`Statistics of ${character}: HTTP ${res.status}`); process.exit(1); }
const body = await res.json();
let count = 0;
const show = (s, path) => { count += 1; console.log(`${path} | id ${s.id} | ${s.name} | ${s.quantity}`); };
for (const c of body.categories ?? []) {
  for (const s of c.statistics ?? []) show(s, c.name);
  for (const sub of c.sub_categories ?? []) for (const s of sub.statistics ?? []) show(s, `${c.name} > ${sub.name}`);
}
console.log(`\n${count} statistics for ${character} (only the ones the game has counted so far are listed by the API).`);
