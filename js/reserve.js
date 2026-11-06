// Reserving items (guild bank and trade market): who reserves, for which of their characters, how many.
import { esc } from './sheet.js?v=__V__';
import { mine } from './supabase.js?v=__V__';
import { loadCharacters, playerForUser, characterUrl } from './players.js?v=__V__';

// The logged-in member's characters (main first), for the "reserve for" dropdown.
export async function myCharacters(user) {
  if (!user) return [];
  const { characters } = await loadCharacters();
  const me = playerForUser(user);
  return characters
    .filter((c) => c.hasName && c.status !== 'Gestopt' && me && c.player === me)
    .sort((a, b) => (a.kind === 'Main' ? -1 : 1) - (b.kind === 'Main' ? -1 : 1))
    .map((c) => c.name);
}

// Lines like "2× for Bunte Bapsimus – reserved by Dirk-Christiaan [Cancel]".
export function reservationsHtml(list, user) {
  if (!list.length) return '';
  return `<div style="display:flex;flex-direction:column;gap:2px;margin-top:4px">${list.map((r) => `
    <span style="font-size:13px"><span class="badge">Reserved</span> ${esc(r.quantity)}× for <a href="${characterUrl(r.character)}">${esc(r.character)}</a>
      <span class="muted">– by ${esc(r.reserved_by)}</span>
      ${mine(user, r.user_id) ? ` · <button class="link-btn" type="button" data-unreserve="${r.id}" data-name="${esc(r.character)}">Cancel</button>` : ''}</span>`).join('')}</div>`;
}

// Small inline form: character + quantity + Reserve button. `max` = how many are still free.
export function reserveFormHtml(targetId, chars, max) {
  if (!chars.length) return '<span class="muted" style="font-size:13px">Set your character in <a href="profile.html">My profile</a> to reserve.</span>';
  if (max <= 0) return '<span class="muted" style="font-size:13px">Fully reserved</span>';
  return `<form data-reserve="${targetId}" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px">
    <select name="character" aria-label="Reserve for character" style="padding:6px">${chars.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    <input name="quantity" type="number" min="1" max="${max}" value="1" aria-label="Quantity to reserve" style="width:64px;padding:6px">
    <button class="btn" type="submit" style="padding:6px 10px">Reserve</button>
  </form>`;
}

export const reservedCount = (list) => list.reduce((a, r) => a + r.quantity, 0);
