// "Report a problem" and "Suggest a feature": a small form from the account menu (js/layout.js).
// It lands on the developers' board (Fixes or Ideas on dev.html, table dev_tickets) with the player's name on the card.
// The database function submit_ticket() (supabase/schema.sql) checks the login, takes the name from `members` and limits it to 10 per hour.
import { supabase } from './supabase.js?v=__V__';
import { esc } from './sheet.js?v=__V__';

const PAGES = {
  'index.html': 'Home', 'roster.html': 'Members', 'overview.html': 'Overview', 'professions.html': 'Professions',
  'achievements.html': 'Achievements', 'market.html': 'Market', 'events.html': 'Events', 'bank.html': 'Bank',
  'setup.html': 'Tips', 'profile.html': 'My profile', 'player.html': 'Player page', 'character.html': 'Character page',
};
const pageFile = () => location.pathname.split('/').pop() || 'index.html';
const pageLabel = () => PAGES[pageFile()] ?? pageFile().replace('.html', '');

const TEXT = {
  fix: {
    title: 'Report a problem',
    titleHint: 'e.g. The Reserve button does nothing on my phone',
    bodyHint: 'What did you do, what happened, and what did you expect? The more exact, the faster it is fixed.',
    note: 'We add your name, the page you are on and the site version, so the developers can find the problem.',
    done: 'Thanks! Your report is on the developers\' list of fixes.',
  },
  idea: {
    title: 'Suggest a feature',
    titleHint: 'e.g. A birthday calendar',
    bodyHint: 'What should it do, and how would it help the guild?',
    note: '',
    done: 'Thanks! Your idea is on the developers\' list of ideas.',
  },
};

export function openReport(kind, siteVersion = '') {
  const t = TEXT[kind];
  if (!t || !supabase) return;
  document.getElementById('report-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'report-dialog';
  dlg.className = 'box report-dialog';
  dlg.setAttribute('aria-label', t.title);
  dlg.innerHTML = `
    <form class="report-form">
      <h2>${esc(t.title)}</h2>
      <label>Title<input name="title" required minlength="3" maxlength="120" placeholder="${esc(t.titleHint)}" autocomplete="off"></label>
      <label>Details<textarea name="body" rows="5" maxlength="2000" placeholder="${esc(t.bodyHint)}"></textarea></label>
      ${t.note ? `<p class="muted report-note">${esc(t.note)}</p>` : ''}
      <p class="muted report-msg" role="status"></p>
      <div class="report-actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Send</button></div>
    </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const msg = dlg.querySelector('.report-msg');
  const send = dlg.querySelector('[type="submit"]');
  dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const title = d.get('title').trim();
    let body = d.get('body').trim();
    // For a problem the developers get the page and the site version along (who sent it is on the card already); no device details
    if (kind === 'fix') body += `${body ? '\n\n' : ''}— Sent from: ${pageLabel()} (${pageFile()})${siteVersion && !siteVersion.startsWith('_') ? ` · site version ${siteVersion}` : ''}`;
    send.disabled = true;
    msg.textContent = 'Sending…';
    const { error } = await supabase.rpc('submit_ticket', { p_kind: kind, p_title: title, p_body: body, p_page: pageLabel() });
    if (error) {
      send.disabled = false;
      msg.textContent = /submit_ticket|schema cache|Could not find/i.test(error.message)
        ? 'Reporting is not switched on yet: a developer has to run supabase/schema.sql in Supabase.'
        : error.message;
      return;
    }
    form.innerHTML = `<h2>${esc(t.title)}</h2><p style="margin:0">${esc(t.done)}</p><div class="report-actions"><button class="btn btn-primary" type="button" data-close>Close</button></div>`;
    form.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  });
  dlg.showModal();
  form.querySelector('[name="title"]').focus();
}
