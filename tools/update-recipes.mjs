// Builds data/recipes.json: every recipe of every profession in WoW: Forever (Blizzard game data, static-forever-<region>) with the item
// it makes and its reagents. With the recipes each character knows (field `recipes` per profession in blizzard_characters, from the Edge
// Function update-characters every 5 minutes) the site answers "Who can make this?" (js/recipes.js: Professions, Market, character page).
// Runs in GitHub Actions (see .github/workflows/recipes.yml), daily and by hand. Node 20+, no dependencies. Prints no secrets.
// Local test: node --env-file=<your private .env outside the project> tools/update-recipes.mjs
//
// data/recipes.json = { updated, recipes: { <recipe id>: { n: name, p: profession, c: category, i: crafted item id or null,
//                                                          q: how many it makes, r: [[reagent item id, quantity, reagent name], ...] } } }
import { writeFileSync } from 'node:fs';

const OUT = 'data/recipes.json';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One call; a link from the API keeps its own namespace, a plain path gets static-forever-<region>. Null on a 404.
async function get(pathOrUrl) {
  const url = new URL(pathOrUrl, `https://${region}.api.blizzard.com`);
  if (!url.searchParams.has('namespace')) url.searchParams.set('namespace', `static-forever-${region}`);
  url.searchParams.set('locale', 'en_US');
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) { await sleep(attempt * 1000); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.pathname}`);
    return res.json();
  }
  throw new Error(`Gave up on ${url.pathname}`);
}

// 1. Which recipes exist: profession → skill tier → categories → recipes.
const list = []; // [{ id, name, profession, category }]
const index = await get('/data/wow/profession/index');
for (const prof of index?.professions ?? []) {
  if (/\[DNT\]|test/i.test(prof.name)) continue; // Blizzard's own test profession
  const detail = await get(prof.key.href);
  for (const tier of detail?.skill_tiers ?? []) {
    const t = await get(tier.key.href);
    for (const cat of t?.categories ?? []) for (const r of cat.recipes ?? []) list.push({ id: r.id, name: r.name, profession: prof.name, category: cat.name });
  }
  console.log(`${prof.name}: ${list.filter((r) => r.profession === prof.name).length} recipes`);
}
if (list.length < 500) throw new Error(`Only ${list.length} recipes: not writing ${OUT}`);

// 2. Per recipe: the item it makes and the reagents (a few at a time, well under the API limit of 100 calls per second).
const recipes = {};
let next = 0;
async function worker() {
  while (next < list.length) {
    const r = list[next++];
    const d = await get(`/data/wow/recipe/${r.id}`);
    recipes[r.id] = {
      n: r.name, p: r.profession, c: r.category,
      i: d?.crafted_item?.id ?? d?.alliance_crafted_item?.id ?? d?.horde_crafted_item?.id ?? null,
      q: d?.crafted_quantity?.value ?? d?.crafted_quantity?.minimum ?? 1,
      r: (d?.reagents ?? []).map((x) => [x.reagent?.id ?? null, x.quantity ?? 1, x.reagent?.name ?? '?']),
    };
    await sleep(20);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(OUT, `${JSON.stringify({ updated: new Date().toISOString(), recipes })}\n`);
console.log(`Wrote ${OUT}: ${Object.keys(recipes).length} recipes, ${Object.values(recipes).filter((r) => r.i).length} with an item`);
