// Item search with suggestions while typing (WoW: Forever item list in data/items.json,
// refreshed weekly by the "Update items" GitHub workflow).

const QUALITY = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact', 'Heirloom'];
// Darker variants of the in-game colours so they stay readable on white.
const COLOR = ['#6b7280', '#1f2937', '#1a7f00', '#0058b0', '#7e2fc0', '#b45309', '#8a6d1f', '#007a99'];

let itemsPromise = null;
export function loadItems() {
  itemsPromise ??= fetch('data/items.json?v=__V__')
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d) => (d.items ?? []).map(([id, name, quality, ilvl]) => ({ id, name, quality, ilvl, lower: name.toLowerCase() })))
    .catch(() => []);
  return itemsPromise;
}

export const qualityColor = (q) => COLOR[q] ?? COLOR[1];
export const qualityName = (q) => QUALITY[q] ?? '';

// Turns <input> into a combobox. onPick(item|null) is called when an item is chosen or the text no longer matches it.
export function attachItemSearch(input, onPick) {
  const list = document.createElement('ul');
  list.id = `${input.name || 'item'}-suggestions`;
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
      name.style.cssText = `color:${qualityColor(it.quality)};font-weight:600`;
      const meta = document.createElement('span');
      meta.textContent = it.ilvl ? `ilvl ${it.ilvl}` : '';
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
    picked = it;
    input.value = it.name;
    input.style.color = qualityColor(it.quality);
    close();
    onPick(it);
  }

  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (picked && input.value !== picked.name) { picked = null; input.style.color = ''; onPick(null); }
    if (q.length < 2) { matches = []; close(); return; }
    const items = await loadItems();
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
  input.addEventListener('focus', () => loadItems());

  return { reset() { picked = null; input.style.color = ''; close(); } };
}
