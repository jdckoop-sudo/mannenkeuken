// Profession badges: our own simple emblems (not game artwork), drawn as inline SVG in gold,
// in the same style as the class badges (js/classicons.js). Plus a link to the profession on Wowhead Forever.

// Glyphs on a 32x32 canvas, drawn with currentColor.
const GLYPHS = {
  // flask
  Alchemy: `<path d="M13 6.5h6M14 6.5v6.2L8.6 22.4a2.3 2.3 0 0 0 2 3.4h10.8a2.3 2.3 0 0 0 2-3.4L18 12.7V6.5" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" fill="none"/><path d="M10.8 20h10.4l1.4 2.8a1.3 1.3 0 0 1-1.2 1.9H10.6a1.3 1.3 0 0 1-1.2-1.9Z" stroke="none"/>`,
  // anvil
  Blacksmithing: `<path d="M6 11h15c3.5 0 5.5-1.3 5.5-1.3s-.6 5.3-6.5 5.3h-1.5v3.5H11.5V15H9.5C7.4 15 6 13.4 6 11Z" stroke="none"/><path d="M10 25.5h12M12.5 25.5l1.5-4h4l1.5 4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  // wand with sparkle
  Enchanting: `<path d="M8 25 19 14" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M22 4.8l1.3 3.9 3.9 1.3-3.9 1.3L22 15.2l-1.3-3.9-3.9-1.3 3.9-1.3Z" stroke="none"/><circle cx="12" cy="9" r="1.3" stroke="none"/><circle cx="24.5" cy="20" r="1.1" stroke="none"/>`,
  // gear
  Engineering: `<path d="M16 6.2l1.8.3.6 2.3 2 .9 2-1.2 1.4 1.2-1.1 2.1.8 2 2.3.7.2 1.8-2.3.7-.8 2 1.1 2.1-1.4 1.2-2-1.2-2 .9-.6 2.3L16 26l-1.8-.3-.6-2.3-2-.9-2 1.2-1.4-1.2 1.1-2.1-.8-2-2.3-.7L6.2 16l2.3-.7.8-2-1.1-2.1L9.6 10l2 1.2 2-.9.6-2.3Z" stroke="none"/><circle cx="16" cy="16" r="3.4" fill="#15121a" stroke="none"/>`,
  // leaf
  Herbalism: `<path d="M8 24C8 13 15 7 25 7c0 10-6 17-17 17Z" stroke="none"/><path d="M8 24 19 13" stroke="#15121a" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  // stitched hide
  Leatherworking: `<path d="M9 7.5c2 1.5 4.5 1.5 7 0 2.5 1.5 5 1.5 7 0 .5 4-1.5 5.5-1.5 8.5s2 4.5 1.5 8.5c-2-1.5-4.5-1.5-7 0-2.5-1.5-5-1.5-7 0-.5-4 1.5-5.5 1.5-8.5S8.5 11.5 9 7.5Z" stroke="none"/><path d="M12 12.5h8M12 16h8M12 19.5h8" stroke="#15121a" stroke-width="1.2" stroke-dasharray="1.6 1.4" fill="none"/>`,
  // pickaxe
  Mining: `<path d="M6.5 12.5C10 7.5 18 6 25.5 9.5 19.5 8.5 12.5 9.5 6.5 12.5Z" stroke="none"/><path d="M15.5 10 11 26" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
  // curved knife
  Skinning: `<path d="M7 9.5c6 0 14 3 18 10.5-6.5-3-12-4.2-18-4.2Z" stroke="none"/><path d="M10.5 15.8 7.5 25" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  // needle and thread
  Tailoring: `<path d="M23.5 6.5 8.5 25.5" stroke-width="2" stroke-linecap="round" fill="none"/><ellipse cx="22.2" cy="8.2" rx="1.1" ry="2" transform="rotate(38 22.2 8.2)" fill="#15121a" stroke-width="1"/><path d="M21 9.5c-6 1-11 4-10 8s7 2.5 8.5 6" stroke-width="1.2" stroke-linecap="round" fill="none"/>`,
  // cooking pot
  Cooking: `<path d="M7.5 14h17v5.5a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5Z" stroke="none"/><path d="M5 14h22M12.5 6.5c-1 1.3 1 2.2 0 3.5M16 6c-1 1.3 1 2.2 0 3.5M19.5 6.5c-1 1.3 1 2.2 0 3.5" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  // bandage cross
  'First Aid': `<path d="M13 6.5h6v6.5h6.5v6H19v6.5h-6V19H6.5v-6H13Z" stroke="none"/>`,
  // fish
  Fishing: `<path d="M5.5 16c3.5-5 9.5-6.5 15-3.5l5-3.5v14l-5-3.5c-5.5 3-11.5 1.5-15-3.5Z" stroke="none"/><circle cx="10.5" cy="15" r="1.3" fill="#15121a" stroke="none"/>`,
};

// Wowhead Forever: the profession's skill-line spell (hover shows Wowhead's own tooltip).
const SPELL = {
  Alchemy: 2259, Blacksmithing: 2018, Enchanting: 7411, Engineering: 4036, Herbalism: 2366, Leatherworking: 2108,
  Mining: 2575, Skinning: 8613, Tailoring: 3908, Cooking: 2550, 'First Aid': 3273, Fishing: 7620,
};

export const professionUrl = (name) => (SPELL[name]
  ? `https://www.wowhead.com/forever/spell=${SPELL[name]}`
  : `https://www.wowhead.com/forever/search?q=${encodeURIComponent(name)}`);

const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Round gold badge with the profession glyph. Returns '' for an unknown profession.
export function professionIcon(name, size = 22) {
  const glyph = GLYPHS[name];
  if (!glyph) return '';
  return `<svg class="prof-icon" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="${escAttr(name)}" style="color:var(--gold)">
    <title>${escAttr(name)}</title>
    <circle cx="16" cy="16" r="14.5" fill="#15121a" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="16" cy="16" r="12.2" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width=".8"/>
    <g transform="translate(3.2 3.2) scale(.8)" fill="currentColor" stroke="currentColor">${glyph}</g>
  </svg>`;
}

// Icon + name linked to Wowhead (the page must load Wowhead's tooltips.js for the hover).
// data-wh-icon-size="0" keeps Wowhead from adding its own game icon next to ours.
export function professionLabel(name, { size = 22, link = true } = {}) {
  if (!name) return '';
  const text = escAttr(name);
  const inner = link
    ? `<a href="${professionUrl(name)}" target="_blank" rel="noopener" data-wh-icon-size="0" data-wh-rename-link="false">${text}</a>`
    : text;
  return `<span class="prof-label">${professionIcon(name, size)}${inner}</span>`;
}
