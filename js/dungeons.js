// Dungeons and raids for the title search on Raids & Events (kept by hand).
// id = Wowhead zone id (links to Wowhead Forever); new Forever places without a known id link to a Wowhead search.
// levels = rough level range. Add new Forever dungeons/raids here when they are announced.
const LIST = [
  // Classic dungeons
  { name: 'Ragefire Chasm', id: 2437, levels: [13, 18], kind: 'dungeon' },
  { name: 'Wailing Caverns', id: 718, levels: [17, 24], kind: 'dungeon' },
  { name: 'The Deadmines', id: 1581, levels: [17, 26], kind: 'dungeon' },
  { name: 'Shadowfang Keep', id: 209, levels: [22, 30], kind: 'dungeon' },
  { name: 'Blackfathom Deeps', id: 719, levels: [24, 32], kind: 'dungeon' },
  { name: 'The Stockade', id: 717, levels: [24, 32], kind: 'dungeon' },
  { name: 'Gnomeregan', id: 721, levels: [29, 38], kind: 'dungeon' },
  { name: 'Razorfen Kraul', id: 491, levels: [29, 38], kind: 'dungeon' },
  { name: 'Scarlet Monastery', id: 796, levels: [34, 45], kind: 'dungeon' },
  { name: 'Razorfen Downs', id: 722, levels: [37, 46], kind: 'dungeon' },
  { name: 'Uldaman', id: 1337, levels: [41, 51], kind: 'dungeon' },
  { name: "Zul'Farrak", id: 1176, levels: [44, 54], kind: 'dungeon' },
  { name: 'Maraudon', id: 2100, levels: [46, 55], kind: 'dungeon' },
  { name: "The Temple of Atal'Hakkar", id: 1477, levels: [50, 56], kind: 'dungeon' },
  { name: 'Blackrock Depths', id: 1584, levels: [52, 60], kind: 'dungeon' },
  { name: 'Blackrock Spire', id: 1583, levels: [55, 60], kind: 'dungeon' },
  { name: 'Dire Maul', id: 2557, levels: [55, 60], kind: 'dungeon' },
  { name: 'Scholomance', id: 2057, levels: [58, 60], kind: 'dungeon' },
  { name: 'Stratholme', id: 2017, levels: [58, 60], kind: 'dungeon' },
  // New in WoW: Forever (Wowhead ids not known yet)
  { name: 'The Hall of Thanes', id: null, levels: null, kind: 'dungeon', forever: true },
  { name: 'Ruins of Lordaeron', id: null, levels: null, kind: 'dungeon', forever: true },
  // Raids
  { name: 'Barrow Deeps', id: null, levels: [60, 60], kind: 'raid', size: 10, forever: true },
  { name: 'Hyjal Summit', id: null, levels: [60, 60], kind: 'raid', size: 20, forever: true },
  { name: "Onyxia's Lair", id: 2159, levels: [60, 60], kind: 'raid', size: 40 },
  { name: "Zul'Gurub", id: 1977, levels: [60, 60], kind: 'raid', size: 20 },
  { name: 'Molten Core', id: 2717, levels: [60, 60], kind: 'raid', size: 40 },
  { name: 'Blackwing Lair', id: 2677, levels: [60, 60], kind: 'raid', size: 40 },
  { name: "Ruins of Ahn'Qiraj", id: 3429, levels: [60, 60], kind: 'raid', size: 20 },
  { name: "Temple of Ahn'Qiraj", id: 3428, levels: [60, 60], kind: 'raid', size: 40 },
  { name: 'Naxxramas', id: 3456, levels: [60, 60], kind: 'raid', size: 40 },
];

export const DUNGEONS = LIST.map((d) => ({ ...d, lower: d.name.toLowerCase() }));

export const dungeonUrl = (d) => (d.id ? `https://www.wowhead.com/forever/zone=${d.id}` : `https://www.wowhead.com/forever/search?q=${encodeURIComponent(d.name)}`);
export const findDungeon = (name) => DUNGEONS.find((d) => d.lower === String(name ?? '').toLowerCase()) ?? null;

export function dungeonInfo(d) {
  return [
    d.kind === 'raid' ? `Raid${d.size ? ` (${d.size})` : ''}` : 'Dungeon',
    d.levels ? (d.levels[0] === d.levels[1] ? `lvl ${d.levels[0]}` : `lvl ${d.levels[0]}–${d.levels[1]}`) : '',
    d.forever ? 'new in Forever' : '',
  ].filter(Boolean).join(' · ');
}

// Suggestions for a kind ('dungeon' / 'raid'); other kinds (quest help, guild night, …) get none.
export async function loadDungeonSuggestions(kind) {
  return kind === 'dungeon' || kind === 'raid' ? DUNGEONS.filter((d) => d.kind === kind) : [];
}
