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
// Progress bar towards the goal, as HTML (no user text inside).
export function goldBar(copper, goal) {
  const pct = goal > 0 ? Math.min(100, (copper / goal) * 100) : 0;
  return `<div style="display:flex;justify-content:space-between;font-size:14px"><strong>${formatGold(copper)}</strong><span class="muted">goal ${formatGold(goal)} · ${Math.floor(pct)}%</span></div>
    <div role="progressbar" aria-label="Guild bank gold" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(pct)}" style="height:16px;background:#e5e7eb;border-radius:8px;overflow:hidden">
      <div style="width:${pct}%;height:16px;background:#b45309"></div></div>`;
}
