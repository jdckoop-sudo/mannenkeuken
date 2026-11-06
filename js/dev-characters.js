// Developer mode → Characters: view and change the Members tab of the guild sheet from the site.
// Reads and writes go through the Edge Function sheet-edit (only developers) to the Apps Script in the sheet (tools/sheet-script/SheetEdit.gs).
// While that is not set up, the list is read from the public sheet and cannot be saved.
// The table shows what is in the SHEET. Where the game (Blizzard API) knows better, a small orange value shows what the site displays instead (applyApi() in js/sheet.js).
import { supabase } from './supabase.js?v=__V__';
import { esc, fetchMembers, loadBlizzard } from './sheet.js?v=__V__';
import { statusLabel, baseRace } from './players.js?v=__V__';
import { RACES, ROLES_BY_CLASS, classesForRace, rolesForClass } from './wowdata.js?v=__V__';

const HORDE_RACES = Object.keys(RACES.Horde).map(baseRace);
const ROLES = ['Tank', 'Healer', 'DPS'];
const CLASSES = Object.keys(ROLES_BY_CLASS);
const MAIN_PROFESSIONS = ['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Herbalism', 'Leatherworking', 'Mining', 'Skinning', 'Tailoring'];
const STATUSES = ['Main', 'Alt', 'Gestopt'];
const FIELDS = ['player', 'character', 'status', 'race', 'cls', 'role', 'level', 'prof1', 'skill1', 'prof2', 'skill2', 'cooking', 'firstAid', 'fishing', 'recipes', 'notes'];

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const blank = (v) => v === null || v === undefined || String(v).trim() === '';
// The game says "Windshaper Skyborne", the sheet has "Skyborne".
export const sheetRace = (race) => (/skyborne/i.test(race ?? '') ? 'Skyborne' : race ?? '');

// What the game says for this sheet row, in the same fields as the row; null when the game does not know the character.
// Same rules as applyApi(); a profession stays in its own column when the sheet already has it there, so the order does not count as a difference.
export function gameValues(row, entry) {
  if (!entry || entry.status !== 'ok') return null;
  const out = {};
  if (entry.level != null) out.level = entry.level;
  if (entry.race) out.race = sheetRace(entry.race);
  if (entry.class) out.cls = entry.class;
  const profs = (entry.professions ?? []).filter((p) => p.skill !== null && p.skill !== undefined);
  if (!profs.length) return out;
  const primaries = profs.filter((p) => p.kind === 'primary').slice(0, 2);
  const inFirst = primaries.find((p) => same(p.name, row.prof1));
  const inSecond = primaries.find((p) => same(p.name, row.prof2));
  const rest = primaries.filter((p) => p !== inFirst && p !== inSecond);
  const first = inFirst ?? rest.shift();
  const second = inSecond ?? rest.shift();
  out.prof1 = first?.name ?? ''; out.skill1 = first?.skill ?? '';
  out.prof2 = second?.name ?? ''; out.skill2 = second?.skill ?? '';
  for (const [field, name] of [['cooking', 'Cooking'], ['firstAid', 'First Aid'], ['fishing', 'Fishing']]) {
    const p = profs.find((x) => x.name === name);
    out[field] = p ? p.skill : '';
  }
  return out;
}
// The fields where the sheet and the game differ.
export function differences(row, game) {
  if (!game) return [];
  return Object.keys(game).filter((f) => (f === 'skill1' || f === 'skill2' || f === 'level' || ['cooking', 'firstAid', 'fishing'].includes(f)
    ? String(row[f] ?? '').trim() !== String(game[f] ?? '').trim()
    : !same(row[f], game[f])));
}
// Only what is different, so a save touches as little of the sheet as possible.
export function changedValues(row, values) {
  const out = {};
  for (const f of FIELDS) if (String(row?.[f] ?? '').trim() !== String(values[f] ?? '').trim()) out[f] = values[f] ?? '';
  return out;
}
// Client-side check; the Apps Script checks again.
export function problemIn(v) {
  if (blank(v.player)) return 'Fill in the player.';
  if (!blank(v.level) && !(Number(v.level) >= 1 && Number(v.level) <= 60)) return 'Level must be from 1 to 60.';
  if (!blank(v.prof1) && !blank(v.prof2) && same(v.prof1, v.prof2)) return 'Profession 1 and 2 are the same.';
  for (const f of ['skill1', 'skill2', 'cooking', 'firstAid', 'fishing']) if (!blank(v[f]) && !(Number(v[f]) >= 0 && Number(v[f]) <= 300)) return 'Skills must be from 0 to 300.';
  return null;
}

async function callSheet(body) {
  const { data, error } = await supabase.functions.invoke('sheet-edit', { body });
  if (!error) return data;
  let message = error.message;
  try { message = (await error.context.json()).error ?? message; } catch { /* no JSON answer */ }
  const e = new Error(message);
  e.notSetUp = !error.context || error.context.status === 404 || /secrets|Failed to send/i.test(message);
  throw e;
}

const options = (list, current, label = (x) => x) => {
  const all = !blank(current) && !list.some((x) => same(x, current)) ? [current, ...list] : list;
  return `<option value=""></option>${all.map((x) => `<option value="${esc(x)}"${same(x, current) ? ' selected' : ''}>${esc(label(x))}</option>`).join('')}`;
};

export function initCharacters(host) {
  let rows = [];
  let bz = null;
  let canSave = false;
  let q = '';
  let onlyDiff = false;
  let sort = { key: 'player', dir: 1 };
  const entryOf = (r) => bz?.characters?.[String(r.character ?? '').trim().toLowerCase()];
  const gameOf = (r) => gameValues(r, entryOf(r));

  host.innerHTML = `
    <section class="box char-head">
      <div class="page-head"><h2>Characters</h2><button class="btn btn-primary" type="button" data-add>+ Add character</button></div>
      <p class="muted char-text">This is the <strong>Members</strong> tab of the guild sheet; what you save here goes straight into the sheet. <span class="char-api">Orange</span> means the game knows better: the site shows that value, whatever the sheet says.</p>
      <p class="notice char-text" data-status hidden></p>
      <div class="char-filters">
        <label>Search<input type="search" data-q placeholder="Player, character or profession"></label>
        <label class="char-check"><input type="checkbox" data-diff> Only differences with the game</label>
        <button class="btn" type="button" data-reload>Reload</button>
      </div>
      <p class="muted char-text" data-count></p>
      <p class="char-msg" role="status" data-msg></p>
    </section>
    <form class="box char-form" hidden></form>
    <div class="table-wrap"><table class="char-table"><thead data-head></thead><tbody data-rows><tr><td>Loading…</td></tr></tbody></table></div>`;
  const $ = (s) => host.querySelector(s);
  const form = $('.char-form');
  const say = (text) => { $('[data-msg]').textContent = text; };

  const COLS = [
    ['status', 'Status', (r) => esc(statusLabel(r.status))],
    ['player', 'Player'],
    ['character', 'Character'],
    ['race', 'Race'],
    ['cls', 'Class'],
    ['role', 'Role'],
    ['level', 'Level'],
    ['prof1', 'Profession 1', null, 'skill1'],
    ['prof2', 'Profession 2', null, 'skill2'],
    ['cooking', 'Cooking'],
    ['firstAid', 'First Aid'],
    ['fishing', 'Fishing'],
    ['recipes', 'Key recipes'],
    ['notes', 'Notes'],
    ['updated', 'Last updated'],
  ];
  const NUMERIC = ['level', 'cooking', 'firstAid', 'fishing'];

  function cell(r, game, diff, [key, , fn, skill]) {
    let html = fn ? fn(r) : esc(r[key] ?? '');
    if (skill && !blank(r[skill])) html += ` <span class="muted">(${esc(r[skill])})</span>`;
    if (diff.includes(key) || (skill && diff.includes(skill))) {
      const skillText = skill && !blank(game[skill]) ? `(${game[skill]})` : '';
      // Same profession, other skill: only the skill is news
      const shown = skill ? (same(r[key], game[key]) ? skillText : `${game[key] || '–'} ${skillText}`.trim()) : (blank(game[key]) ? '–' : game[key]);
      html += ` <span class="char-api" title="The site shows this value from the game">${esc(shown)}</span>`;
    }
    return `<td class="${NUMERIC.includes(key) ? 'num' : ''}${key === 'recipes' || key === 'notes' ? ' wrap' : ''}">${html}</td>`;
  }

  function draw() {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const withDiff = rows.filter((r) => differences(r, gameOf(r)).length).length;
    let list = rows.filter((r) => {
      if (onlyDiff && !differences(r, gameOf(r)).length) return false;
      const hay = `${r.player} ${r.character} ${r.prof1} ${r.prof2} ${r.race} ${r.cls}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    list = [...list].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      const nums = NUMERIC.includes(sort.key);
      return (nums ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''))) * sort.dir;
    });
    $('[data-count]').textContent = `${rows.length} rows in the sheet · ${withDiff} differ from the game`;
    $('[data-head]').innerHTML = `<tr><th></th>${COLS.map(([k, label]) => `<th class="${NUMERIC.includes(k) ? 'num' : ''}"><button type="button" class="link-btn char-sort" data-sort="${k}">${label}${sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr>`;
    $('[data-rows]').innerHTML = list.map((r) => {
      const game = gameOf(r);
      const diff = differences(r, game);
      const i = rows.indexOf(r);
      return `<tr><td class="char-actions"><button type="button" class="link-btn" data-edit="${i}">Edit</button> <button type="button" class="link-btn" data-del="${i}">Delete</button></td>${COLS.map((c) => cell(r, game, diff, c)).join('')}</tr>`;
    }).join('') || `<tr><td colspan="${COLS.length + 1}" class="muted">Nothing matches.</td></tr>`;
  }

  async function load() {
    say('');
    const statusEl = $('[data-status]');
    bz = await loadBlizzard();
    try {
      const out = await callSheet({ action: 'list' });
      if (!out?.ok) throw new Error(out?.error ?? 'No answer');
      rows = out.rows;
      canSave = true;
      statusEl.hidden = true;
    } catch (e) {
      canSave = false;
      statusEl.hidden = false;
      statusEl.textContent = e.notSetUp
        ? 'Saving is not switched on yet: the connection to the sheet still has to be set up (docs/instructies.md, "Characters beheren"). You see the sheet as it is; nothing can be saved.'
        : `Could not reach the sheet for saving: ${e.message}. You see the public copy of the sheet; nothing can be saved.`;
      rows = (await fetchMembers().catch(() => [])).map((r, i) => ({ ...r, row: null, _i: i }));
    }
    draw();
  }

  function openForm(row) {
    const v = row ?? { status: 'Alt' };
    const game = row ? gameOf(row) : null;
    const num = (name, label, max, min = 0) => `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" value="${esc(v[name] ?? '')}"></label>`;
    const prof = (name, label) => `<label>${label}<select name="${name}">${options(MAIN_PROFESSIONS, v[name])}</select></label>`;
    form.innerHTML = `
      <h3>${row ? `Edit ${esc(row.character || row.player)}` : 'Add a character'}</h3>
      ${game ? `<p class="muted char-text full">The game knows this character. <button type="button" class="link-btn" data-fill>Fill in the values from the game</button>, then save, to make the sheet match.</p>` : ''}
      <label>Player<input name="player" required maxlength="60" list="char-players" value="${esc(v.player ?? '')}"><datalist id="char-players">${[...new Set(rows.map((r) => r.player).filter(Boolean))].sort().map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label>Character<input name="character" maxlength="60" value="${esc(v.character ?? '')}"></label>
      <label>Status<select name="status">${options(STATUSES, v.status, statusLabel)}</select></label>
      <label>Race<select name="race">${options(HORDE_RACES, v.race)}</select></label>
      <label>Class<select name="cls"></select></label>
      <label>Role<select name="role"></select></label>
      ${num('level', 'Level', 60, 1)}
      ${prof('prof1', 'Profession 1')}${num('skill1', 'Skill 1', 300)}
      ${prof('prof2', 'Profession 2')}${num('skill2', 'Skill 2', 300)}
      ${num('cooking', 'Cooking', 300)}${num('firstAid', 'First Aid', 300)}${num('fishing', 'Fishing', 300)}
      <label class="full">Key recipes<input name="recipes" maxlength="500" value="${esc(v.recipes ?? '')}"></label>
      <label class="full">Notes<input name="notes" maxlength="500" value="${esc(v.notes ?? '')}"></label>
      <p class="char-msg full" role="status" data-form-msg></p>
      <div class="row full"><button class="btn btn-primary" type="submit">${row ? 'Save' : 'Add'}</button><button class="btn" type="button" data-cancel>Cancel</button></div>`;
    const f = form.elements;
    // Class follows the race, role follows the class; a value already in the sheet always stays selectable.
    const fillRole = (current) => { f.role.innerHTML = options(f.cls.value && rolesForClass(f.cls.value).length ? rolesForClass(f.cls.value) : ROLES, current); };
    const fillClass = (current) => {
      const key = Object.keys(RACES.Horde).find((r) => baseRace(r) === f.race.value);
      f.cls.innerHTML = options(key ? classesForRace(key) : CLASSES, current);
      fillRole(f.role.value || v.role);
    };
    fillClass(v.cls);
    fillRole(v.role);
    f.race.addEventListener('change', () => fillClass(f.cls.value));
    f.cls.addEventListener('change', () => fillRole(f.role.value));
    form.querySelector('[data-fill]')?.addEventListener('click', () => {
      for (const [k, val] of Object.entries(game)) {
        if (!f[k]) continue;
        if (f[k].tagName === 'SELECT' && !blank(val) && ![...f[k].options].some((o) => same(o.value, val))) f[k].insertAdjacentHTML('beforeend', `<option value="${esc(val)}">${esc(val)}</option>`);
        f[k].value = val;
        if (k === 'race') fillClass(game.cls ?? f.cls.value);
      }
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => { form.hidden = true; });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-form-msg]');
      const values = Object.fromEntries(FIELDS.map((k) => [k, (f[k].value ?? '').trim()]));
      const problem = problemIn(values);
      if (problem) { msg.textContent = problem; return; }
      if (!canSave) { msg.textContent = 'Saving is not switched on yet, so this was not saved.'; return; }
      const change = changedValues(row, values);
      if (row && !Object.keys(change).length) { form.hidden = true; return; }
      const send = form.querySelector('[type="submit"]');
      send.disabled = true;
      msg.textContent = 'Saving…';
      try {
        const out = await callSheet(row
          ? { action: 'update', row: row.row, expect: { player: row.player, character: row.character }, values: change }
          : { action: 'add', values: change });
        if (!out?.ok) throw new Error(out?.error ?? 'No answer');
        form.hidden = true;
        await load();
        say(`Saved in the sheet: ${values.character || values.player}.`);
      } catch (err) {
        send.disabled = false;
        msg.textContent = `Not saved: ${err.message}`;
      }
    };
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sort) {
      sort = { key: b.dataset.sort, dir: sort.key === b.dataset.sort ? -sort.dir : 1 };
      draw();
    } else if ('add' in b.dataset) openForm(null);
    else if ('reload' in b.dataset) load();
    else if (b.dataset.edit !== undefined) openForm(rows[Number(b.dataset.edit)]);
    else if (b.dataset.del !== undefined) {
      const r = rows[Number(b.dataset.del)];
      if (!canSave) { say('Saving is not switched on yet, so nothing can be deleted.'); return; }
      if (!confirm(`Are you sure you want to delete ${r.character || 'this character'} of ${r.player} from the guild sheet? This removes the whole row.`)) return;
      try {
        const out = await callSheet({ action: 'delete', row: r.row, expect: { player: r.player, character: r.character } });
        if (!out?.ok) throw new Error(out?.error ?? 'No answer');
        form.hidden = true;
        await load();
        say(`Deleted from the sheet: ${r.character || r.player}.`);
      } catch (err) { say(`Not deleted: ${err.message}`); }
    }
  });
  $('[data-q]').addEventListener('input', (e) => { q = e.target.value; draw(); });
  $('[data-diff]').addEventListener('change', (e) => { onlyDiff = e.target.checked; draw(); });
  load();
}
