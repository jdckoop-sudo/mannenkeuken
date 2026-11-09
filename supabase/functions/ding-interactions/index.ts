// Supabase Edge Function "ding-interactions": answers the clicks on the menu of Dag Dinky / Week Dinky in Discord (the "Pick a player" menu).
// Discord calls this function (Developer Portal → your app → General Information → Interactions Endpoint URL) every time somebody picks a player;
// the answer is a message that only that person sees, with the lines of that player. The lines are stored by ding-bot in the table ding_recap_details.
//
// Setup and how to check it: docs/instructies.md, "Ding-bot" → "Discord-widget".
// Function secrets (Edge Functions → Secrets), never in the repo:
//   DISCORD_PUBLIC_KEY   the Public Key of the Discord app (General Information); it is public, but Discord checks every call with it
// Supabase provides SUPABASE_URL and the service key itself. "Enforce JWT verification" must be OFF: Discord has no Supabase login,
// the signature that Discord puts on every call (checked below) is what protects this function.
const COLOR = 0xe8c15a;
const env = (name) => Deno.env.get(name) ?? '';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const hex = (s) => Uint8Array.from((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));
// Discord signs timestamp + body with Ed25519: a call without a valid signature is refused (Discord tests this itself when the URL is saved)
export async function verify(publicKeyHex, signatureHex, timestamp, body) {
  try {
    if (!publicKeyHex || !signatureHex || !timestamp) return false;
    const key = await crypto.subtle.importKey('raw', hex(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(signatureHex), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

const ephemeral = (content, embeds) => ({ type: 4, data: { flags: 64, content: content ?? undefined, embeds, allowed_mentions: { parse: [] } } });

// What to answer to one call. Pure: lookup(recap, player) gives { title, details } or null.
export async function answer(interaction, lookup) {
  if (interaction?.type === 1) return { type: 1 }; // PING
  if (interaction?.type === 3 && interaction.data?.component_type === 3) { // a choice in a select menu
    const [kind, recap] = String(interaction.data.custom_id ?? '').split('|');
    const player = interaction.data.values?.[0];
    if (kind !== 'recap' || !recap || !player) return ephemeral('Sorry, I do not understand that choice.');
    const found = await lookup(recap, player);
    if (!found) return ephemeral('Sorry, I no longer have the details of this recap.');
    return ephemeral(null, [{ color: COLOR, title: String(found.title).slice(0, 256), description: String(found.details).slice(0, 4000), footer: { text: 'Mannenkeuken · Ding Dinky' } }]);
  }
  return ephemeral('Sorry, I do not know what to do with that.');
}

async function lookup(recap, player) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/ding_recap_details?select=title,details&recap=eq.${encodeURIComponent(recap)}&player=eq.${encodeURIComponent(player)}&limit=1`, { headers });
  if (!res.ok) throw new Error(`Database: HTTP ${res.status}`);
  return (await res.json())[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await req.text();
  if (!(await verify(env('DISCORD_PUBLIC_KEY'), req.headers.get('x-signature-ed25519') ?? '', req.headers.get('x-signature-timestamp') ?? '', body))) return new Response('invalid request signature', { status: 401 });
  let interaction;
  try { interaction = JSON.parse(body); } catch { return json({ error: 'bad request' }, 400); }
  try { return json(await answer(interaction, lookup)); } catch (e) { console.error(e); return json(ephemeral('Sorry, something went wrong. Try again in a minute.')); }
});
