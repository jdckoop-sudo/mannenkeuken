// Gold helpers: amounts are stored in copper (100 copper = 1 silver, 100 silver = 1 gold).
export const toCopper = (g, s = 0, c = 0) => (Number(g) || 0) * 10000 + (Number(s) || 0) * 100 + (Number(c) || 0);
export function splitCopper(copper) {
  const n = Math.max(0, Math.round(Number(copper) || 0));
  return { g: Math.floor(n / 10000), s: Math.floor((n % 10000) / 100), c: n % 100 };
}
export function formatGold(copper) {
  const { g, s, c } = splitCopper(copper);
  return `${g}g ${s}s ${c}c`;
}
// Coin icons in our own style (round, flat, with a rim): gold, silver, copper. Colours: .coin-gold / -silver / -copper in css/style.css.
export function coinIcon(kind, size = 16) {
  return `<svg class="coin coin-${kind}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><circle class="rim" cx="8" cy="8" r="7.3"/><circle class="face" cx="8" cy="8" r="5.5"/><path class="shine" d="M5 6.6a3.4 3.4 0 0 1 3.1-2"/></svg>`;
}
// An amount as HTML with coin icons: 12 [gold] 3 [silver] 40 [copper]. Only numbers inside, so nothing to escape.
// trim = leave out the silver and copper that are 0 at the end (a goal of "100 [gold]" in a sentence).
export function goldHtml(copper, size = 16, trim = false) {
  const { g, s, c } = splitCopper(copper);
  const part = (n, kind) => `<span class="money-n">${n}</span>${coinIcon(kind, size)}`;
  const parts = [part(g, 'gold')];
  if (!trim || s || c) parts.push(part(s, 'silver'));
  if (!trim || c) parts.push(part(c, 'copper'));
  return `<span class="money" title="${g} gold ${s} silver ${c} copper">${parts.join('')}</span>`;
}
// Progress bar towards the goal, as HTML (no user text inside).
export function goldBar(copper, goal) {
  const pct = goal > 0 ? Math.min(100, (copper / goal) * 100) : 0;
  return `<div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;justify-content:space-between;font-size:14px"><strong>${goldHtml(copper)}</strong><span class="muted">Goal ${goldHtml(goal)} · ${Math.floor(pct)}%</span></div>
    <div role="progressbar" aria-label="Guild bank gold" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(pct)}" style="height:16px;background:var(--field);border:1px solid var(--border-strong);border-radius:8px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:linear-gradient(var(--gold-bright),var(--gold-dim))"></div></div>`;
}
