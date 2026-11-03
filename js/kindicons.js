// Event-type badges: our own simple emblems (not game artwork), inline SVG, same style as the class
// and profession badges. Used in the week agenda, the event list and on Home.

const GLYPHS = {
  // dungeon: arched gate
  dungeon: `<path d="M8 26V14a8 8 0 0 1 16 0v12" stroke-width="2.2" fill="none" stroke-linejoin="round"/><path d="M12 26v-9a4 4 0 0 1 8 0v9Z" stroke="none"/><path d="M6 26h20" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // raid: skull
  raid: `<path d="M16 6c-5.5 0-9 3.8-9 8.6 0 3 1.5 5 3.5 6.2V24h11v-3.2c2-1.2 3.5-3.2 3.5-6.2C25 9.8 21.5 6 16 6Z" stroke="none"/><circle cx="12.6" cy="15" r="2.2" fill="#15121a" stroke="none"/><circle cx="19.4" cy="15" r="2.2" fill="#15121a" stroke="none"/><path d="M14 24v2.5M18 24v2.5" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  // quest help: exclamation mark
  quest: `<path d="M13.6 6h4.8l-1 13h-2.8Z" stroke="none"/><circle cx="16" cy="24" r="2.4" stroke="none"/>`,
  // guild night: banner
  guild: `<path d="M10 5v22" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M11 6.5h13l-3.5 5 3.5 5H11Z" stroke="none"/>`,
  // other: star
  other: `<path d="M16 5.5l3 6.4 7 .8-5.2 4.8 1.4 6.9L16 21l-6.2 3.4 1.4-6.9L6 12.7l7-.8Z" stroke="none"/>`,
  // WoW: Forever release: hourglass
  release: `<path d="M10 6h12M10 26h12" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M11.5 7h9c0 5-4.5 6.5-4.5 9s4.5 4 4.5 9h-9c0-5 4.5-6.5 4.5-9s-4.5-4-4.5-9Z" stroke="none"/>`,
};

const LABEL = { dungeon: 'Dungeon', raid: 'Raid', quest: 'Quest help', guild: 'Guild night', other: 'Other', release: 'WoW: Forever release' };

// Round badge; colour via CSS (var(--gold) by default, var(--warn) for releases).
export function kindIcon(kind, size = 18) {
  const k = GLYPHS[kind] ? kind : 'other';
  const label = LABEL[k];
  return `<svg class="kind-icon" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="${label}" style="color:${k === 'release' ? 'var(--warn)' : 'var(--gold)'}">
    <title>${label}</title>
    <circle cx="16" cy="16" r="14.5" fill="#15121a" stroke="currentColor" stroke-width="1.6"/>
    <g transform="translate(3.2 3.2) scale(.8)" fill="currentColor" stroke="currentColor">${GLYPHS[k]}</g>
  </svg>`;
}
