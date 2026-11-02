// Public settings. These are safe to commit: the anon key is public by design,
// security comes from the Row Level Security rules in supabase/schema.sql.
// NEVER put the Supabase service_role key or the Discord Client Secret here.

export const SUPABASE_URL = 'https://uvnmgyhnqlibnvpivhdf.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_GHJ6O6f5up3K0RU13cEnFA_kIu-HcBu'; // publishable key (public)

// Discord server (guild) id of Mannenkeuken – used to check membership after login.
export const DISCORD_GUILD_ID = '1565042335664971836';

// Google Sheet with the roster (tab "Members", players from row 5).
export const SHEET_ID = '13fIA-FU6WWzJN3wFdUhWvhAwsXnjC2ruKZJEsyUgLJs';
