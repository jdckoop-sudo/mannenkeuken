// WoW: Forever character options (source: Method + RankedBoost, 2-11-2026; check again after launch).
// Skyborne exists in both factions; the faction is part of the name so it is always clear which one it is.
export const RACES = {
  Alliance: {
    Human: ['Hunter', 'Mage', 'Paladin', 'Priest', 'Rogue', 'Warlock', 'Warrior'],
    Dwarf: ['Hunter', 'Paladin', 'Priest', 'Rogue', 'Shaman', 'Warrior'],
    'Night Elf': ['Druid', 'Hunter', 'Priest', 'Rogue', 'Warrior'],
    Gnome: ['Mage', 'Priest', 'Rogue', 'Warlock', 'Warrior'],
    'Skyborne (Alliance)': ['Druid', 'Hunter', 'Mage', 'Rogue', 'Warrior'],
  },
  Horde: {
    Orc: ['Hunter', 'Mage', 'Rogue', 'Shaman', 'Warlock', 'Warrior'],
    Undead: ['Mage', 'Paladin', 'Priest', 'Rogue', 'Warlock', 'Warrior'],
    Tauren: ['Druid', 'Hunter', 'Shaman', 'Warrior'],
    Troll: ['Hunter', 'Mage', 'Priest', 'Rogue', 'Shaman', 'Warlock', 'Warrior'],
    'Skyborne (Horde)': ['Druid', 'Hunter', 'Rogue', 'Shaman', 'Warrior'],
  },
};

export const ROLES_BY_CLASS = {
  Druid: ['Tank', 'Healer', 'DPS'],
  Hunter: ['DPS'],
  Mage: ['DPS'],
  Paladin: ['Tank', 'Healer', 'DPS'],
  Priest: ['Healer', 'DPS'],
  Rogue: ['DPS'],
  Shaman: ['Healer', 'DPS'],
  Warlock: ['DPS'],
  Warrior: ['Tank', 'DPS'],
};

export const classesForRace = (race) => {
  for (const races of Object.values(RACES)) if (races[race]) return races[race];
  return [];
};
export const rolesForClass = (cls) => ROLES_BY_CLASS[cls] ?? [];
