// Talent trees on the character page: the three trees of the character's class (data/talents.json, tools/update-talents.mjs, daily)
// with the talents the character chose (field `talents` in blizzard_characters, from update-characters every 5 minutes).
// The picture in a tile is Wowhead's own spell icon, drawn live by Wowhead's tooltips.js (iconizeLinks; an exception like the item icons:
// we never copy or host them). The frame, the rank badge, the arrows and the text under a tree are ours. Styles: .tal-* in css/style.css.
import { esc } from './sheet.js?v=__V__';
import { refreshTooltips } from './itemsearch.js?v=__V__';

let treesPromise = null;
export function loadTalentTrees() {
  treesPromise ??= fetch('data/talents.json?v=__V__').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return treesPromise;
}

const TILE = 44; // px, the same as --tal-t in css/style.css
const GAP = 16; // px, the same as --tal-g
const spellUrl = (id) => `https://www.wowhead.com/forever/spell=${id}`;
const initials = (name) => String(name).split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
const norm = (s) => String(s ?? '').trim().toLowerCase();

// The middle of a tile, in the grid's own pixels.
const centre = (n) => ({ x: (n.col - 1) * (TILE + GAP) + TILE / 2, y: (n.row - 1) * (TILE + GAP) + TILE / 2 });
// Arrows from a talent to the talents it unlocks (locked_by in the game data): gold when both are chosen.
function arrows(nodes, rankOf) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.flatMap((n) => n.lockedBy.map((pid) => {
    const p = byId.get(pid);
    if (!p) return '';
    const a = centre(p);
    const b = centre(n);
    const on = rankOf(p) > 0 && rankOf(n) > 0;
    const side = Math.sign(b.x - a.x);
    const d = p.col === n.col ? `M${a.x} ${a.y + TILE / 2 + 2} V${b.y - TILE / 2 - 7}`
      : p.row === n.row ? `M${a.x + side * (TILE / 2 + 2)} ${a.y} H${b.x - side * (TILE / 2 + 7)}`
      : `M${a.x + side * (TILE / 2 + 2)} ${a.y} H${b.x} V${b.y - TILE / 2 - 7}`;
    return `<path d="${d}" class="${on ? 'on' : ''}" marker-end="url(#tal-ah-${on ? 'on' : 'off'})"/>`;
  })).join('');
}
const markers = '<defs><marker id="tal-ah-on" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="tal-ah on"/></marker>'
  + '<marker id="tal-ah-off" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="tal-ah"/></marker></defs>';

// The game's own text for this rank, and the next one.
function info(n, rank) {
  const cur = rank ? n.ranks[rank - 1] : null;
  const next = rank < n.max ? n.ranks[rank] : null;
  return `<div><b>${esc(n.name)}</b> <span class="muted">· rank ${rank}/${n.max}</span></div>`
    + (cur ? `<div>${esc(cur)}</div>` : '')
    + (next ? `<div class="next">${rank ? 'Next rank' : 'Rank 1'}: ${esc(next)}</div>` : '');
}

// Fills `host` with the talents of a character. entry = the character in loadBlizzard() (status "ok"), cls = its class.
// Returns false (and leaves host empty) when there is nothing to show: no talents fetched yet, or no trees for this class.
export async function renderTalents(host, entry, cls) {
  const talents = entry?.status === 'ok' ? entry.talents : null;
  const data = talents ? await loadTalentTrees() : null;
  const trees = data?.classes?.[cls] ?? data?.classes?.[entry?.class];
  if (!talents || !trees?.length) { host.innerHTML = ''; return false; }
  const picks = talents.picks ?? {};
  const rankOf = (n) => Math.min(n.max, Number(picks[n.talent]) || 0);
  const pointsOf = (t) => talents.trees?.find((x) => norm(x.name) === norm(t.name))?.points ?? t.nodes.reduce((a, n) => a + rankOf(n), 0);
  const points = trees.map(pointsOf);
  const total = points.reduce((a, b) => a + b, 0);
  const available = Math.max(0, (Number(entry.level) || 0) - 9); // one talent point per level from level 10
  const most = Math.max(...points);

  host.innerHTML = `<p class="tal-sum"><span><strong>${total}</strong> of ${available} talent points spent</span>${trees.map((t, i) => `<span class="muted">${esc(t.name)} <b>${points[i]}</b></span>`).join('')}</p>
    <div class="tal-trees">${trees.map((t, ti) => {
      const chosen = t.nodes.filter((n) => rankOf(n) > 0);
      const last = chosen[chosen.length - 1] ?? null; // nodes are sorted top to bottom: the deepest chosen talent
      return `<div class="tal-tree${points[ti] && points[ti] === most ? ' is-main' : ''}${points[ti] ? '' : ' is-empty'}" data-tree="${ti}">
        <h3>${esc(t.name)} <span>${points[ti]}</span></h3>
        <div class="tal-grid">
          <svg aria-hidden="true">${markers}${arrows(t.nodes, rankOf)}</svg>
          ${t.nodes.map((n) => {
            const rank = rankOf(n);
            const state = rank === 0 ? 'r0' : rank >= n.max ? 'maxed' : 'partial';
            const link = n.spell
              ? `<a href="${spellUrl(n.spell)}" data-wh-icon-size="medium" data-node="${n.id}" aria-label="${esc(`${n.name}, rank ${rank} of ${n.max}`)}"><span class="tal-txt">${esc(n.name)}</span><span class="tal-initials" aria-hidden="true">${esc(initials(n.name))}</span></a>`
              : `<span class="tal-plain" tabindex="0" data-node="${n.id}" aria-label="${esc(`${n.name}, rank ${rank} of ${n.max}`)}">${esc(initials(n.name))}</span>`;
            return `<div class="tal-node ${state}" style="grid-row:${n.row};grid-column:${n.col}">${link}<span class="tal-rank" aria-hidden="true">${rank}/${n.max}</span></div>`;
          }).join('')}
        </div>
        <div class="tal-info" data-info>${last ? info(last, rankOf(last)) : '<span class="muted">No points in this tree. Hover a talent to read it.</span>'}</div>
      </div>`;
    }).join('')}</div>`;

  // Hover or focus a talent: the game's text for it shows under its tree.
  const byId = new Map(trees.flatMap((t, ti) => t.nodes.map((n) => [String(n.id), [n, ti]])));
  const show = (e) => {
    const el = e.target.closest('[data-node]');
    const hit = el && byId.get(el.dataset.node);
    if (!hit) return;
    const [n, ti] = hit;
    host.querySelector(`[data-tree="${ti}"] [data-info]`).innerHTML = info(n, rankOf(n));
  };
  host.addEventListener('mouseover', show);
  host.addEventListener('focusin', show);
  refreshTooltips();
  return true;
}
