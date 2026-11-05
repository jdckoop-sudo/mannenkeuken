// Experiment: can we read character data (level, professions, ...) from the Blizzard (Battle.net) API?
// Verified on regular (retail) WoW: character Markrutte, realm Outland, EU, 3 Nov 2026.
// WoW: Forever has its own namespaces (found 3 Nov 2026, one day before launch): dynamic-forever-<region> and
// profile-forever-<region>. Its "realm" list (/data/wow/realm/index?namespace=dynamic-forever-eu) then only held
// CAMWOW test entries, and no character was found yet: try again after launch, with a slug from that list as REALM.
// Runs only by hand: via the "Test Blizzard API" workflow (.github/workflows/blizzard-test.yml), or locally:
//   node --env-file=<path to your private .env> tools/blizzard-test.mjs <character> <realm> [region]
// (see .env.example; keep that file outside the OneDrive project folder). Node 20+, no dependencies.
// It writes no files and prints no secrets: it asks for a token, then tries one character against a few namespaces.
//
// Environment (the two secrets come from GitHub Actions secrets, the rest from the workflow inputs):
//   BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET   required
//   CHARACTER   character name, e.g. "Markrutte" (a two-part name works too)
//   REALM       realm name, e.g. "Outland" (for WoW: Forever: whatever replaces the realm, such as the ruleset)
//   REGION      eu | us | kr | tw (default eu)
//   NAMESPACES  optional extra namespaces to try, comma separated (e.g. "profile-forever-eu")

const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
// Command line arguments win over the environment: <character> <realm> [region]
const [argCharacter, argRealm, argRegion] = process.argv.slice(2);
const region = (argRegion || process.env.REGION || 'eu').toLowerCase();
const character = (argCharacter || process.env.CHARACTER || '').trim();
const realm = (argRealm || process.env.REALM || '').trim();
const extra = (process.env.NAMESPACES || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!id || !secret) {
  console.error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET are not set. On GitHub: Settings → Secrets and variables → Actions. Locally: node --env-file=<your private .env> tools/blizzard-test.mjs <character> <realm> [region] (see .env.example).');
  process.exit(1);
}
if (!character) {
  console.error('Give a character (and a realm if you know it): node tools/blizzard-test.mjs <character> [realm] [region]');
  process.exit(1);
}

const api = `https://${region}.api.blizzard.com`;
const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-'); // "Burning Blade" -> "burning-blade"
const nameKey = (s) => encodeURIComponent(s.toLowerCase()); // "Bertrand Bakkebaard" -> "bertrand%20bakkebaard"

// 1. Token (client credentials: no login by a player needed for public character data)
const tokenRes = await fetch('https://oauth.battle.net/token', {
  method: 'POST',
  headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
if (!tokenRes.ok) {
  console.error(`Token request failed: ${tokenRes.status} ${tokenRes.statusText}. Check the Client ID and Secret in the GitHub secrets.`);
  process.exit(1);
}
const { access_token: token, expires_in: expires } = await tokenRes.json();
console.log(`Token OK (valid for ${Math.round(expires / 3600)} hours). Region: ${region}`);

async function get(path, namespace) {
  const url = `${api}${path}${path.includes('?') ? '&' : '?'}namespace=${namespace}&locale=en_US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body };
}
const short = (body) => JSON.stringify(body ?? '').slice(0, 220);

// 2. Sanity check that does not depend on any character: the WoW token price (public game data)
{
  const r = await get('/data/wow/token/index', `dynamic-${region}`);
  console.log(`Game data check (WoW token): HTTP ${r.status}${r.status === 200 ? ' – the API answers' : ` – ${short(r.body)}`}`);
}

// 2b. WoW: Forever realms: the realm list of the Forever game data (needed for the realm slug in the character URL).
//     Tried with the realm index and the connected-realm index; prints the names and slugs it finds.
const foreverRealms = [];
for (const path of ['/data/wow/realm/index', '/data/wow/connected-realm/index']) {
  const r = await get(path, `dynamic-forever-${region}`);
  if (r.status !== 200) { console.log(`Forever ${path}: HTTP ${r.status} ${short(r.body)}`); continue; }
  const list = r.body.realms ?? r.body.connected_realms ?? [];
  console.log(`Forever ${path}: ${list.length} entries`);
  for (const x of list.slice(0, 60)) console.log(`  - ${x.name ?? x.href ?? JSON.stringify(x)}${x.slug ? ` (slug: ${x.slug})` : ''}`);
  for (const x of list) if (x.slug) foreverRealms.push(x.slug);
}
// Connected realms only give a link: follow the first ones so their realm names and slugs show up
{
  const r = await get('/data/wow/connected-realm/index', `dynamic-forever-${region}`);
  for (const x of (r.body?.connected_realms ?? []).slice(0, 15)) {
    const res = await fetch(`${x.href}&locale=en_US`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    const b = res?.ok ? await res.json().catch(() => null) : null;
    for (const rr of b?.realms ?? []) { console.log(`  connected realm ${b.id}: ${rr.name} (slug: ${rr.slug})`); foreverRealms.push(rr.slug); }
  }
}

// 3. The character, per namespace: retail, Classic, Classic Era, Forever, and any extra ones given
const namespaces = [`profile-${region}`, `profile-classic-${region}`, `profile-classic1x-${region}`, `profile-forever-${region}`, ...extra];
if (!realm) {
  // No realm given: look for the character on every Forever realm slug found above
  const slugs = [...new Set(foreverRealms)];
  console.log(`\nNo realm given: looking for "${character}" on ${slugs.length} Forever realm(s)`);
  for (const rs of slugs) {
    const r = await get(`/profile/wow/character/${rs}/${nameKey(character)}`, `profile-forever-${region}`);
    console.log(`- ${rs}: HTTP ${r.status}${r.status === 200 ? ` – FOUND: ${r.body.name}, level ${r.body.level}, ${r.body.character_class?.name}, last login ${r.body.last_login_timestamp ? new Date(r.body.last_login_timestamp).toISOString() : 'unknown'}` : ''}`);
  }
  process.exit(0);
}
const base = `/profile/wow/character/${slug(realm)}/${nameKey(character)}`;
console.log(`\nCharacter: ${character} on ${realm} (${base})`);

let found = 0;
for (const ns of [...new Set(namespaces)]) {
  const summary = await get(base, ns);
  if (summary.status !== 200) {
    console.log(`- ${ns}: HTTP ${summary.status} ${short(summary.body)}`);
    continue;
  }
  found += 1;
  const c = summary.body;
  console.log(`- ${ns}: FOUND`);
  console.log(`    ${c.name} – level ${c.level}, ${c.race?.name ?? '?'} ${c.character_class?.name ?? '?'}, ${c.faction?.name ?? '?'}, realm ${c.realm?.name ?? '?'}, guild ${c.guild?.name ?? '–'}`);
  console.log(`    last login: ${c.last_login_timestamp ? new Date(c.last_login_timestamp).toISOString() : 'unknown'}`);
  const prof = await get(`${base}/professions`, ns);
  if (prof.status !== 200) {
    console.log(`    professions: HTTP ${prof.status} ${short(prof.body)}`);
    continue;
  }
  const list = [...(prof.body.primaries ?? []), ...(prof.body.secondaries ?? [])];
  if (!list.length) console.log('    professions: none returned');
  for (const p of list) {
    const tiers = (p.tiers ?? []).map((t) => `${t.skill_points}/${t.max_skill_points}`).join(', ');
    console.log(`    ${p.profession?.name}: ${tiers || 'no skill data'}`);
  }
}
console.log(found ? `\nDone: ${found} namespace(s) returned the character.` : '\nDone: no namespace returned the character (see the HTTP codes above).');
