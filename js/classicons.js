// Class badges: our own simple emblems (not game artwork), drawn as inline SVG in the class colour.
export const CLASS_COLORS = {
  Druid: '#ff7c0a', Hunter: '#aad372', Mage: '#3fc7eb', Paladin: '#f48cba', Priest: '#ffffff',
  Rogue: '#fff468', Shaman: '#2f90ff', Warlock: '#9a9bf5', Warrior: '#c69b6d',
};

// Glyphs on a 32x32 canvas, drawn with currentColor.
const GLYPHS = {
  Warrior: `<path d="M24 8 11 21M8 8l13 13" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M9.7 17.2l5.1 5.1M22.3 17.2l-5.1 5.1" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="9.2" cy="22.8" r="1.5" stroke="none"/><circle cx="22.8" cy="22.8" r="1.5" stroke="none"/>`,
  Paladin: `<rect x="10.5" y="6" width="11" height="7.5" rx="1.2"/><path d="M16 13.5V25.5" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  Hunter: `<path d="M11 6.5Q25 16 11 25.5" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M11 6.5v19M7.5 16H25M21.5 12.5 25 16l-3.5 3.5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  Rogue: `<path d="M16 5.5 19.2 16 16 20.2 12.8 16Z"/><path d="M11 20.5h10M16 20.5v5" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,
  Priest: `<path d="M16 5.5v21M5.5 14h21" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="16" cy="14" r="4.6" fill="none" stroke-width="1.8"/>`,
  Shaman: `<path d="M18.5 4.5 9.5 17H16l-2 10.5L23.5 14H17.2Z"/>`,
  Mage: `<path d="M16 4.5l2.6 8.9 8.9 2.6-8.9 2.6L16 27.5l-2.6-8.9L4.5 16l8.9-2.6Z"/>`,
  Warlock: `<path d="M16 4.5c1 5 6.5 7 6.5 13 0 4.6-3.2 8-6.5 8s-6.5-3.4-6.5-8c0-3 2-4.6 3-7 .8 1.6 1.6 2 2-1.2.4-2.6.2-3.6 1.5-4.8Z"/>`,
  Druid: `<ellipse cx="16" cy="20.5" rx="6" ry="4.8"/><circle cx="8.8" cy="14.6" r="2.4"/><circle cx="13.2" cy="9.8" r="2.4"/><circle cx="18.8" cy="9.8" r="2.4"/><circle cx="23.2" cy="14.6" r="2.4"/>`,
};

export const classColor = (cls) => CLASS_COLORS[cls] ?? '';

// Round badge with the class glyph. Returns '' for an unknown class.
export function classIcon(cls, size = 28) {
  const glyph = GLYPHS[cls];
  if (!glyph) return '';
  return `<svg class="class-icon" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="${cls}" style="color:${CLASS_COLORS[cls]}">
    <title>${cls}</title>
    <circle cx="16" cy="16" r="14.5" fill="#15121a" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="16" cy="16" r="12.2" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width=".8"/>
    <g fill="currentColor" stroke="currentColor">${glyph}</g>
  </svg>`;
}
