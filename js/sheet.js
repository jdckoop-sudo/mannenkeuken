import { SHEET_ID } from './config.js?v=__V__';

// Reads the "Members" tab of the Google Sheet (must be shared as "Anyone with the link can view").
// Columns: A Player, B Character, C Race, D Class, E Role, F Level, G Prof 1, H Skill 1,
// I Prof 2, J Skill 2, K Cooking, L First Aid, M Fishing, N Key recipes, O Last updated (set automatically by the sheet's onEdit script), P Status, Q Notes.
export async function loadMembers() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Members&range=A5:Q200&headers=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sheet not reachable');
  const rows = parseCsv(await res.text());
  return rows
    .filter((r) => r[0] && r[0].trim())
    .map((r) => ({
      player: r[0], character: r[1], race: r[2], cls: r[3], role: r[4], level: r[5],
      prof1: r[6], skill1: r[7], prof2: r[8], skill2: r[9],
      cooking: r[10], firstAid: r[11], fishing: r[12], recipes: r[13],
      updated: r[14], status: r[15] || 'Main', notes: r[16] ?? '',
    }));
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
