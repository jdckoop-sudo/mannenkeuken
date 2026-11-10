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

// The reagents as a row of small blocks: "2 × Linen Cloth" (the number in gold, the name a Wowhead link with tooltip). No Wowhead icons
// here (class no-wh-icon, css/style.css): on pages that show item icons every reagent would get one (data-wh-icon-size="0" does not help
// for items: Wowhead reads it as "tiny").
export const reagentsHtml = (r) => (r.r?.length
  ? `<ul class="rcp-reagents">${r.r.map(([id, qty, name]) => `<li><span class="rcp-n">${esc(qty)}</span><span class="rcp-x" aria-hidden="true">×</span>${id
    ? `<a class="no-wh-icon" href="${wowheadUrl(id)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}</li>`).join('')}</ul>`
  : '<span class="muted">No reagents</span>');

// One crafter as a small block: the character (class colour, link to its page), the player (player colour) and the skill.
export const crafterHtml = (c) => `<span class="crafter"><a class="crafter-char" href="${characterUrl(c.name)}" style="color:${classColor(c.cls) || 'inherit'}">${classIcon(c.cls, 16)}${esc(c.name)}</a>`
  + `${c.player ? `<a class="crafter-player" href="${playerUrl(c.player)}">${esc(c.player)}</a>` : ''}${c.skill != null ? `<span class="crafter-skill" title="Skill">${esc(c.skill)}</span>` : ''}</span>`;

// One search result on Professions, as a card: the recipe name on top (with how many it makes), its profession and category on the
// right; below two labelled rows: Reagents and Made by. professionLabel comes from the page (js/proficons.js).
export const recipeRowHtml = (r, professionLabel) => `<article class="rcp${r.who.length ? '' : ' nobody'}">
  <header class="rcp-head"><span class="rcp-name">${recipeLink(r)}${r.q > 1 ? ` <span class="rcp-qty">makes ${esc(r.q)}</span>` : ''}</span>
    <span class="rcp-prof">${professionLabel(r.p, { size: 16 })}<span class="muted">· ${esc(r.c)}</span></span></header>
  <dl class="rcp-parts">
    <dt>Reagents</dt><dd>${reagentsHtml(r)}</dd>
    <dt>Made by</dt><dd>${r.who.length ? `<div class="rcp-crafters">${r.who.map(crafterHtml).join('')}</div>` : '<span class="muted">Nobody in the guild yet</span>'}</dd>
  </dl></article>`;

// The recipes a character knows (character page): grouped by category, each line the recipe on the left and its reagents on the right.
export function knownRecipesHtml(list) {
  const groups = new Map();
  for (const r of [...list].sort((a, b) => a.c.localeCompare(b.c) || a.n.localeCompare(b.n))) groups.set(r.c, [...(groups.get(r.c) ?? []), r]);
  return [...groups].map(([cat, rs]) => `<div class="rcp-group"><h4>${esc(cat)} <span class="muted">${rs.length}</span></h4>
    ${rs.map((r) => `<div class="rcp-line"><span class="rcp-name">${recipeLink(r)}${r.q > 1 ? ` <span class="rcp-qty">×${esc(r.q)}</span>` : ''}</span>${reagentsHtml(r)}</div>`).join('')}</div>`).join('');
}
