import { esc } from './sheet.js?v=__V__';
import { RACES, classesForRace, rolesForClass } from './wowdata.js?v=__V__';

const options = (list, placeholder) => [`<option value="">${placeholder}</option>`, ...list.map((x) => `<option>${esc(x)}</option>`)].join('');

// Wires the race -> class -> role dropdowns of a form (selects named race, class, role):
// each dropdown only offers what the previous choice allows.
export function wireCharacterFields(form) {
  form.race.innerHTML = '<option value="">–</option>' + Object.entries(RACES).map(([faction, races]) =>
    `<optgroup label="${faction}">${Object.keys(races).map((r) => `<option>${esc(r)}</option>`).join('')}</optgroup>`).join('');
  function fillClasses() {
    const classes = classesForRace(form.race.value);
    const keep = classes.includes(form.class.value) ? form.class.value : '';
    form.class.innerHTML = options(classes, form.race.value ? '–' : 'Pick a race first');
    form.class.value = keep;
    form.class.disabled = !form.race.value;
    fillRoles();
  }
  function fillRoles() {
    const roles = rolesForClass(form.class.value);
    const keep = roles.includes(form.role.value) ? form.role.value : '';
    form.role.innerHTML = options(roles, form.class.value ? '–' : 'Pick a class first');
    form.role.value = keep;
    form.role.disabled = !form.class.value;
  }
  form.race.addEventListener('change', fillClasses);
  form.class.addEventListener('change', fillRoles);
  fillClasses();

  return {
    // Fill the form from a saved row ({ character_name, race, class, role }).
    set(row) {
      form.character_name.value = row?.character_name ?? '';
      form.race.value = row?.race ?? '';
      fillClasses();
      form.class.value = row?.class ?? '';
      fillRoles();
      form.role.value = row?.role ?? '';
    },
    reset() { form.reset(); fillClasses(); },
    // The values to save.
    values() {
      const d = new FormData(form);
      return {
        character_name: d.get('character_name').trim() || null,
        race: d.get('race') || null,
        class: d.get('class') || null,
        role: d.get('role') || null,
      };
    },
  };
}
