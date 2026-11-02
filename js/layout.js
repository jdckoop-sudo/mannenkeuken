import { getUser, displayName, login, logout } from './supabase.js?v=__V__';

const pages = [
  ['index.html', 'Home'],
  ['roster.html', 'Roster'],
  ['professions.html', 'Professions'],
  ['market.html', 'Trade Market'],
  ['events.html', 'Raids & Events'],
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
    auth.innerHTML = `<span></span><button class="btn" type="button">Log out</button>`;
    auth.querySelector('span').textContent = displayName(user);
    auth.querySelector('button').addEventListener('click', logout);
  } else {
    auth.innerHTML = `<span id="auth-msg" class="muted"></span><button class="btn" type="button">Log in with Discord</button>`;
    auth.querySelector('button').addEventListener('click', login);
  }
  return user;
}
