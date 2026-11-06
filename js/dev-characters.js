// Developer mode → Characters: view and change the table characters.
// Developers may change everything the game does not provide (database: is_dev() in characters_guard). The table shows what the site shows:
// for a character the game knows, level, race, class and professions come from the game (applyApi() in js/sheet.js) and cannot be edited here.
import { supabase } from './supabase.js?v=__V__';
import { esc, loadBlizzard, memberFromCharacter, applyApi } from './sheet.js?v=__V__';
import { statusLabel, baseRace, loadPlayers } from './players.js?v=__V__';
import { RACES, ROLES_BY_CLASS, classesForRace, rolesForClass } from './wowdata.js?v=__V__';

const HORDE_RACES = Object.keys(RACES.Horde).map(baseRace);
const ROLES = ['Tank', 'Healer', 'DPS'];
const CLASSES = Object.keys(ROLES_BY_CLASS);
const MAIN_PROFESSIONS = ['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Herbalism', 'Leatherworking', 'Mining', 'Skinning', 'Tailoring'];
const GAME_FIELDS = ['race', 'cls', 'level', 'prof1', 'skill1', 'prof2', 'skill2', 'cooking', 'firstAid', 'fishing'];
const SECONDARY = [['cooking', 'Cooking'], ['firstAid', 'First Aid'], ['fishing', 'Fishing']];
const STATUSES = ['Main', 'Alt', 'Gestopt'];
const FIELDS = ['player', 'character', 'status', 'race', 'cls', 'role', 'level', 'prof1', 'skill1', 'prof2', 'skill2', 'cooking', 'firstAid', 'fishing', 'recipes', 'notes'];

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const numberOrNull = (v) => (blank(v) ? null : Number(v));
const textOrNull = (v) => (blank(v) ? null : String(v).trim());
// Form values → a row of the table. Professions that the form does not show (none today) stay as they were.
export function toRow(v, old = null) {
  const professions = [];
  for (const [name, skill] of [[v.prof1, v.skill1], [v.prof2, v.skill2]]) if (!blank(name)) professions.push({ name: String(name).trim(), kind: 'primary', skill: numberOrNull(skill) });
  for (const [field, name] of SECONDARY) if (!blank(v[field])) professions.push({ name, kind: 'secondary', skill: Number(v[field]) });
  const shown = new Set([...MAIN_PROFESSIONS, ...SECONDARY.map(([, n]) => n)]);
  for (const p of old?.professions ?? []) if (p.kind !== 'primary' && !shown.has(p.name)) professions.push(p);
  return {
    player_name: String(v.player).trim(), name: String(v.character).trim(), race: textOrNull(v.race), class: textOrNull(v.cls), role: textOrNull(v.role),
    level: numberOrNull(v.level), status: v.status || 'Alt', notes: textOrNull(v.notes), recipes: textOrNull(v.recipes), professions,
  };
}
// Client-side check; the database checks again.
export function problemIn(v) {
  if (blank(v.player)) return 'Fill in the player.';
  if (blank(v.character)) return 'Fill in the character name.';
  if (!blank(v.level) && !(Number.isInteger(Number(v.level)) && Number(v.level) >= 1 && Number(v.level) <= 60)) return 'Level must be a whole number from 1 to 60.';
  if (!blank(v.prof1) && !blank(v.prof2) && same(v.prof1, v.prof2)) return 'Profession 1 and 2 are the same.';
  for (const f of ['skill1', 'skill2', 'cooking', 'firstAid', 'fishing']) if (!blank(v[f]) && !(Number(v[f]) >= 0 && Number(v[f]) <= 300)) return 'Skills must be from 0 to 300.';
  return null;
}
const friendly = (error) => (error.code === '23505' && /name/.test(error.message) ? 'A character with this name already exists.' : error.code === '23505' ? 'This player already has a main.' : error.message);

const options = (list, current, label = (x) => x) => {
  const all = !blank(current) && !list.some((x) => same(x, current)) ? [current, ...list] : list;
  return `<option value=""></option>${all.map((x) => `<option value="${esc(x)}"${same(x, current) ? ' selected' : ''}>${esc(label(x))}</option>`).join('')}`;
};

export function initCharacters(host) {
  let rows = [];
  let players = [];
  let q = '';
  let sort = { key: 'player', dir: 1 };

  host.innerHTML = `
    <section class="box char-head">
      <div class="page-head"><h2>Characters</h2><button class="btn btn-primary" type="button" data-add>+ Add character</button></div>
      <p class="muted char-text">All characters of the guild, as the site shows them. Characters show up in the game data from level 10: from then on the level, race, class and professions come from the game.</p>
      <div class="char-filters">
        <label>Search<input type="search" data-q placeholder="Player, character or profession"></label>
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
    ['updated', 'Last updated', (r) => `<span title="${esc(r.updatedBy ? `By ${r.updatedBy}` : '')}">${esc(r.updated)}</span>`],
  ];
  const NUMERIC = ['level', 'cooking', 'firstAid', 'fishing'];

  function cell(r, [key, , fn, skill]) {
    let html = fn ? fn(r) : esc(r[key] ?? '');
    if (skill && !blank(r[skill])) html += ` <span class="muted">(${esc(r[skill])})</span>`;
    return `<td class="${NUMERIC.includes(key) ? 'num' : ''}${key === 'recipes' || key === 'notes' ? ' wrap' : ''}">${html}</td>`;
  }

  function draw() {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = rows.filter((r) => {
      const hay = `${r.player} ${r.character} ${r.prof1} ${r.prof2} ${r.race} ${r.cls}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    list = [...list].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      return (NUMERIC.includes(sort.key) ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''))) * sort.dir;
    });
    $('[data-count]').textContent = `${rows.length} characters`;
    $('[data-head]').innerHTML = `<tr><th></th>${COLS.map(([k, label]) => `<th class="${NUMERIC.includes(k) ? 'num' : ''}"><button type="button" class="link-btn char-sort" data-sort="${k}">${label}${sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr>`;
    $('[data-rows]').innerHTML = list.map((r) => {
      const i = rows.indexOf(r);
      return `<tr><td class="char-actions"><button type="button" class="link-btn" data-edit="${i}">Edit</button> <button type="button" class="link-btn" data-del="${i}">Delete</button></td>${COLS.map((c) => cell(r, c)).join('')}</tr>`;
    }).join('') || `<tr><td colspan="${COLS.length + 1}" class="muted">Nothing matches.</td></tr>`;
  }

  async function load() {
    say('');
    const [{ data, error }, list, bz] = await Promise.all([supabase.from('characters').select('*').order('created_at'), loadPlayers(), loadBlizzard()]);
    players = list.map((p) => p.player_name);
    if (error) { $('[data-rows]').innerHTML = `<tr><td class="muted">Could not read the characters: ${esc(error.message)}</td></tr>`; return; }
    rows = applyApi((data ?? []).map((c) => ({ ...memberFromCharacter(c), id: c.id, raw: c, updatedBy: c.updated_by })), bz);
    draw();
  }

  // Saves one character. A new player is added after a question; a new main takes over from the old one (the database allows one per player).
  async function save(row, values) {
    const player = String(values.player).trim();
    const existing = players.find((p) => same(p, player));
    if (!existing) {
      if (!confirm(`Are you sure you want to add ${player} as a new player? They then also appear under "Choose your player".`)) return { cancelled: true };
      const { error } = await supabase.from('players').insert({ player_name: player });
      if (error) return { error };
    }
    const record = toRow({ ...values, player: existing ?? player }, row?.raw);
    if (row?.fromApi) for (const k of ['race', 'class', 'level', 'professions']) delete record[k]; // comes from the game
    // The first character of a player is the main (same rule as for players themselves in the database).
    if (!row && record.status === 'Alt' && !rows.some((r) => same(r.player, record.player_name) && r.status === 'Main')) record.status = 'Main';
    if (record.status === 'Main') {
      const other = rows.find((r) => same(r.player, record.player_name) && r.status === 'Main' && r.id !== row?.id);
      if (other) {
        const { error } = await supabase.from('characters').update({ status: 'Alt' }).eq('id', other.id);
        if (error) return { error };
      }
    }
    const query = row ? supabase.from('characters').update(record).eq('id', row.id) : supabase.from('characters').insert(record);
    const { data, error } = await query.select();
    if (error) return { error };
    if (!data?.length) return { error: { message: 'You have no permission for this.' } };
    return {};
  }

  function openForm(row) {
    const v = row ?? { status: 'Alt' };
    const num = (name, label, max, min = 0) => `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" value="${esc(v[name] ?? '')}"></label>`;
    const prof = (name, label) => `<label>${label}<select name="${name}">${options(MAIN_PROFESSIONS, v[name])}</select></label>`;
    form.innerHTML = `
      <h3>${row ? `Edit ${esc(row.character)}` : 'Add a character'}</h3>
      ${row?.fromApi ? '<p class="muted char-text full">The game knows this character, so the level, race, class and professions come from there.</p>' : ''}
      <label>Player<input name="player" required maxlength="40" list="char-players" value="${esc(v.player ?? '')}"><datalist id="char-players">${[...players].sort().map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label>Character<input name="character" required maxlength="60" value="${esc(v.character ?? '')}"></label>
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
    // Class follows the race, role follows the class; a value that is already saved always stays selectable.
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
    if (row?.fromApi) for (const k of GAME_FIELDS) f[k].disabled = true;
    form.querySelector('[data-cancel]').addEventListener('click', () => { form.hidden = true; });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-form-msg]');
      const values = Object.fromEntries(FIELDS.map((k) => [k, (f[k].value ?? '').trim()]));
      const problem = problemIn(values);
      if (problem) { msg.textContent = problem; return; }
      const send = form.querySelector('[type="submit"]');
      send.disabled = true;
      msg.textContent = 'Saving…';
      const { error, cancelled } = await save(row, values);
      if (cancelled || error) {
        send.disabled = false;
        msg.textContent = error ? `Not saved: ${friendly(error)}` : '';
        return;
      }
      form.hidden = true;
      await load();
      say(`Saved: ${values.character}.`);
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
      if (!confirm(`Are you sure you want to delete ${r.character} of ${r.player}? This cannot be undone.`)) return;
      const { data, error } = await supabase.from('characters').delete().eq('id', r.id).select();
      if (error || !data?.length) { say(`Not deleted: ${error ? friendly(error) : 'you have no permission for this.'}`); return; }
      form.hidden = true;
      await load();
      say(`Deleted: ${r.character}.`);
    }
  });
  $('[data-q]').addEventListener('input', (e) => { q = e.target.value; draw(); });
  load();
}
