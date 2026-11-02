import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=__V__';

// Login = choose your player + the shared guild code (no Discord login).
// The browser signs in anonymously; join_guild(code, player) in Supabase links it to a sheet player
// (table `members`). One player can use several browsers; their rows count as "mine" on all of them.

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT');
export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let userPromise = null;
// The signed-in member: the Supabase user plus .player (sheet player name) and .ids (all browser ids of that player).
// null when this browser has not chosen a player yet.
export function getUser() {
  userPromise ??= (async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) return null;
    const { data: me } = await supabase.from('members').select('player_name').eq('user_id', user.id).maybeSingle();
    if (!me) return null; // signed in, but no player chosen (or wrong code): treat as logged out
    const { data: same } = await supabase.from('members').select('user_id').eq('player_name', me.player_name);
    user.player = me.player_name;
    user.ids = new Set([user.id, ...(same ?? []).map((m) => m.user_id)]);
    return user;
  })();
  return userPromise;
}

// Is this row (by its user_id) from the signed-in player?
export function mine(user, uid) {
  return !!user && !!uid && (uid === user.id || !!user.ids?.has(uid));
}

export function displayName(user) {
  const m = user?.user_metadata ?? {};
  return user?.player || m.custom_claims?.global_name || m.full_name || m.name || 'Member';
}

export function avatarUrl(user) {
  const m = user?.user_metadata ?? {};
  return m.avatar_url || m.picture || '';
}

// The player's saved profile (main character) from any of their browsers, or null.
export async function getProfile(user) {
  if (!supabase || !user) return null;
  const ids = [...(user.ids ?? [user.id])];
  const { data } = await supabase.from('profiles').select('*').in('user_id', ids).order('updated_at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

// Choose a player: sign in anonymously (once per browser) and check the guild code.
export async function joinGuild(player, code) {
  if (!supabase) throw new Error('Not connected yet.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(error.message.includes('nonymous') ? 'Logging in is not switched on yet (anonymous sign-ins in Supabase).' : error.message);
  }
  const { error } = await supabase.rpc('join_guild', { code, player });
  if (error) throw new Error(error.message);
  userPromise = null;
}

// Switch player / log out. Keeps the anonymous browser session, so choosing again is quick.
export async function logout() {
  if (supabase) await supabase.auth.signOut();
  userPromise = null;
  window.location.reload();
}

// Everyone who chose a player with the right guild code is a member.
export async function isGuildMember() {
  return !!(await getUser());
}
