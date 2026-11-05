/**
 * ApiSync.gs: writes the Blizzard API values (level, race, class, professions) into the "Members" tab of the guild sheet.
 *
 * This file is a COPY for the repo: the real script lives in the sheet (Extensions → Apps Script, project "Mannenkeuken Discord Sync").
 * Add it there as a new file next to the existing script (do not replace the existing onEdit code). Setup: docs/instructies.md,
 * section "API → sheet".
 *
 * How it is used: the GitHub workflow "Update characters" (tools/update-characters.mjs) sends one POST per run to the web app URL of
 * this script, with the secret and the API values per character. The API is leading: the values in the sheet are overwritten when they
 * differ. Character names (column B), Player, Role, Status, Notes and the key recipes are never touched: the guild changes names by hand.
 *
 * Needs a Script property API_SYNC_SECRET (Project settings → Script properties), a long random text that only the developers know.
 * The same text is the GitHub Actions secret SHEET_SYNC_SECRET. A request with another secret is refused.
 *
 * Columns of Members (header row 4, players from row 5): A Player, B Character, C Race, D Class, E Role, F Level, G Profession 1,
 * H Skill 1, I Profession 2, J Skill 2, K Cooking, L First Aid, M Fishing, N Key recipes, O Last updated, P Status, Q Notes.
 */
var API_SYNC_SHEET = 'Members';
var API_SYNC_FIRST_ROW = 5;
var API_SYNC_LAST_ROW = 200;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('API_SYNC_SECRET');
    if (!secret || !body.secret || !apiSyncSame_(String(body.secret), secret)) return apiSyncJson_({ ok: false, error: 'Not allowed' });
    return apiSyncJson_(apiSyncRun_(body.updates || [], body.dryRun === true));
  } catch (err) {
    return apiSyncJson_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* not locked */ }
  }
}

// Handy for testing in the Apps Script editor: runs a dry run for one made-up update and logs the answer (writes nothing).
function apiSyncTest() {
  Logger.log(JSON.stringify(apiSyncRun_([{ character: 'Murn Rogue', level: 16, race: 'Orc', class: 'Rogue', professions: [{ name: 'Skinning', skill: 82, kind: 'primary' }] }], true)));
}

function apiSyncRun_(updates, dryRun) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(API_SYNC_SHEET);
  if (!sheet) return { ok: false, error: 'No tab ' + API_SYNC_SHEET };
  var rowCount = API_SYNC_LAST_ROW - API_SYNC_FIRST_ROW + 1;
  var values = sheet.getRange(API_SYNC_FIRST_ROW, 1, rowCount, 17).getValues(); // A..Q
  var rowOf = {};
  values.forEach(function (r, i) {
    var name = String(r[1] || '').trim().toLowerCase();
    if (name && !(name in rowOf)) rowOf[name] = i; // first row with this character
  });

  var changes = [];
  var notFound = [];
  var today = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'dd-MM-yyyy');

  updates.forEach(function (u) {
    var key = String(u.character || '').trim().toLowerCase();
    if (!(key in rowOf)) { notFound.push(u.character); return; }
    var idx = rowOf[key];
    var row = values[idx];
    var sheetRow = API_SYNC_FIRST_ROW + idx;
    var edits = []; // { col (1-based), value }
    var before = changes.length;

    function setCell(col, label, value) {
      if (value === null || value === undefined || value === '') return;
      var current = row[col - 1];
      var same = typeof value === 'number' ? Number(current) === value && current !== '' : String(current).trim() === String(value).trim();
      if (same) return;
      edits.push({ col: col, value: value });
      changes.push({ character: u.character, field: label, from: current === '' ? null : current, to: value });
      row[col - 1] = value;
    }

    if (typeof u.level === 'number') setCell(6, 'Level', u.level);
    setCell(3, 'Race', u.race);
    setCell(4, 'Class', u.class);

    var profs = u.professions || [];
    var primaries = profs.filter(function (p) { return p.kind === 'primary'; });
    var slots = [{ name: 7, skill: 8, label: 'Profession 1' }, { name: 9, skill: 10, label: 'Profession 2' }];
    var placed = {};
    // 1. a primary that is already in a slot keeps that slot (only its skill changes)
    primaries.forEach(function (p) {
      slots.forEach(function (s, i) {
        if (placed[i] === undefined && String(row[s.name - 1]).trim() === p.name) { placed[i] = p.name; setCell(s.skill, s.label + ' skill', p.skill); }
      });
    });
    // 2. other primaries go into a free slot, or replace a profession that the API no longer reports (the API is leading)
    var apiNames = primaries.map(function (p) { return p.name; });
    primaries.forEach(function (p) {
      if (placed[0] === p.name || placed[1] === p.name) return;
      for (var i = 0; i < slots.length; i++) {
        var cur = String(row[slots[i].name - 1]).trim();
        if (placed[i] === undefined && (cur === '' || apiNames.indexOf(cur) < 0)) {
          placed[i] = p.name;
          setCell(slots[i].name, slots[i].label, p.name);
          setCell(slots[i].skill, slots[i].label + ' skill', p.skill);
          return;
        }
      }
    });
    // 3. secondary professions have their own column
    profs.forEach(function (p) {
      if (p.name === 'Cooking') setCell(11, 'Cooking', p.skill);
      else if (p.name === 'First Aid') setCell(12, 'First Aid', p.skill);
      else if (p.name === 'Fishing') setCell(13, 'Fishing', p.skill);
    });

    if (changes.length > before) {
      setCell(15, 'Last updated', today); // the sheet's onEdit does not run for script edits, so set the date here
      if (!dryRun) edits.forEach(function (ed) { sheet.getRange(sheetRow, ed.col).setValue(ed.value); });
    }
  });

  return { ok: true, dryRun: dryRun, checked: updates.length, changedCharacters: Object.keys(changes.reduce(function (m, c) { m[c.character] = 1; return m; }, {})).length, changes: changes, notFound: notFound };
}

function apiSyncSame_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function apiSyncJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
