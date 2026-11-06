// Achievement tree, the page side: reads the data from the database and saves the developers' changes. The catalogue and the logic are in
// js/achievements-core.js (also used by the Edge Function ding-bot).
import { supabase } from './supabase.js?v=__V__';
import { loadCharacters, loadBlizzard, gameTotals } from './players.js?v=__V__';
export * from './achievements-core.js?v=__V__';

// Everything the meters need, read once.
export async function loadAchievementData() {
  const [{ characters }, blizzard] = await Promise.all([loadCharacters(), loadBlizzard()]);
  const read = async (table, cols, filter) => {
    if (!supabase) return [];
    try { let q = supabase.from(table).select(cols); if (filter) q = filter(q); return (await q).data ?? []; } catch { return []; }
  };
  const [donations, overrides] = await Promise.all([
    read('gold_donations', 'player_name,copper'),
    read('achievement_overrides', '*'),
  ]);
  return { characters, blizzard, donations, overrides, gameTotals: (cs) => gameTotals(cs, blizzard) };
}

// Developer changes. rows = [{ achievement_id, player_name, ...fields }]; upsert on (achievement_id, player_name).
export async function saveOverrides(rows, by) {
  if (!supabase) throw new Error('Not connected to the database.');
  const stamped = rows.map((r) => ({ player_name: '', ...r, updated_by: by, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('achievement_overrides').upsert(stamped, { onConflict: 'achievement_id,player_name' });
  if (error) throw new Error(error.message);
}
// Remove the developers' changes: for one player_name ('' = the "everyone" row), or all of them with '*'.
export async function clearOverrides(id, player = '*') {
  if (!supabase) throw new Error('Not connected to the database.');
  let q = supabase.from('achievement_overrides').delete().eq('achievement_id', id);
  if (player !== '*') q = q.eq('player_name', player);
  const { error } = await q;
  if (error) throw new Error(error.message);
}
export async function reloadOverrides() {
  if (!supabase) return [];
  try { return (await supabase.from('achievement_overrides').select('*')).data ?? []; } catch { return []; }
}
