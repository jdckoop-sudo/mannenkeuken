// Supabase Edge Function "sheet-edit": the way from developer mode (dev.html → Characters) to the guild sheet.
// It checks that the caller is a developer (database function is_dev() with the caller's own login) and passes the request on to the
// Apps Script web app in the sheet (tools/sheet-script/SheetEdit.gs), adding the secret. The browser never sees that secret or the URL.
//
// Setup: docs/instructies.md, "Characters beheren (developer mode)". Function secrets (Edge Functions → Secrets), never in the repo:
//   SHEET_EDIT_URL      the web app URL of the Apps Script deployment
//   SHEET_EDIT_SECRET   long random text, the same as the script property SHEET_EDIT_SECRET
// "Enforce JWT verification" must be off: this function checks the login itself, also for the browser's CORS preflight.
const PUBLIC_KEY = 'sb_publishable_GHJ6O6f5up3K0RU13cEnFA_kIu-HcBu'; // public, same as SUPABASE_ANON_KEY in js/config.js
const ACTIONS = ['list', 'add', 'update', 'delete'];

const env = (name) => Deno.env.get(name) ?? '';
const CORS = {
  'Access-Control-Allow-Origin': '*', // harmless: every call needs the login of a developer
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function isDeveloper(authorization) {
  if (!authorization) return false;
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/is_dev`, {
    method: 'POST',
    headers: { apikey: env('SUPABASE_ANON_KEY') || PUBLIC_KEY, Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return res.ok && (await res.json()) === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!(await isDeveloper(req.headers.get('authorization')))) return json({ ok: false, error: 'Only developers can do this' }, 403);
    if (!env('SHEET_EDIT_URL') || !env('SHEET_EDIT_SECRET')) return json({ ok: false, error: 'The connection to the sheet is not set up yet (function secrets).' }, 500);
    let body = null;
    try { body = await req.json(); } catch { /* handled below */ }
    if (!ACTIONS.includes(body?.action)) return json({ ok: false, error: 'Unknown action' }, 400);
    const res = await fetch(env('SHEET_EDIT_URL'), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: body.action, row: body.row, expect: body.expect, values: body.values, secret: env('SHEET_EDIT_SECRET') }),
    });
    const text = await res.text();
    let out = null;
    try { out = JSON.parse(text); } catch { /* an HTML error page */ }
    if (!out) return json({ ok: false, error: `The sheet gave no usable answer (HTTP ${res.status}). Check the web app deployment.` }, 502);
    return json(out, out.ok ? 200 : 400);
  } catch (e) {
    console.error(e.message);
    return json({ ok: false, error: e.message }, 500);
  }
});
