import { supabase, getUser, displayName, getProfile, joinGuild, logout } from './supabase.js?v=__V__';
import { classIcon, classColor } from './classicons.js?v=__V__';

// Players who can open developer mode (dev.html). Same names as public.is_dev() in supabase/schema.sql.
export const DEVS = ['Jelle', 'Justin'];
// Developer mode is on after opening dev.html (5 clicks on the class icon) until it is switched off there.
export function isDevMode(user) {
  try { return !!user && DEVS.includes(user.player) && localStorage.getItem('mk-dev-mode') === '1'; } catch { return false; }
}
export function setDevMode(on) {
  try { on ? localStorage.setItem('mk-dev-mode', '1') : localStorage.removeItem('mk-dev-mode'); } catch { /* storage not available */ }
}

// Main menu: six places. Pages that belong to a place (e.g. the Guild tabs, player and character pages) light it up too.
const pages = [
  ['index.html', 'Home'],
  ['roster.html', 'Guild', ['roster.html', 'overview.html', 'professions.html', 'achievements.html', 'player.html', 'character.html']],
  ['market.html', 'Market'],
  ['events.html', 'Events'],
  ['bank.html', 'Bank'],
  ['setup.html', 'Tips'],
];
// Tabs at the top of the Guild pages.
export const GUILD_TABS = [
  ['roster.html', 'Members'],
  ['overview.html', 'Overview'],
  ['professions.html', 'Professions'],
  ['achievements.html', 'Achievements'],
];
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function renderHeader() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <a class="brand" href="index.html"><img class="brand-logo" src="img/logo-mark.png?v=__V__" alt="" width="86" height="56">Mannenkeuken</a>
    <nav class="site-nav" aria-label="Main">
      ${pages.map(([href, label, also]) => `<a href="${href}" class="${href === current || (also ?? []).includes(current) ? 'active' : ''}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <div class="auth" id="auth"></div>`;
  document.body.prepend(header);
  // Guild pages: tabs above the page content
  if (GUILD_TABS.some(([href]) => href === current)) {
    const main = document.querySelector('main');
    main?.insertAdjacentHTML('afterbegin', `<nav class="page-tabs" aria-label="Guild">${GUILD_TABS.map(([href, label]) => `<a href="${href}"${href === current ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`);
  }
  if (location.pathname.includes('/preview/')) previewBar();

  const auth = header.querySelector('#auth');
  const user = await getUser();
  if (user) {
    const isDev = DEVS.includes(user.player);
    auth.innerHTML = `<span class="user"><span class="user-icon"></span>
      <span class="user-menu-wrap">
        <button class="user-chip" type="button" aria-haspopup="menu" aria-expanded="false"><span class="user-name"></span><svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5 L7 9 L11 5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
        <div class="user-menu" role="menu" hidden>
          <a role="menuitem" href="profile.html">My profile</a>
          ${user.player ? `<a role="menuitem" href="player.html?name=${encodeURIComponent(user.player)}">My player page &amp; stats</a>` : ''}
          ${isDev ? `<a role="menuitem" href="dev.html" class="user-menu-dev">Developer mode <span class="dev-badge">${isDevMode(user) ? 'ON' : 'OFF'}</span></a>` : ''}
          <button role="menuitem" type="button" data-switch>Switch player</button>
        </div>
      </span></span>`;
    const chip = auth.querySelector('.user-chip');
    const menu = auth.querySelector('.user-menu');
    const setMenu = (open) => { menu.hidden = !open; chip.setAttribute('aria-expanded', String(open)); };
    chip.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.user-menu-wrap')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); chip.focus(); } });
    const nameEl = auth.querySelector('.user-name');
    nameEl.textContent = displayName(user);
    // Class icon next to the name: the main character's class (remembered per player so it shows at once).
    const cacheKey = `mk-class:${user.player ?? user.id}`;
    const showClass = (cls) => {
      auth.querySelector('.user-icon').innerHTML = classIcon(cls, 30);
      nameEl.style.color = classColor(cls);
    };
    try { showClass(localStorage.getItem(cacheKey)); } catch { /* storage not available */ }
    // Developer mode: click the class icon 5 times (within 3 seconds) to switch it on (opens dev.html) or off – only for the developers.
    if (DEVS.includes(user.player)) {
      const icon = auth.querySelector('.user-icon');
      let clicks = [];
      icon.style.cursor = 'pointer';
      icon.addEventListener('click', () => {
        const now = Date.now();
        clicks = [...clicks.filter((t) => now - t < 3000), now];
        if (clicks.length < 5) return;
        clicks = [];
        if (isDevMode(user)) {
          // On → off (stay on this page; on dev.html itself go to Home, because opening dev.html switches it on)
          if (!confirm('Switch developer mode off?')) return;
          setDevMode(false);
          if (location.pathname.endsWith('dev.html')) location.href = 'index.html'; else location.reload();
        } else {
          setDevMode(true);
          location.href = 'dev.html';
        }
      });
    }
    if (isDevMode(user)) {
      auth.insertAdjacentHTML('afterbegin', '<a class="dev-badge" href="dev.html" title="Developer mode is on">DEV</a>');
    }
    // Open to-do messages for this developer: a red count that links to developer mode – only in developer mode.
    if (isDevMode(user)) {
      supabase.from('dev_messages').select('id', { count: 'exact', head: true }).eq('to_player', user.player).is('done_at', null)
        .then(({ count }) => {
          if (!count) return;
          auth.insertAdjacentHTML('afterbegin', `<a class="dev-todo" href="dev.html" title="${count} thing${count === 1 ? '' : 's'} to do for you">${count}</a>`);
        }).catch(() => {});
    }
    getProfile(user).then((p) => {
      showClass(p?.class);
      try { p?.class ? localStorage.setItem(cacheKey, p.class) : localStorage.removeItem(cacheKey); } catch { /* storage not available */ }
    }).catch(() => {});
    auth.querySelector('[data-switch]').addEventListener('click', () => {
      if (confirm('Are you sure you want to switch player? You can choose again with the guild code.')) logout();
    });
  } else {
    auth.innerHTML = `<button class="btn" type="button">Choose your player</button>`;
    auth.querySelector('button').addEventListener('click', openPicker);
  }
  return user;
}

// "Choose your player": pick your name from the guild list and enter the guild code (once per browser).
export function openPicker() {
  let dlg = document.getElementById('player-picker');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'player-picker';
    dlg.className = 'box';
    dlg.style.cssText = 'max-width:380px;width:calc(100% - 32px)';
    dlg.innerHTML = `
      <form method="dialog" style="display:flex;flex-direction:column;gap:12px">
        <h2 style="margin:0">Choose your player</h2>
        <label>Who are you?<select name="player" required><option value="">Loading…</option></select></label>
        <label>Guild code<input name="code" type="password" required autocomplete="off" placeholder="Ask in the Mannenkeuken Discord"></label>
        <p class="muted picker-msg" style="margin:0;font-size:14px">You only need to do this once in this browser.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn" type="button" value="cancel">Cancel</button>
          <button class="btn btn-primary" type="submit" value="ok">Enter</button>
        </div>
      </form>`;
    document.body.append(dlg);
    const form = dlg.querySelector('form');
    const msg = dlg.querySelector('.picker-msg');
    form.querySelector('[value="cancel"]').addEventListener('click', () => dlg.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = new FormData(form);
      msg.textContent = 'Checking…';
      try {
        await joinGuild(d.get('player'), d.get('code'));
        window.location.reload();
      } catch (err) {
        msg.textContent = err.message || 'Could not log in.';
      }
    });
    if (supabase) {
      supabase.from('players').select('player_name').order('player_name').then(({ data }) => {
        form.player.innerHTML = '<option value="">Choose…</option>'
          + (data ?? []).map((p) => `<option>${p.player_name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</option>`).join('');
      });
    }
  }
  dlg.showModal();
}


// Preview of a pull request (published at /preview/): a bar on top with what changed and a one-step "approve = live".
async function previewBar() {
  const REPO = 'jdckoop-sudo/mannenkeuken';
  const bar = document.createElement('div');
  bar.className = 'preview-bar';
  bar.innerHTML = `<div class="preview-inner">
      <span class="preview-tag">PREVIEW</span>
      <span class="preview-text">You are looking at a <strong>preview</strong> of a change that is not live yet. The data is real: what you add here is added to the live site too.</span>
      <span class="preview-actions">
        <a class="btn" href="../" >Back to the live site</a>
        <button class="btn btn-primary" type="button" data-ok>Looks good – put it live</button>
      </span>
    </div>`;
  document.body.prepend(bar);
  let pr = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=50`, { headers: { Accept: 'application/vnd.github+json' } });
    const list = res.ok ? await res.json() : [];
    pr = list.filter((p) => (p.labels || []).some((l) => l.name === 'preview')).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  } catch { /* GitHub not reachable: the dialog still explains the steps */ }
  if (pr) bar.querySelector('.preview-text').innerHTML = `Preview of <a href="${pr.html_url}" target="_blank" rel="noopener"><strong>${escHtml(pr.title)}</strong></a> by ${escHtml(pr.user?.login)} – not live yet. The data is real: what you add here is added to the live site too.`;
  bar.querySelector('[data-ok]').addEventListener('click', () => {
    let dlg = document.getElementById('preview-ok');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'preview-ok';
      dlg.className = 'box';
      dlg.style.cssText = 'max-width:520px;width:calc(100% - 32px)';
      const url = pr ? pr.html_url : `https://github.com/${REPO}/pulls?q=is%3Aopen+label%3Apreview`;
      dlg.innerHTML = `<h2 style="margin:0">Put it live</h2>
        <p style="margin:0">Happy with it? Give your OK on GitHub – the site goes live by itself within a minute.</p>
        <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px">
          <li><strong>Quickest:</strong> open the pull request and add the comment <code>akkoord</code>.</li>
          <li>Or: <em>Files changed → Review changes → Approve → Submit review</em>.</li>
        </ol>
        <p class="muted" style="margin:0;font-size:14px">Only the other developer can approve (not the one who made it). Not happy? Leave a comment on the pull request with what should change.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn" type="button" data-close>Not yet</button>
          <a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">Open the pull request</a>
        </div>`;
      document.body.append(dlg);
      dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    }
    dlg.showModal();
  });
}
