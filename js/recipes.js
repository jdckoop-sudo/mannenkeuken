// "Who can make this?": the recipes of WoW: Forever (data/recipes.json, tools/update-recipes.mjs, daily) put together with the recipes each
// character knows (professions[].recipes in blizzard_characters, from the Edge Function update-characters every 5 minutes).
// Used on Professions (search), the Market (crafters next to a request) and the character page (known recipes per profession).
import { esc } from './sheet.js?v=__V__';
import { wowheadUrl } from './itemsearch.js?v=__V__';
import { playerUrl, characterUrl } from './players.js?v=__V__';
import { classIcon, classColor } from './classicons.js?v=__V__';

let recipesPromise = null;
// { <recipe id>: { n: name, p: profession, c: category, i: item id | null, q: quantity, r: [[item id, quantity, name], ...] } }, or null.
export function loadRecipes() {
  recipesPromise ??= fetch('data/recipes.json?v=__V__').then((r) => (r.ok ? r.json() : null)).then((d) => d?.recipes ?? null).catch(() => null);
  return recipesPromise;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Who knows which recipe. characters = loadCharacters().characters (Quit characters are left out), blizzard = loadBlizzard().
// Returns { crafters: Map<recipe id, [{ name, player, cls, profession, skill }]>, byItem: Map<item id, [recipe id]>, known: number of recipes known }.
export function recipeIndex(recipes, characters, blizzard) {
  const crafters = new Map();
  for (const c of characters ?? []) {
    if (c.status === 'Gestopt') continue;
    const e = blizzard?.characters?.[norm(c.name)];
    if (e?.status !== 'ok') continue;
    for (const p of e.professions ?? []) for (const id of p.recipes ?? []) {
      if (!recipes?.[id]) continue; // gathering skills (Mining, Herbalism ...) are no recipes
      const list = crafters.get(String(id)) ?? [];
      list.push({ name: c.name, player: c.player, cls: c.class, profession: p.name, skill: p.skill ?? null });
      crafters.set(String(id), list);
    }
  }
  for (const list of crafters.values()) list.sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0) || a.name.localeCompare(b.name));
  const byItem = new Map();
  for (const [id, r] of Object.entries(recipes ?? {})) if (r.i) byItem.set(r.i, [...(byItem.get(r.i) ?? []), id]);
  return { crafters, byItem, known: crafters.size };
}

// Everyone in the guild who can make this item (one entry per character, the best skill first).
export function craftersOfItem(index, itemId) {
  const seen = new Map();
  for (const id of index.byItem.get(Number(itemId)) ?? []) for (const c of index.crafters.get(id) ?? []) if (!seen.has(c.name)) seen.set(c.name, c);
  return [...seen.values()];
}

// Recipes whose name (or the name of the item it makes) contains the words typed. Known recipes first, then by name.
export function searchRecipes(recipes, index, query, { onlyKnown = false, limit = 40 } = {}) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length || !recipes) return [];
  const hits = [];
  for (const [id, r] of Object.entries(recipes)) {
    const hay = `${r.n} ${r.p} ${r.c}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const who = index.crafters.get(id) ?? [];
    if (onlyKnown && !who.length) continue;
    hits.push({ id, ...r, who });
  }
  hits.sort((a, b) => (b.who.length > 0) - (a.who.length > 0) || a.n.localeCompare(b.n));
  return hits.slice(0, limit);
}

// A link to the recipe on Wowhead: the item it makes (hover tooltip), or a search for enchants that make no item.
export const recipeLink = (r) => (r.i
  ? `<a href="${wowheadUrl(r.i)}" target="_blank" rel="noopener">${esc(r.n)}</a>`
  : `<a href="https://www.wowhead.com/forever/search?q=${encodeURIComponent(r.n)}" target="_blank" rel="noopener">${esc(r.n)}</a>`);

// "2× Linen Cloth · 1× Coarse Thread", each a Wowhead link (hover tooltip). No Wowhead icons here (class no-wh-icon, css/style.css): on pages
// that show item icons a list of reagents would get one per word. (data-wh-icon-size="0" does not help for items: Wowhead reads it as "tiny".)
export const reagentsHtml = (r) => (r.r ?? []).map(([id, qty, name]) => `${esc(qty)}× ${id ? `<a class="no-wh-icon" href="${wowheadUrl(id)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}`).join(' · ');

// One search result on Professions: the recipe (Wowhead link), its profession and category, the reagents and who in the guild knows it.
// professionLabel comes from the page (js/proficons.js), so this module needs no profession icons itself.
export const recipeRowHtml = (r, professionLabel) => `<div class="who-row${r.who.length ? '' : ' nobody'}">
  <div class="who-recipe">${recipeLink(r)}${r.q > 1 ? ` <span class="muted">×${esc(r.q)}</span>` : ''}<span class="who-prof">${professionLabel(r.p, { size: 16 })} <span class="muted">· ${esc(r.c)}</span></span></div>
  ${r.r?.length ? `<div class="who-reagents muted">Needs ${reagentsHtml(r)}</div>` : ''}
  <div class="who-crafters">${r.who.length ? r.who.map(crafterHtml).join('') : '<span class="muted">Nobody in the guild yet</span>'}</div></div>`;

// One crafter: the character (class colour, link to its page), the player (player colour) and the skill.
export const crafterHtml = (c) => `<span class="crafter"><a href="${characterUrl(c.name)}" style="color:${classColor(c.cls) || 'inherit'}">${classIcon(c.cls, 16)}${esc(c.name)}</a>`
  + `${c.player ? ` <a class="crafter-player" href="${playerUrl(c.player)}">${esc(c.player)}</a>` : ''}${c.skill != null ? ` <span class="muted">${esc(c.skill)}</span>` : ''}</span>`;
