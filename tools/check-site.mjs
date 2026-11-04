// Automatic check of the live site: opens the most important pages in a real (headless) Chrome and looks for errors.
// Runs after every deploy (.github/workflows/post-deploy-check.yml) or by hand. Node 22+, no dependencies (talks to Chrome over its DevTools port).
//
// What counts as an error: a page that does not open (HTTP error), a JavaScript error, a script / style / image / data file of ours that
// fails to load, an empty page or one that is still on "Loading…", and a broken data file. Wowhead and Google Fonts are ignored
// (outside our control). Findings are printed; with DEPLOY_CHECK_SECRET set they are also reported to the dashboard
// (database function report_deploy_check(): a red line in Checks and a card in Fixes, or green again when all is well).
//
//   SITE_URL          default https://jdckoop-sudo.github.io/mannenkeuken/
//   CHROME_PATH       default google-chrome (on a Windows pc: the full path to chrome.exe)
//   EXPECT_VERSION    8-character commit id of the deploy: wait (max 6 minutes) until the live site carries it
//   PAGES             comma separated pages, default the list below
//   DEPLOY_CHECK_SECRET, GITHUB_SHA, RUN_URL   used for the report to the dashboard
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.SITE_URL || 'https://jdckoop-sudo.github.io/mannenkeuken/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH || 'google-chrome';
const PAGES = (process.env.PAGES || 'index.html,roster.html,overview.html,professions.html,achievements.html,market.html,events.html,bank.html,setup.html,profile.html').split(',').map((p) => p.trim()).filter(Boolean);
const DATA = [
  ['data/items.json', (d) => d.items?.length > 1000, 'item list'],
  ['data/tradeable-items.json', (d) => d.items?.length > 500, 'tradeable item list'],
  ['data/quests.json', (d) => d.quests?.length > 100, 'quest list'],
];
const IGNORE_HOSTS = ['wow.zamimg.com', 'www.wowhead.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const ignored = (url = '') => { try { return IGNORE_HOSTS.includes(new URL(url).host); } catch { return false; } };
// Files that may not exist yet: the site copes with that (the Blizzard data only exists once the update workflow has run)
const OPTIONAL = ['/data/blizzard-characters.json'];
const optionalMissing = (url = '', status) => status === 404 && OPTIONAL.some((o) => url.includes(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- wait until the deploy is live ---------------------------------------------------------------------
async function waitForDeploy() {
  const want = process.env.EXPECT_VERSION?.slice(0, 8);
  if (!want) return;
  for (let i = 0; i < 24; i++) {
    try {
      const html = await (await fetch(`${BASE}index.html?cb=${Date.now()}`)).text();
      if (html.includes(`v=${want}`)) { console.log(`Deploy ${want} is live.`); return; }
    } catch { /* try again */ }
    console.log(`Waiting for deploy ${want} to go live… (${i + 1}/24)`);
    await sleep(15000);
  }
  console.log(`Deploy ${want} did not show up within 6 minutes; checking what is live anyway.`);
}

// ---- a tiny DevTools client ----------------------------------------------------------------------------
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.opened = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('Could not connect to Chrome')); });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
      } else this.listeners.forEach((l) => l(msg));
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

async function launchChrome() {
  const dir = mkdtempSync(join(tmpdir(), 'check-site-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error(`Chrome did not start (CHROME_PATH=${CHROME})`)), 20000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); res(m[1]); } });
    proc.on('error', (e) => { clearTimeout(timer); rej(new Error(`Could not start Chrome: ${e.message}`)); });
  });
  return { proc, dir, wsUrl };
}

// ---- one page ------------------------------------------------------------------------------------------
async function checkPage(cdp, sessionId, path) {
  const url = BASE + path;
  const errors = new Set();
  const inflight = new Set();
  const urls = new Map();
  let last = Date.now();
  let docStatus = null;
  const off = cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params ?? {};
    switch (msg.method) {
      case 'Network.requestWillBeSent': inflight.add(p.requestId); urls.set(p.requestId, p.request.url); last = Date.now(); break;
      case 'Network.responseReceived':
        if (p.type === 'Document' && p.response.url === url) docStatus = p.response.status;
        if (p.response.status >= 400 && !ignored(p.response.url) && !optionalMissing(p.response.url, p.response.status)) errors.add(`HTTP ${p.response.status} for ${p.response.url}`);
        break;
      case 'Network.loadingFinished': inflight.delete(p.requestId); last = Date.now(); break;
      case 'Network.loadingFailed':
        inflight.delete(p.requestId); last = Date.now();
        if (!p.canceled && !ignored(urls.get(p.requestId))) errors.add(`Could not load ${urls.get(p.requestId)} (${p.errorText})`);
        break;
      case 'Runtime.exceptionThrown': errors.add(`JavaScript error: ${(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? '').split('\n')[0]}`); break;
      case 'Runtime.consoleAPICalled':
        if (p.type === 'error') errors.add(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
        break;
      case 'Log.entryAdded':
        // "Failed to load resource" is already caught above with its address; the rest (CSP, deprecated, …) only when it is an error
        if (p.entry.level === 'error' && !/^Failed to load resource/.test(p.entry.text) && !ignored(p.entry.url)) errors.add(`Browser: ${p.entry.text.slice(0, 200)}`);
        break;
      default:
    }
  });
  try {
    await cdp.send('Page.navigate', { url }, sessionId);
    // wait until the page has settled: nothing loading for 1.5 s (at most 15 s)
    const t0 = Date.now();
    await sleep(1500);
    while ((inflight.size > 0 || Date.now() - last < 1500) && Date.now() - t0 < 15000) await sleep(250);
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `(() => ({ title: document.title, header: !!document.querySelector('.site-header'), mainText: (document.querySelector('main')?.innerText ?? '').trim().length, loading: document.body.innerText.includes('Loading…') }))()`,
      returnByValue: true,
    }, sessionId);
    const r = result.value ?? {};
    if (docStatus !== null && docStatus >= 400) errors.add(`The page itself answers HTTP ${docStatus}`);
    if (!r.title) errors.add('The page has no title');
    if (!r.header) errors.add('The menu (header) did not appear');
    if (!(r.mainText > 40)) errors.add(`The page is (almost) empty (${r.mainText ?? 0} characters)`);
    if (r.loading) errors.add('The page is still on "Loading…" (data did not arrive)');
  } catch (e) {
    errors.add(`Could not check the page: ${e.message}`);
  } finally { off(); }
  return { path, errors: [...errors] };
}

// ---- data files ----------------------------------------------------------------------------------------
async function checkData() {
  const problems = [];
  for (const [file, ok, name] of DATA) {
    try {
      const res = await fetch(`${BASE}${file}?cb=${Date.now()}`);
      if (!res.ok) { problems.push(`${file} (${name}): HTTP ${res.status}`); continue; }
      if (!ok(await res.json())) problems.push(`${file} (${name}): the content looks wrong or too small`);
    } catch (e) { problems.push(`${file} (${name}): ${e.message}`); }
  }
  return problems;
}

// ---- report to the dashboard ---------------------------------------------------------------------------
async function report(ok, summary, details) {
  const secret = process.env.DEPLOY_CHECK_SECRET;
  if (!secret) { console.log('DEPLOY_CHECK_SECRET is not set: nothing is reported to the dashboard (the result above is all there is).'); return; }
  const cfg = readFileSync('js/config.js', 'utf8');
  const url = process.env.SUPABASE_URL ?? cfg.match(/SUPABASE_URL\s*=\s*'([^']*)'/)?.[1]; // SUPABASE_URL overrides (tests)
  const key = cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']*)'/)?.[1];
  const commit = [process.env.GITHUB_SHA?.slice(0, 8), process.env.RUN_URL].filter(Boolean).join(' · ');
  const res = await fetch(`${url}/rest/v1/rpc/report_deploy_check`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: secret, p_ok: ok, p_summary: summary, p_details: details, p_commit: commit }),
  });
  console.log(res.ok ? 'Reported to the dashboard (Checks and Fixes).' : `Could not report to the dashboard: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// ---- go ------------------------------------------------------------------------------------------------
console.log(`Checking ${BASE}`);
await waitForDeploy();
const { proc, dir, wsUrl } = await launchChrome();
const results = [];
try {
  const cdp = new Cdp(wsUrl);
  await cdp.opened;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  for (const d of ['Page', 'Runtime', 'Network', 'Log']) await cdp.send(`${d}.enable`, {}, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (const path of PAGES) {
    const r = await checkPage(cdp, sessionId, path);
    results.push(r);
    console.log(`${r.errors.length ? '✗' : '✓'} ${path}${r.errors.length ? `\n    ${r.errors.join('\n    ')}` : ''}`);
  }
} finally {
  proc.kill();
  await sleep(500);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
}
const dataProblems = await checkData();
console.log(dataProblems.length ? `✗ data files\n    ${dataProblems.join('\n    ')}` : '✓ data files');

const broken = results.filter((r) => r.errors.length);
const ok = !broken.length && !dataProblems.length;
const summary = ok ? `All ${results.length} pages and the data files are fine.` : `${broken.length} of ${results.length} pages${dataProblems.length ? ' and the data files' : ''} have problems.`;
const details = [...broken.map((r) => `${r.path}\n  - ${r.errors.join('\n  - ')}`), ...(dataProblems.length ? [`data files\n  - ${dataProblems.join('\n  - ')}`] : [])].join('\n\n').slice(0, 5000);
console.log(`\n${ok ? '✅' : '❌'} ${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Deploy check\n${ok ? '✅' : '❌'} ${summary}\n\n${details ? `\`\`\`\n${details}\n\`\`\`\n` : ''}`);
await report(ok, summary, details);
process.exit(ok ? 0 : 1);
