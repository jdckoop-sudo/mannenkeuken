import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DISCORD_GUILD_ID } from './config.js?v=__V__';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT');
export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export function displayName(user) {
  const m = user?.user_metadata ?? {};
  return m.custom_claims?.global_name || m.full_name || m.name || 'Member';
}

export function avatarUrl(user) {
  const m = user?.user_metadata ?? {};
  return m.avatar_url || m.picture || '';
}

export async function login() {
  if (!supabase) { alertNotConfigured(); return; }
  await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { scopes: 'identify guilds', redirectTo: window.location.href },
  });
}

export async function logout() {
  if (supabase) await supabase.auth.signOut();
  sessionStorage.removeItem('mk-guild-ok');
  window.location.reload();
}

// Checks (in the browser) whether the logged-in Discord user is in the Mannenkeuken server.
// Only works right after login, while Discord's provider token is available; the result is cached.
export async function isGuildMember() {
  const cached = sessionStorage.getItem('mk-guild-ok');
  if (cached !== null) return cached === '1';
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;
  if (!token) return true; // token no longer available: don't lock people out
  try {
    const res = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${token}` } });
    const guilds = await res.json();
    const ok = Array.isArray(guilds) && guilds.some((g) => g.id === DISCORD_GUILD_ID);
    sessionStorage.setItem('mk-guild-ok', ok ? '1' : '0');
    return ok;
  } catch {
    return true;
  }
}

function alertNotConfigured() {
  const el = document.getElementById('auth-msg');
  if (el) el.textContent = 'Login is not set up yet (Supabase settings missing in js/config.js).';
}
