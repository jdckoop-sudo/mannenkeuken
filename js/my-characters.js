// My profile: a player's own characters, from the table characters.
// While the game does not know a character (under level 10) the player can change its name, race, class and role; after that only the role.
// Level and professions come from the game. The database enforces the same rules (trigger characters_guard in supabase/schema.sql).
import { supabase, getMyCharacters } from './supabase.js?v=__V__';
import { esc, loadBlizzard } from './sheet.js?v=__V__';
import { baseRace, playerUrl, characterUrl } from './players.js?v=__V__';
import { wireCharacterFields } from './charform.js?v=__V__';
import { rolesForClass } from './wowdata.js?v=__V__';
import { refreshTooltips } from './itemsearch.js?v=__V__';
import { characterDoll } from './charpicture.js?v=__V__';

// The list says "Skyborne", the form needs the faction ("Skyborne (Horde)": we are a Horde guild).
export const formRace = (race) => (race === 'Skyborne' ? 'Skyborne (Horde)' : race ?? '');
// The game says "Windshaper Skyborne"; the role list needs the plain class only.
export const isKnown = (entry) => entry?.status === 'ok';
// Alts: highest level first (the game's level when it knows the character), then by name.
export function sortAlts(alts, entryOf) {
  const level = (c) => Number(entryOf(c)?.status === 'ok' ? entryOf(c).level : c.level) || 0;
  return [...alts].sort((a, b) => level(b) - level(a) || String(a.name).localeCompare(String(b.name)));
}
const friendly = (error) => (error.code === '23505' ? 'A character with this name already exists.' : error.message);

export function initMyCharacters(host, user) {
  let chars = [];
  let bz = null;
  const entryOf = (c) => bz?.characters?.[String(c.name ?? '').trim().toLowerCase()];

  host.innerHTML = `
    <p id="player-link" style="font-size:14px;margin:0">${user.player ? `You are <strong>${esc(user.player)}</strong> · <a href="${playerUrl(user.player)}">View your player page &amp; stats</a>` : ''}</p>
    <section class="box" data-choose hidden>
      <h2>Which character is your main?</h2>
      <p class="muted" style="margin:0">None of your characters is marked as your main yet. Pick your main; the others become alts.</p>
      <div data-choose-list style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="row"><button class="btn btn-primary" type="button" data-choose-save>Save my main</button></div>
      <p class="muted" style="margin:0" role="status" data-choose-msg></p>
    </section>
    <div class="my-chars">
      <div data-main class="my-chars-list"></div>
      <div data-alts class="my-chars-list"></div>
    </div>
    <div><button class="btn" type="button" data-add>Add an alt</button></div>`;
  const $ = (s) => host.querySelector(s);

  const pickList = (list) => list.map((c) => `<label style="display:flex;align-items:center;gap:10px;margin:0"><input type="radio" name="main-pick" value="${esc(c.name)}" style="width:auto"><span><strong>${esc(c.name)}</strong> <span class="muted">${esc([c.race, c.class].filter(Boolean).join(' · '))}</span></span></label>`).join('');

  async function makeMain(name, note, btn) {
    if (!confirm(`Are you sure you want to make ${name} your main? Your other characters become alts.`)) return;
    btn.disabled = true;
    const { error } = await supabase.rpc('set_main_character', { p_character: name });
    btn.disabled = false;
    if (error) { note.textContent = `Could not save: ${error.message}`; return; }
    await load();
  }

  // Under the main: a small Switch main button that opens a list of the other characters.
  function switchMainHtml() {
    return `<div data-switch-panel hidden style="display:none;flex-direction:column;gap:8px;border-top:1px solid var(--border);padding-top:12px">
      <p class="muted" style="margin:0;font-size:14px">Pick the character that becomes your main. Your current main becomes an alt.</p>
      <div data-switch-list style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="row"><button class="btn btn-primary" type="button" data-switch-save>Make main</button><button class="btn" type="button" data-switch-cancel>Cancel</button></div>
      <p class="muted" style="margin:0;font-size:14px" role="status" data-switch-msg></p>
    </div>`;
  }
  function wireSwitch(card, current) {
    const panel = card.querySelector('[data-switch-panel]');
    const btn = card.querySelector('[data-switch]');
    if (!panel || !btn) return;
    const toggle = (open) => { panel.hidden = !open; panel.style.display = open ? 'flex' : 'none'; };
    btn.addEventListener('click', () => { panel.querySelector('[data-switch-list]').innerHTML = pickList(chars.filter((c) => c.id !== current.id)); toggle(panel.hidden); });
    card.querySelector('[data-switch-cancel]').addEventListener('click', () => toggle(false));
    card.querySelector('[data-switch-save]').addEventListener('click', (e) => {
      const pick = panel.querySelector('input[name="main-pick"]:checked')?.value;
      const note = panel.querySelector('[data-switch-msg]');
      if (!pick) { note.textContent = 'Pick a character first.'; return; }
      makeMain(pick, note, e.target);
    });
  }

  async function saveRow(c, values, msg) {
    const query = c ? supabase.from('characters').update(values).eq('id', c.id) : supabase.from('characters').insert({ player_name: user.player, ...values });
    const { data, error } = await query.select();
    if (error) { msg.textContent = `Could not save: ${friendly(error)}`; return; }
    if (!data?.length) { msg.textContent = 'Could not save: you have no permission for this.'; return; }
    await load();
  }

  // The game knows this character: everything comes from there, only the role can be chosen.
  function knownCard(c, title, isMain, entry) {
    const form = document.createElement('form');
    form.className = 'box';
    const cls = entry.class || c.class;
    const roles = rolesForClass(cls);
    const list = !c.role || roles.includes(c.role) ? roles : [c.role, ...roles];
    form.innerHTML = `
      <h2>${esc(title)}</h2>
      <p class="muted" style="margin:0;font-size:14px">The game knows this character, so everything except the role comes from there.</p>
      <p style="margin:0">${entry.level ? `Level ${esc(entry.level)} · ` : ''}<a href="${characterUrl(c.name)}">View character page</a></p>
      <label>Character name<input value="${esc(c.name)}" disabled></label>
      <label>Race<input value="${esc(entry.race || c.race || '')}" disabled></label>
      <label>Class<input value="${esc(cls || '')}" disabled></label>
      <label>Role<select name="role"><option value="">–</option>${list.map((r) => `<option${r === c.role ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <p class="muted" style="margin:0" role="status" data-msg></p>
      <div class="row"><button class="btn btn-primary" type="submit">Save role</button>${isMain && chars.length > 1 ? '<button class="btn" type="button" data-switch>Switch main</button>' : ''}</div>
      ${isMain && chars.length > 1 ? switchMainHtml() : ''}`;
    form.addEventListener('submit', (e) => { e.preventDefault(); saveRow(c, { role: form.role.value || null }, form.querySelector('[data-msg]')); });
    wireSwitch(form, c);
    return form;
  }

  // Not in the game data (yet): name, race, class and role. Level and professions follow by themselves.
  function openCard(c, title, isMain) {
    const form = document.createElement('form');
    form.className = 'box';
    form.innerHTML = `
      <h2>${esc(title)}</h2>
      <p class="muted" style="margin:0;font-size:14px">Level and professions appear by themselves from level 10. After that, only the role can be changed here.</p>
      <label>Character name<input name="character_name" required maxlength="60" placeholder="First name and surname, as in the game"></label>
      <label>Race<select name="race"></select></label>
      <label>Class<select name="class"></select></label>
      <label>Role<select name="role"></select></label>
      <p class="muted" style="margin:0" role="status" data-msg></p>
      <div class="row"><button class="btn btn-primary" type="submit">${c ? 'Save' : 'Add character'}</button>${c ? '' : '<button class="btn" type="button" data-cancel>Cancel</button>'}${isMain && chars.length > 1 ? '<button class="btn" type="button" data-switch>Switch main</button>' : ''}</div>
      ${isMain && chars.length > 1 ? switchMainHtml() : ''}`;
    const fields = wireCharacterFields(form);
    if (c) fields.set({ character_name: c.name, race: formRace(c.race), class: c.class, role: c.role });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = fields.values();
      const msg = form.querySelector('[data-msg]');
      if (!v.character_name) { msg.textContent = 'Fill in the character name.'; return; }
      saveRow(c, { name: v.character_name, race: v.race ? baseRace(v.race) : null, class: v.class, role: v.role }, msg);
    });
    form.querySelector('[data-cancel]')?.addEventListener('click', () => { form.remove(); $('[data-add]').hidden = false; });
    wireSwitch(form, c);
    return form;
  }

  // Every card looks the same: the form on top, below it the picture (the class icon as long as the game has no picture)
  // with what the character wears around it, as names that link to Wowhead.
  function layout(form, c) {
    const left = document.createElement('div');
    left.className = 'my-char-left';
    left.append(...form.childNodes);
    form.classList.add('my-char-card');
    const doll = characterDoll(c ? entryOf(c) : null, c?.name, c?.class);
    form.append(left, doll);
    return form;
  }
  const card = (c, title, isMain) => layout(isKnown(entryOf(c)) ? knownCard(c, title, isMain, entryOf(c)) : openCard(c, title, isMain), c);

  async function load() {
    [chars, bz] = await Promise.all([getMyCharacters(user), loadBlizzard()]);
    const main = chars.find((c) => c.status === 'Main') ?? (chars.length === 1 ? chars[0] : null);
    const alts = sortAlts(chars.filter((c) => c !== main), entryOf);
    const choose = $('[data-choose]');
    choose.hidden = !!main || chars.length < 2;
    $('[data-choose-list]').innerHTML = choose.hidden ? '' : pickList(chars);
    const mainBox = $('[data-main]');
    const altBox = $('[data-alts]');
    mainBox.replaceChildren();
    altBox.replaceChildren();
    if (main) mainBox.append(card(main, 'Main character', true));
    else if (!chars.length) mainBox.append(layout(openCard(null, 'Your character (your main)', false), null));
    alts.forEach((c, i) => altBox.append(card(c, main ? `Alt ${i + 1}` : c.name, false)));
    $('[data-add]').hidden = !chars.length;
    refreshTooltips();
  }

  $('[data-choose-save]').addEventListener('click', (e) => {
    const pick = $('[data-choose-list] input[name="main-pick"]:checked')?.value;
    const note = $('[data-choose-msg]');
    if (!pick) { note.textContent = 'Pick a character first.'; return; }
    makeMain(pick, note, e.target);
  });
  $('[data-add]').addEventListener('click', () => {
    $('[data-alts]').append(layout(openCard(null, 'Add an alt', false), null));
    $('[data-add]').hidden = true;
  });
  return load();
}
