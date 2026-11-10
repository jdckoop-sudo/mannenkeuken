// Builds data/talents.json: the shape of every talent tree in WoW: Forever (Blizzard game data, static-forever-<region>).
// The character page draws a character's talents in these trees (js/talents.js); which talents a character chose comes every
// 5 minutes from the Edge Function update-characters (field `talents` in blizzard_characters).
// Runs in GitHub Actions (see .github/workflows/talents.yml), daily and by hand. Node 20+, no dependencies. Prints no secrets.
// Local test: node --env-file=<your private .env outside the project> tools/update-talents.mjs
//
// data/talents.json = { updated, classes: { Paladin: [ { name: 'Holy', spec: 65, nodes: [node, ...] }, ... ], ... } }
// node = { id, row, col (1-4 inside its tree), max (ranks), lockedBy: [node ids], talent (talent id), name, spell (Wowhead spell id), ranks: [description per rank] }
import { writeFileSync } from 'node:fs';

const OUT = 'data/talents.json';
const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
const region = (process.env.REGION || 'eu').toLowerCase();
if (!id || !secret) { console.error('Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.'); process.exit(1); }

const tokenRes = await fetch('https://oauth.battle.net/token', {
  method: 'POST',
  headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
if (!tokenRes.ok) { console.error(`Token request failed: ${tokenRes.status}`); process.exit(1); }
const { access_token: token } = await tokenRes.json();

// One call; a link from the API keeps its own namespace, a plain path gets static-forever-<region>.
async function get(pathOrUrl) {
  const url = new URL(pathOrUrl, `https://${region}.api.blizzard.com`);
  if (!url.searchParams.has('namespace')) url.searchParams.set('namespace', `static-forever-${region}`);
  url.searchParams.set('locale', 'en_US');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, attempt * 1000)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.pathname}`);
    return res.json();
  }
  throw new Error(`Gave up on ${url.pathname}`);
}

const index = await get('/data/wow/talent-tree/index');
const classes = {};
for (const ref of index.spec_talent_trees ?? []) {
  const tree = await get(ref.key.href);
  // The game data holds a few stray copies of a talent that is already in the tree, at an impossible spot (seen 10 Nov 2026: Priest Holy row 33,
  // Hunter Marksmanship row 63, Hunter Survival column 157). Keep only spots inside the tree (7 rows of 4; a little room for more rows) and each talent once.
  const MAX_ROW = 11;
  const inRows = (tree.spec_talent_nodes ?? []).filter((n) => n.display_row >= 1 && n.display_row <= MAX_ROW);
  if (!inRows.length) continue;
  const minCol = Math.min(...inRows.map((n) => n.display_col));
  const seen = new Set();
  const list = inRows.filter((n) => n.display_col <= minCol + 3).sort((a, b) => a.display_row - b.display_row || a.display_col - b.display_col).filter((n) => {
    const talent = n.ranks?.[0]?.tooltip?.talent?.id;
    if (seen.has(talent)) return false;
    seen.add(talent);
    return true;
  });
  const nodes = list.map((n) => {
    const first = n.ranks?.[0]?.tooltip ?? {};
    return {
      id: n.id, row: n.display_row, col: n.display_col - minCol + 1, max: n.ranks?.length ?? 1, lockedBy: n.locked_by ?? [],
      talent: first.talent?.id ?? null, name: first.talent?.name ?? '?', spell: first.spell_tooltip?.spell?.id ?? null,
      ranks: (n.ranks ?? []).map((r) => r.tooltip?.spell_tooltip?.description ?? ''),
    };
  }).sort((a, b) => a.row - b.row || a.col - b.col);
  const cls = tree.playable_class?.name ?? '?';
  (classes[cls] ??= []).push({ name: tree.name, spec: tree.playable_specialization?.id ?? null, left: minCol, nodes });
  console.log(`${cls} / ${tree.name}: ${nodes.length} talents`);
}
// Trees in the game's order, left to right: the game places the three trees of a class side by side in one grid (e.g. columns 1-4, 7-10, 14-17).
for (const list of Object.values(classes)) { list.sort((a, b) => a.left - b.left); for (const t of list) delete t.left; }
if (Object.keys(classes).length < 5) throw new Error(`Only ${Object.keys(classes).length} classes: not writing ${OUT}`);
writeFileSync(OUT, `${JSON.stringify({ updated: new Date().toISOString(), classes })}\n`);
console.log(`Wrote ${OUT}: ${Object.keys(classes).length} classes`);
