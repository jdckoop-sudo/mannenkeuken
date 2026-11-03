// Downloads the WoW: Forever item list from wago.tools (game data per client build)
// and writes data/items.json (id, name, quality, item level, stack size) for the item search on the Trade Market.
// It also writes data/tradeable-items.json: the same list, but only items that can be traded between players
// (the Trade Market search uses that one). data/items.json keeps the full list of in-game items.
// Runs in GitHub Actions (see .github/workflows/items.yml). Node 20+, no dependencies.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'mannenkeuken-guild-site (daily item list update)' };
const OUT = 'data/items.json';
const TRADEABLE_OUT = 'data/tradeable-items.json';
// ItemSparse "Bonding": 0 none, 1 bind on pickup, 2 bind on equip, 3 bind on use, 4 quest item (5 = a few promo/quest items).
// Items are tradeable when they are not bound yet: none, bind on equip, bind on use.
const TRADEABLE_BONDING = [0, 2, 3];
const TRADEABLE_RULE = `Bonding in ${TRADEABLE_BONDING.join(',')}`;

async function get(url, type = 'text') {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return type === 'json' ? res.json() : res.text();
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// 1. Find the newest WoW: Forever build
const builds = await get('https://wago.tools/api/builds', 'json');
const products = Object.keys(builds);
console.log('Products on wago.tools:', products.join(', '));
const candidates = [];
for (const [product, list] of Object.entries(builds)) {
  for (const b of Array.isArray(list) ? list : []) {
    const version = b.version ?? b.Version;
    if (!version) continue;
    if (/forever/i.test(product) || /^1\.60\./.test(version)) candidates.push({ product, version, date: b.created_at ?? '' });
  }
}
if (!candidates.length) throw new Error('No WoW: Forever build found on wago.tools');
const byVersion = (a, b) => b.version.split('.').map(Number).reduce((d, n, i) => d || n - Number(a.version.split('.')[i] ?? 0), 0);
candidates.sort(byVersion);
const build = candidates[0].version;
console.log(`Newest Forever build: ${build} (${candidates[0].product})`);

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const previousTradeable = existsSync(TRADEABLE_OUT) ? JSON.parse(readFileSync(TRADEABLE_OUT, 'utf8')) : null;
const fullIsCurrent = previous?.build === build && previous?.fields?.includes('stack');
const tradeableIsCurrent = previousTradeable?.build === build && previousTradeable?.rule === TRADEABLE_RULE;
if (fullIsCurrent && tradeableIsCurrent && !process.env.FORCE) { console.log('Already up to date.'); process.exit(0); }

// 2. Download the item table
const rows = parseCsv(await get(`https://wago.tools/db2/ItemSparse/csv?build=${build}`));
const head = rows.shift();
const col = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const iId = col('ID'); const iName = col('Display_lang'); const iQ = col('OverallQualityID'); const iLvl = col('ItemLevel'); const iStack = col('Stackable'); const iBond = col('Bonding');
if ([iId, iName, iStack, iBond].includes(-1)) throw new Error(`Unexpected columns: ${head.join(',')}`);

// Developer/test entries that are in the client data but not real items
const JUNK = /\[(DNT|PH|NYI|DND)\]|\btest\b|placeholder|deprecated|\bunused\b|^monster\s*-|^zz|\bOLD\b|\bDEBUG\b|^QA\b|^\d+\s/i;
// One entry per name (the one with the highest item level), for the rows that pass `accept`.
function makeList(accept) {
  const seen = new Map();
  for (const r of rows) {
    const name = (r[iName] || '').trim();
    if (!name || JUNK.test(name) || !accept(r)) continue;
    const item = [Number(r[iId]), name, Number(r[iQ] ?? 1) || 0, Number(r[iLvl] ?? 0) || 0, Number(r[iStack] ?? 1) || 1];
    const key = name.toLowerCase();
    const prev = seen.get(key);
    if (!prev || item[3] > prev[3]) seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) => a[1].localeCompare(b[1]));
}
const fields = ['id', 'name', 'quality', 'itemLevel', 'stack'];
const updated = new Date().toISOString().slice(0, 10);

// Tradeable list first: filter on binding, then pick one entry per name (so a bound item never hides a tradeable one).
const tradeable = makeList((r) => TRADEABLE_BONDING.includes(Number(r[iBond])));
console.log(`${tradeable.length} tradeable items (from ${rows.length} rows)`);
if (tradeable.length < 500) throw new Error('Suspiciously few tradeable items – not overwriting the list');
writeFileSync(TRADEABLE_OUT, JSON.stringify({ build, updated, source: 'wago.tools ItemSparse', rule: TRADEABLE_RULE, fields, items: tradeable }));
console.log(`Written ${TRADEABLE_OUT}`);

// The full list is only rewritten for a new build (or when it lacks the stack size); otherwise it is left untouched.
if (!fullIsCurrent || process.env.FORCE) {
  const items = makeList(() => true);
  console.log(`${items.length} items (from ${rows.length} rows)`);
  if (items.length < 1000) throw new Error('Suspiciously few items – not overwriting the list');
  const added = previous ? items.filter((i) => !previous.items.some((p) => p[0] === i[0])).length : items.length;
  writeFileSync(OUT, JSON.stringify({ build, updated, source: 'wago.tools ItemSparse', fields, items }));
  console.log(`Written ${OUT}. New items since last list: ${added}`);
} else {
  console.log(`${OUT} is current for build ${build}: left untouched.`);
}
