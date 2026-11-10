// History of the character data (table character_history: one row per character per Dutch day, kept up to date every hour by the
// database function snapshot_characters(); see supabase/schema.sql) and a small line chart for it.
// Used on the character page (level, and profession skill), Guild → Overview (the guild's total level) and Home (This week).
// Chart rules (dataviz): one y-axis per chart, 2px lines, dots with a ring, hairline grid, a legend only for two or more lines,
// a crosshair that snaps to the nearest day with every value in the tooltip (also with ← → on the keyboard), and a table view.
import { supabase } from './supabase.js?v=__V__';
import { esc } from './sheet.js?v=__V__';

const norm = (s) => String(s ?? '').trim().toLowerCase();

// All rows of one character (oldest first), or of everyone when no key is given. [] when the table is not there (yet).
export async function loadHistory(name) {
  if (!supabase) return [];
  let q = supabase.from('character_history').select('day,key,name,player,level,professions,source').order('day');
  if (name) q = q.eq('key', norm(name));
  const { data, error } = await q;
  return error ? [] : data ?? [];
}

// The colours of the lines (CSS variables in css/style.css, validated for the dark panels). Profession lines: the two primary professions
// take slot 1 and 2 (in alphabetical order), Cooking, First Aid and Fishing always their own slot, so a colour means the same on every page.
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
const SECONDARY_SLOT = { Cooking: 2, 'First Aid': 3, Fishing: 4 };
export function professionColors(names) {
  const primaries = names.filter((n) => !(n in SECONDARY_SLOT)).sort();
  return Object.fromEntries(names.map((n) => [n, SERIES[n in SECONDARY_SLOT ? SECONDARY_SLOT[n] : Math.min(primaries.indexOf(n), 1)]]));
}

const DAY = 86400000;
const toMs = (day) => Date.parse(`${day}T12:00:00Z`);
export const dayLabel = (day, opts = { day: 'numeric', month: 'short' }) => new Date(toMs(day)).toLocaleDateString('en-GB', { timeZone: 'Europe/Amsterdam', ...opts });
const fmt = (v) => (v == null ? '–' : Number(v).toLocaleString('en-GB'));

// Clean tick values from 0 (or min) to at least max: steps of 1, 2, 5 × 10^n, about 4-5 ticks.
function ticks(min, max) {
  const span = Math.max(1, max - min);
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

// Draws a line chart into `host`. series = [{ name, color, points: [{ day: 'YYYY-MM-DD', value }] }], all on one y-axis.
// opts: { min (default 0), max (optional), unit ('level', 'skill' …) for the tooltip and table, label (accessible name), height }.
// Redraws itself when the host changes width.
export function lineChart(host, series, opts = {}) {
  const shown = series.filter((s) => s.points.some((p) => p.value != null));
  if (!shown.length) { host.innerHTML = '<p class="muted" style="margin:0;font-size:14px">No history yet.</p>'; return; }
  const days = [...new Set(shown.flatMap((s) => s.points.map((p) => p.day)))].sort();
  const values = shown.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v != null);
  const yTicks = ticks(opts.min ?? 0, Math.max(opts.max ?? 0, ...values));
  const [y0, y1] = [yTicks[0], yTicks[yTicks.length - 1]];
  const height = opts.height ?? 200;
  const legend = shown.length > 1
    ? `<ul class="hc-legend">${shown.map((s) => `<li><span class="hc-key" style="background:${s.color}"></span>${esc(s.name)}</li>`).join('')}</ul>` : '';
  host.innerHTML = `${legend}<div class="hc-plot" tabindex="0" role="img" aria-label="${esc(opts.label ?? 'History')}: ${days.length} day${days.length === 1 ? '' : 's'}, use the arrow keys to read each day">
      <svg aria-hidden="true"></svg><div class="hc-tip" hidden></div></div>
    <details class="hc-table"><summary>Show as table</summary><div class="table-wrap"><table><thead><tr><th>Day</th>${shown.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead>
      <tbody>${[...days].reverse().map((d) => `<tr><td>${esc(dayLabel(d, { weekday: 'short', day: 'numeric', month: 'short' }))}</td>${shown.map((s) => `<td class="num">${fmt(s.points.find((p) => p.day === d)?.value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  const plot = host.querySelector('.hc-plot');
  const svg = host.querySelector('svg');
  const tip = host.querySelector('.hc-tip');
  let current = null;

  const draw = () => {
    const width = Math.max(260, plot.clientWidth);
    const pad = { l: 40, r: 16, t: 12, b: 26 };
    const t0 = toMs(days[0]);
    const t1 = days.length > 1 ? toMs(days[days.length - 1]) : t0 + DAY;
    const x = (day) => (days.length > 1 ? pad.l + ((toMs(day) - t0) / (t1 - t0)) * (width - pad.l - pad.r) : pad.l + (width - pad.l - pad.r) / 2);
    const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);
    // at most ~6 day labels, always the first and the last
    const every = Math.max(1, Math.ceil(days.length / 6));
    const xLabels = days.filter((d, i) => i % every === 0 || i === days.length - 1);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.innerHTML = yTicks.map((v) => `<line class="hc-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="hc-axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')
      + xLabels.map((d) => `<text class="hc-axis" x="${x(d)}" y="${height - 6}" text-anchor="middle">${esc(dayLabel(d))}</text>`).join('')
      + `<line class="hc-cross" x1="0" x2="0" y1="${pad.t}" y2="${height - pad.b}" visibility="hidden"/>`
      + shown.map((s) => {
        const pts = s.points.filter((p) => p.value != null).sort((a, b) => a.day.localeCompare(b.day));
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
        return `<path class="hc-line" d="${path}" style="stroke:${s.color}"/>`
          + pts.map((p) => `<circle class="hc-dot" cx="${x(p.day)}" cy="${y(p.value)}" r="4" style="fill:${s.color}"/>`).join('');
      }).join('');
    plot.dataset.layout = JSON.stringify({ xs: days.map(x) });
    if (current != null) show(current);
  };

  // The tooltip for one day: the date, then every line's value (value first, name after, a short line in its colour as key).
  const show = (i) => {
    current = i;
    const d = days[i];
    const xs = JSON.parse(plot.dataset.layout).xs;
    const cross = svg.querySelector('.hc-cross');
    cross.setAttribute('x1', xs[i]); cross.setAttribute('x2', xs[i]); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<div class="hc-tip-day">${esc(dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`
      + shown.map((s) => `<div class="hc-tip-row"><span class="hc-tip-key" style="background:${s.color}"></span><strong>${fmt(s.points.find((p) => p.day === d)?.value)}</strong><span class="muted">${esc(s.name)}</span></div>`).join('');
    tip.hidden = false;
    const w = plot.clientWidth;
    const left = Math.min(Math.max(xs[i] + 12, 0), w - tip.offsetWidth - 4);
    tip.style.left = `${xs[i] + 12 + tip.offsetWidth > w ? Math.max(0, xs[i] - tip.offsetWidth - 12) : left}px`;
  };
  const hide = () => { current = null; tip.hidden = true; svg.querySelector('.hc-cross')?.setAttribute('visibility', 'hidden'); };
  const nearest = (px) => { const xs = JSON.parse(plot.dataset.layout).xs; let best = 0; xs.forEach((v, i) => { if (Math.abs(v - px) < Math.abs(xs[best] - px)) best = i; }); return best; };
  plot.addEventListener('pointermove', (e) => show(nearest(e.clientX - plot.getBoundingClientRect().left)));
  plot.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => show(current ?? days.length - 1));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(days.length - 1, Math.max(0, (current ?? days.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)))); }
    if (e.key === 'Escape') hide();
  });
  draw();
  if (typeof ResizeObserver === 'function') { let w = plot.clientWidth; new ResizeObserver(() => { if (plot.clientWidth !== w) { w = plot.clientWidth; draw(); } }).observe(plot); }
}
