/**
 * SheetEdit.gs: lets developer mode (dev.html → Characters) read and change the "Members" tab of the guild sheet.
 *
 * This file is a COPY for the repo: the real script lives in the sheet (Extensions → Apps Script, project "Mannenkeuken Discord Sync").
 * Add it there as a new file next to the existing script (do not replace the existing onEdit code). Setup: docs/instructies.md,
 * section "Characters beheren (developer mode)".
 *
 * Route: dev.html → Supabase Edge Function sheet-edit (checks that the caller is a developer) → this web app (checks the secret).
 * Needs a Script property SHEET_EDIT_SECRET (Project settings → Script properties), a long random text. The same text is the Edge Function
 * secret SHEET_EDIT_SECRET. A request with another secret is refused.
 *
 * Columns of Members (header row 4, players from row 5): A Player, B Character, C Race, D Class, E Role, F Level, G Profession 1, H Skill 1,
 * I Profession 2, J Skill 2, K Cooking, L First Aid, M Fishing, N Key recipes, O Last updated, P Status, Q Notes.
 * Scripts do not start onEdit, so Last updated and the player colour are handled here.
 */
var SE_SHEET = 'Members';
var SE_FIRST_ROW = 5;
var SE_LAST_ROW = 200;
var SE_COLUMNS = ['player', 'character', 'race', 'cls', 'role', 'level', 'prof1', 'skill1', 'prof2', 'skill2', 'cooking', 'firstAid', 'fishing', 'recipes', 'updated', 'status', 'notes'];
var SE_NUMBERS = { level: [1, 60], skill1: [0, 300], skill2: [0, 300], cooking: [0, 300], firstAid: [0, 300], fishing: [0, 300] };

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('SHEET_EDIT_SECRET');
    if (!secret || String(body.secret || '') !== secret) return seJson_({ ok: false, error: 'Not allowed' });
    return seJson_(seRun_(body, SpreadsheetApp.getActive().getSheetByName(SE_SHEET)));
  } catch (err) {
    return seJson_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* not locked */ }
  }
}

// Run this once in the Apps Script editor: it asks for permission and logs the rows (writes nothing).
function sheetEditTest() {
  Logger.log(JSON.stringify(seRun_({ action: 'list' }, SpreadsheetApp.getActive().getSheetByName(SE_SHEET))).slice(0, 2000));
}

function seRun_(body, sheet) {
  if (!sheet) return { ok: false, error: 'No tab ' + SE_SHEET };
  var count = SE_LAST_ROW - SE_FIRST_ROW + 1;
  var values = sheet.getRange(SE_FIRST_ROW, 1, count, SE_COLUMNS.length).getValues();
  var norm = function (v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); };
  var isUsed = function (r) { return norm(r[0]) !== '' || norm(r[1]) !== ''; };

  if (body.action === 'list') {
    var rows = [];
    values.forEach(function (r, i) { if (isUsed(r)) rows.push(seRowObject_(r, SE_FIRST_ROW + i)); });
    return { ok: true, rows: rows };
  }

  // The row must still be the row the developer was looking at (someone may have sorted or changed the sheet).
  var checkRow = function () {
    var n = Number(body.row);
    if (!(n >= SE_FIRST_ROW && n <= SE_LAST_ROW)) throw new Error('Unknown row');
    var r = values[n - SE_FIRST_ROW];
    var exp = body.expect || {};
    if (norm(r[0]) !== norm(exp.player) || norm(r[1]) !== norm(exp.character)) throw new Error('This row changed in the sheet. Reload the list and try again.');
    return n;
  };

  if (body.action === 'delete') {
    sheet.deleteRow(checkRow());
    return { ok: true };
  }

  if (body.action !== 'add' && body.action !== 'update') return { ok: false, error: 'Unknown action' };
  var clean = seClean_(body.values || {});
  var target = body.action === 'update' ? checkRow() : null;
  if (body.action === 'add') {
    if (norm(clean.player) === '') throw new Error('A character needs a player');
    for (var i = 0; i < values.length; i++) if (!isUsed(values[i])) { target = SE_FIRST_ROW + i; break; }
    if (!target) throw new Error('The sheet is full (row ' + SE_LAST_ROW + ')');
  }
  // A character name is the key of a row on the site, so it may exist only once.
  if ('character' in clean && norm(clean.character) !== '') {
    values.forEach(function (r, i) {
      if (SE_FIRST_ROW + i !== target && norm(r[1]) === norm(clean.character)) throw new Error('"' + clean.character + '" already exists (row ' + (SE_FIRST_ROW + i) + ')');
    });
  }
  var current = values[target - SE_FIRST_ROW];
  var changed = 0;
  SE_COLUMNS.forEach(function (key, col) {
    if (!(key in clean) || key === 'updated') return;
    if (String(current[col]).trim() === String(clean[key]).trim()) return;
    sheet.getRange(target, col + 1).setValue(clean[key]);
    changed += 1;
  });
  if (changed) {
    sheet.getRange(target, SE_COLUMNS.indexOf('updated') + 1).setValue(Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'dd-MM-yyyy'));
    if ('player' in clean) { try { if (typeof colorPlayers === 'function') colorPlayers(); } catch (ignore) { /* colours are not essential */ } }
  }
  return { ok: true, row: target, changed: changed };
}

// Only known columns; numbers within their range; nothing that a sheet would read as a formula.
function seClean_(input) {
  var out = {};
  Object.keys(input).forEach(function (key) {
    if (SE_COLUMNS.indexOf(key) < 0 || key === 'updated') throw new Error('Unknown field ' + key);
    var v = input[key] === null || input[key] === undefined ? '' : String(input[key]).trim();
    if (/^[=+@]/.test(v)) throw new Error(key + ' may not start with ' + v.charAt(0));
    if (SE_NUMBERS[key] && v !== '') {
      var n = Number(v);
      if (!(n >= SE_NUMBERS[key][0] && n <= SE_NUMBERS[key][1]) || Math.floor(n) !== n) throw new Error(key + ' must be a whole number from ' + SE_NUMBERS[key][0] + ' to ' + SE_NUMBERS[key][1]);
      v = n;
    }
    out[key] = v;
  });
  return out;
}

function seRowObject_(r, row) {
  var o = { row: row };
  SE_COLUMNS.forEach(function (key, col) {
    var v = r[col];
    o[key] = v instanceof Date ? Utilities.formatDate(v, 'Europe/Amsterdam', 'dd-MM-yyyy') : v;
  });
  return o;
}

function seJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
