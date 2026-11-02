// Builds data/quests.json (quest search on Raids & Events → Quest help) from the quest database
// of Questie for WoW: Forever (https://github.com/tysongoulding/questie-forever, the Classic DB it loads).
// Runs in GitHub Actions (see .github/workflows/quests.yml). Node 20+, no dependencies.
// Local test: node tools/update-quests.mjs /path/to/questie-forever
import { writeFileSync, readFileSync } from 'node:fs';

const REPO = 'https://raw.githubusercontent.com/tysongoulding/questie-forever/main/';
const FILES = { quests: 'Database/Classic/classicQuestDB.lua', zones: 'Database/Zones/data/zoneIds.lua', sorts: 'Database/Constants.lua' };
const OUT = 'data/quests.json';
const local = process.argv[2];

async function get(path) {
  if (local) return readFileSync(`${local}/${path}`, 'utf8');
  const res = await fetch(REPO + path, { headers: { 'User-Agent': 'mannenkeuken-guild-site (weekly quest list update)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.text();
}

// Minimal parser for Lua table literals: strings, numbers, nil, true/false, {a, b, [k] = v}.
function parseLua(src) {
  let i = 0;
  const ws = () => { while (/\s/.test(src[i])) i++; };
  function value() {
    ws();
    const c = src[i];
    if (c === '{') return table();
    if (c === '"' || c === "'") return string(c);
    if (src.startsWith('nil', i)) { i += 3; return null; }
    if (src.startsWith('true', i)) { i += 4; return true; }
    if (src.startsWith('false', i)) { i += 5; return false; }
    const m = /^-?\d+(\.\d+)?/.exec(src.slice(i, i + 32));
    if (!m) throw new Error(`Unexpected "${src.slice(i, i + 20)}" at ${i}`);
    i += m[0].length;
    return Number(m[0]);
  }
  function string(q) {
    i++; let out = '';
    while (src[i] !== q) {
      if (src[i] === '\\') { i++; const e = src[i]; out += e === 'n' ? '\n' : e === 't' ? '\t' : e; } else out += src[i];
      i++;
    }
    i++;
    return out;
  }
  function table() {
    i++; const arr = []; const obj = {}; let keyed = false; let n = 0;
    for (;;) {
      ws();
      if (src[i] === '}') { i++; break; }
      if (src[i] === '[') {
        i++; const k = value(); ws(); i++; // ]
        ws(); i++; // =
        obj[k] = value(); keyed = true;
      } else { n++; arr[n - 1] = value(); }
      ws();
      if (src[i] === ',' || src[i] === ';') i++;
    }
    return keyed ? obj : arr;
  }
  return value();
}

// "THE_BARRENS = 17," → { 17: 'The Barrens' }
function enumNames(text) {
  const names = {};
  for (const m of text.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(-?\d+)\s*,/gm)) {
    names[m[2]] ??= m[1].toLowerCase().split('_').map((w) => (w === 'of' || w === 'the' ? w : w[0].toUpperCase() + w.slice(1))).join(' ').replace(/^\w/, (c) => c.toUpperCase());
  }
  return names;
}

const [questSrc, zoneSrc, sortSrc] = await Promise.all([get(FILES.quests), get(FILES.zones), get(FILES.sorts)]);
const zones = enumNames(zoneSrc.slice(zoneSrc.indexOf('ZoneDB.zoneIDs')));
const sorts = enumNames(sortSrc.slice(sortSrc.indexOf('QuestieDB.sortKeys'), sortSrc.indexOf('}', sortSrc.indexOf('QuestieDB.sortKeys'))));
const start = questSrc.indexOf('[[return {');
const end = questSrc.lastIndexOf(']]');
const data = parseLua(questSrc.slice(start + 9, end));

// Fields (QuestieDB.questKeys): 1 name, 4 requiredLevel, 5 questLevel, 6 requiredRaces, 17 zoneOrSort
const HORDE = 2 | 16 | 32 | 128; // Orc, Undead, Tauren, Troll (0 = everyone)
const quests = [];
for (const [id, q] of Object.entries(data)) {
  const [name, , , minLevel, level, races] = q;
  const zoneOrSort = q[16];
  if (!name || /deprecated|unused|\[ph\]|zzold|test quest/i.test(name)) continue;
  if (races && !(races & HORDE)) continue; // Alliance only
  const zone = zoneOrSort > 0 ? zones[zoneOrSort] : zoneOrSort < 0 ? sorts[zoneOrSort] : null;
  quests.push([Number(id), name, level > 0 ? level : null, minLevel > 0 ? minLevel : null, zone ?? null]);
}
quests.sort((a, b) => a[1].localeCompare(b[1]) || (a[2] ?? 0) - (b[2] ?? 0));

writeFileSync(OUT, JSON.stringify({
  updated: new Date().toISOString().slice(0, 10),
  source: 'Questie for WoW: Forever (tysongoulding/questie-forever), Classic quest DB; Alliance-only quests left out',
  fields: ['id', 'name', 'level', 'minLevel', 'zone'],
  quests,
}));
console.log(`Wrote ${quests.length} quests to ${OUT}`);
