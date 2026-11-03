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

const pages = [
  ['index.html', 'Home'],
  ['roster.html', 'Roster'],
  ['professions.html', 'Professions'],
  ['market.html', 'Trade Market'],
  ['events.html', 'Raids & Events'],
  ['bank.html', 'Guild Bank'],
  ['achievements.html', 'Achievements'],
  ['setup.html', 'Addons & Settings'],
  ['profile.html', 'My profile'],
];

export async function renderHeader() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <a class="brand" href="index.html"><img class="brand-logo" src="img/logo-mark.png?v=__V__" alt="" width="51" height="64">Mannenkeuken</a>
    <nav class="site-nav" aria-label="Main">
      ${pages.map(([href, label]) => `<a href="${href}" class="${href === current ? 'active' : ''}">${label}</a>`).join('')}
    </nav>
    <div class="auth" id="auth"></div>`;
  document.body.prepend(header);

  const auth = header.querySelector('#auth');
  const user = await getUser();
  if (user) {
    auth.innerHTML = `<span class="user"><span class="user-icon"></span><span class="user-name"></span></span><button class="btn" type="button">Switch player</button>`;
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
    auth.querySelector('button').addEventListener('click', () => {
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
