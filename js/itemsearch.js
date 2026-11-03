// Item search with suggestions while typing (WoW: Forever item list in data/items.json,
// refreshed daily by the "Update items" GitHub workflow).

const QUALITY = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact', 'Heirloom'];
// Darker variants of the in-game colours so they stay readable on white.
const COLOR = ['#6b7280', '#1f2937', '#1a7f00', '#0058b0', '#7e2fc0', '#b45309', '#8a6d1f', '#007a99'];

let itemsPromise = null;
export function loadItems() {
  itemsPromise ??= fetch('data/items.json?v=__V__')
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d) => (d.items ?? []).map(([id, name, quality, ilvl, stack]) => ({ id, name, quality, ilvl, stack, lower: name.toLowerCase() })))
    .catch(() => []);
  return itemsPromise;
}

// Item names the guild typed that are not in the list yet (new in Forever): suggested too, as plain text.
let suggestPromise = null;
function loadItemSuggestions() {
  suggestPromise ??= Promise.all([loadItems(), import('./supabase.js?v=__V__').then(async ({ supabase }) => {
    if (!supabase) return [];
    const [a, b] = await Promise.all([
      supabase.from('listings').select('item').is('item_id', null).limit(1000),
      supabase.from('bank_items').select('item').is('item_id', null).limit(1000),
    ]);
    return [...(a.data ?? []), ...(b.data ?? [])].map((r) => r.item);
  }).catch(() => [])]).then(([items, typed]) => withTyped(items, typed));
  return suggestPromise;
}

// Adds typed names that are not in the official list (case-insensitive), marked extra.
export function withTyped(list, names) {
  const known = new Set(list.map((x) => x.lower));
  const extra = [];
  for (const n of names) {
    const name = String(n ?? '').trim();
    const lower = name.toLowerCase();
    if (name.length < 2 || known.has(lower)) continue;
    known.add(lower);
    extra.push({ id: null, name, lower, extra: true });
  }
  return [...list, ...extra];
}

export const wowheadUrl = (id) => `https://www.wowhead.com/forever/item=${id}`;
// Wowhead's tooltip script (loaded on the page) turns links to wowhead.com into hover tooltips with icon + stats.
export function refreshTooltips() {
  try { window.$WowheadPower?.refreshLinks?.(); window.WH?.Tooltips?.refreshLinks?.(); } catch { /* script not loaded yet */ }
}

export const qualityColor = (q) => COLOR[q] ?? COLOR[1];
export const qualityName = (q) => QUALITY[q] ?? '';

// Turns <input> into a combobox. onPick(item|null) is called when an item is chosen or the text no longer matches it.
let searchCount = 0;
// opts (optional, for other lists such as quests): { load, meta(it), color(it) }
export function attachItemSearch(input, onPick, opts = {}) {
  const load = opts.load ?? loadItemSuggestions;
  const baseMeta = opts.meta ?? ((it) => (it.ilvl ? `ilvl ${it.ilvl}` : ''));
  const metaOf = (it) => (it.extra ? 'added by the guild' : baseMeta(it));
  const baseColor = opts.color ?? ((it) => qualityColor(it.quality));
  const colorOf = (it) => (it.extra ? '#1f2937' : baseColor(it));
  searchCount += 1;
  const list = document.createElement('ul');
  list.id = `${input.name || 'item'}-suggestions-${searchCount}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  list.style.cssText = 'list-style:none;margin:4px 0 0;padding:4px;border:2px solid #9ca3af;border-radius:6px;background:#fff;max-height:320px;overflow:auto;position:absolute;left:0;right:0;z-index:10';
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  input.replaceWith(wrap);
  wrap.append(input, list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.autocomplete = 'off';

  let matches = [];
  let active = -1;
  let picked = null;

  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); }
  function render() {
    list.innerHTML = '';
    matches.forEach((it, i) => {
      const li = document.createElement('li');
      li.id = `${list.id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.style.cssText = `padding:10px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;gap:12px;${i === active ? 'background:#e5e7eb;' : ''}`;
      const name = document.createElement('span');
      name.textContent = it.name;
      name.style.cssText = `color:${colorOf(it)};font-weight:600`;
      const meta = document.createElement('span');
      meta.textContent = metaOf(it);
      meta.style.cssText = 'color:#4b5563;font-size:13px;white-space:nowrap';
      li.append(name, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(it); });
      list.append(li);
    });
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
    list.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
  }
  function choose(it) {
    input.value = it.name;
    close();
    if (it.extra) { picked = null; input.style.color = ''; onPick(null); return; } // not in the official list: plain text
    picked = it;
    input.style.color = colorOf(it);
    onPick(it);
  }

  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (picked && input.value !== picked.name) { picked = null; input.style.color = ''; onPick(null); }
    if (q.length < 2) { matches = []; close(); return; }
    const items = await load();
    const starts = []; const contains = [];
    for (const it of items) {
      if (it.lower.startsWith(q)) starts.push(it);
      else if (it.lower.includes(q)) contains.push(it);
      if (starts.length >= 12) break;
    }
    matches = [...starts, ...contains].slice(0, 12);
    active = -1;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % matches.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; render(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('focus', () => load());

  return { reset() { picked = null; input.style.color = ''; close(); } };
}
