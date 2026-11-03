import { supabase, getUser, displayName, getProfile, joinGuild, logout } from './supabase.js?v=__V__';
import { classIcon, classColor } from './classicons.js?v=__V__';

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
    <a class="brand" href="index.html"><span class="brand-logo" aria-hidden="true"></span>Mannenkeuken</a>
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
