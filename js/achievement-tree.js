// The achievement tree on achievements.html: summary, the tree itself, the detail window and the developers' controls.
import { esc } from './sheet.js?v=__V__';
import { isDevMode } from './layout.js?v=__V__';
import { achIcon, achDefs } from './achicons.js?v=__V__';
import { BRANCHES, ACHIEVEMENTS, BY_ID, METERS, fmtNum, loadAchievementData, guildMeters, evaluate, summarize, saveOverrides, clearOverrides, reloadOverrides } from './achievements.js?v=__V__';

const NODE = 66; const NODE_W = 150;

export async function initTree({ user, tree, summary, who, modal }) {
  tree.innerHTML = '<p class="muted" style="padding:16px">Loading…</p>';
  const data = await loadAchievementData();
  const players = [...new Set(data.characters.filter((c) => c.player && c.status !== 'Gestopt').map((c) => c.player))].sort((a, b) => a.localeCompare(b));
  if (!players.length) { tree.innerHTML = '<p class="muted" style="padding:16px">No players yet.</p>'; return; }
  const dev = isDevMode(user);
  let view = players.includes(user?.player) ? user.player : players[0];
  let guild; let all; // guild meters, states per player
  const compute = () => { guild = guildMeters(data, players); all = new Map(players.map((p) => [p, evaluate(data, p, guild)])); };
  compute();

  who.innerHTML = players.map((p) => `<option value="${esc(p)}"${p === view ? ' selected' : ''}>${esc(p)}${p === user?.player ? ' (you)' : ''}</option>`).join('');
  who.onchange = () => { view = who.value; render(); };

  // ---- layout: ONE tree that you scroll down. A root at the top fans out into the five branches, which stand side by side (three lanes each: left / middle / right)
  // and run into the Legend at the bottom. Tier (col) = how far down, so the same tier is always on the same height.
  const W = 70; const H = 116; const SZ = 60; const HEAD = 84; const TOP = 190; // cell width/height, medal size, height of the root + branch headings, where the first tier starts
  const order = BRANCHES.filter((b) => b.key !== 'legend');
  const GW = order.length * 3 * W; const MID = GW / 2;
  const cx = (a) => (order.findIndex((b) => b.key === a.branch) * 3 + a.row) * W + W / 2; const cy = (a) => TOP + a.col * H + SZ / 2;
  const spineX = (key) => (order.findIndex((b) => b.key === key) * 3 + 1) * W + W / 2;
  const tiers = Math.max(...ACHIEVEMENTS.filter((a) => a.branch !== 'legend').map((a) => a.col)) + 1;
  const LEG = { x: MID, y: TOP + tiers * H + 40 }; const GH = LEG.y + 96;
  const focusBranch = (e) => { const n = e.target.closest?.('.ach-node, .ach-branch'); const b = n && [...n.classList].find((x) => x.startsWith('b-') && x !== 'b-legend'); if (b) tree.dataset.focus = b.slice(2); else tree.removeAttribute('data-focus'); };
  tree.addEventListener('pointerover', focusBranch); tree.addEventListener('pointerleave', () => tree.removeAttribute('data-focus'));
  const fitWidth = () => { const g = tree.querySelector('.ach-grid'); const box = tree.querySelector('.ach-fit'); if (!g || !box) return; const sc = Math.max(0.5, Math.min(1, (tree.clientWidth - 8) / GW)); g.style.transform = `scale(${sc})`; box.style.height = `${GH * sc}px`; box.style.width = `${Math.max(tree.clientWidth, GW * sc)}px`; g.style.marginLeft = `${Math.max(0, (Math.max(tree.clientWidth, GW * sc) - GW * sc) / 2)}px`; };
  window.addEventListener('resize', fitWidth);
  let firstRender = true;

  function node(a, s, x, y, d, extra = '') {
    const known = s.done || s.available || s.disabled;
    const cls = s.disabled ? 'off' : s.done ? 'done' : s.available ? 'avail' : 'locked';
    const name = known ? a.title : '???';
    const tip = s.disabled ? `${a.title}: switched off by the developers` : known ? `${a.title}: ${a.desc}` : `Locked: complete ${a.requires.filter((r) => !all.get(view).get(r).done).map((r) => all.get(view).get(r).available || all.get(view).get(r).done ? BY_ID.get(r).title : '???').join(' and ')} first`;
    const size = a.branch === 'legend' ? 96 : SZ;
    const count = s.available && !s.done && a.meter !== 'requiredDone' ? `<span class="ach-count">${fmtNum(Math.min(s.value, s.target))}/${fmtNum(s.target)}</span>` : '';
    return `<button type="button" class="ach-node b-${a.branch} ${cls} scope-${a.scope}${firstRender ? ' pop' : ''}" data-id="${a.id}" style="left:${x - W / 2}px;top:${y - SZ / 2 - (size - SZ) / 2}px;width:${W}px;--sz:${size}px;--d:${d}ms;${extra}" title="${esc(tip)}" aria-label="${esc(name)}, ${cls === 'done' ? 'unlocked' : cls === 'avail' ? 'in progress' : cls === 'off' ? 'switched off' : 'locked'}">
      ${achIcon(a.glyph, a.tier, size, a.branch)}${count}<span class="ach-name">${esc(name)}</span>${a.scope === 'guild' && !s.done ? '<span class="ach-tag">Guild</span>' : ''}</button>`;
  }

  function render() {
    const states = all.get(view);
    const sum = summarize(states);
    summary.innerHTML = `
      <div class="box stat"><span class="muted">Achievement points</span><strong>${fmtNum(sum.points)}</strong></div>
      <div class="box stat"><span class="muted">Unlocked (${esc(view)})</span><strong>${sum.done} / ${sum.total}</strong></div>
      <div class="box stat"><span class="muted">Guild goals reached</span><strong>${sum.guildDone} / ${sum.guildTotal}</strong></div>
      <div class="box stat"><span class="muted">Best next target</span><strong class="stat-text">${esc(nextBig(states))}</strong></div>`;

    const head = `<header class="ach-head">
      <p class="ach-eyebrow">${esc(view)}</p>
      <h2>Kitchen level <b>${sum.done}</b></h2>
      <p class="ach-progress">Progress ${sum.done}/${sum.total} &middot; ${fmtNum(sum.points)} points</p>
      <div class="ach-flourish" aria-hidden="true"><i></i></div>
    </header>`;

    const paths = []; const labels = []; const nodes = [];
    const curve = (x1, y1, x2, y2) => { const m = (y2 - y1) / 2; return `M${x1} ${y1} C${x1} ${y1 + m} ${x2} ${y2 - m} ${x2} ${y2}`; };
    order.forEach((b, bi) => {
      const mine = ACHIEVEMENTS.filter((a) => a.branch === b.key);
      const active = mine.filter((a) => !states.get(a.id).disabled); const done = active.filter((a) => states.get(a.id).done);
      const pts = done.filter((a) => a.scope !== 'guild').reduce((n, a) => n + a.points, 0);
      const first = mine.find((a) => a.col === 0 && a.row === 1); const lit = states.get(first.id).done; const sx = spineX(b.key);
      paths.push(`<path class="b-${b.key}${lit ? ' done' : ''}" d="${curve(MID, 26, sx, HEAD - 6)}"/>`); // root -> the branch heading
      paths.push(`<path class="b-${b.key} trunk${lit ? ' done' : ''}" d="M${sx} ${HEAD + 58} L${sx} ${cy(first)}"/>`); // heading -> first achievement
      labels.push(`<div class="ach-branch b-${b.key}" style="left:${sx - 70}px;top:${HEAD}px"><h3>${esc(b.name)}</h3><strong>${pts}</strong><span>${done.length} / ${active.length}</span></div>`);
      for (const a of mine) for (const r of a.requires) {
        const f = BY_ID.get(r); if (f.branch !== a.branch) continue; const st = states.get(r);
        paths.push(`<path class="b-${b.key}${st.done || st.disabled ? ' done' : ''}" d="${curve(cx(f), cy(f), cx(a), cy(a))}"/>`);
      }
      mine.forEach((a) => nodes.push(node(a, states.get(a.id), cx(a), cy(a), bi * 60 + a.col * 90 + a.row * 20)));
    });
    // everything runs into the Legend
    const legend = ACHIEVEMENTS.find((a) => a.branch === 'legend');
    for (const r of legend.requires) { const f = BY_ID.get(r); const st = states.get(r); paths.push(`<path class="b-${f.branch}${st.done || st.disabled ? ' done' : ''}" d="${curve(cx(f), cy(f), LEG.x, LEG.y)}"/>`); }
    nodes.push(node(legend, states.get(legend.id), LEG.x, LEG.y, 700, 'left:' + (LEG.x - 120) + 'px;width:240px;'));
    const root = `<circle class="ach-root" cx="${MID}" cy="26" r="18"/><circle class="ach-root-core" cx="${MID}" cy="26" r="6"/>`;
    const body = `<div class="ach-fit"><div class="ach-grid" style="width:${GW}px;height:${GH}px"><svg class="ach-lines" width="${GW}" height="${GH}" aria-hidden="true">${paths.join('')}${root}</svg>${labels.join('')}${nodes.join('')}</div></div>`;
    tree.innerHTML = `${head}${body}`;
    fitWidth();
    firstRender = false;
    tree.querySelectorAll('.ach-node').forEach((n) => n.addEventListener('click', () => openDetail(n.dataset.id)));
    if (!modal.hidden && modal.dataset.id) openDetail(modal.dataset.id, true);
  }

  // The nearest thing worth chasing: the available, not yet done achievement with the highest points.
  function nextBig(states) {
    const open = ACHIEVEMENTS.filter((a) => a.scope === 'player' && states.get(a.id).available && !states.get(a.id).done).sort((a, b) => b.points - a.points || states.get(b.id).pct - states.get(a.id).pct);
    return open[0]?.title ?? 'Everything unlocked';
  }

  // ---- detail window
  function openDetail(id, keep) {
    const a = BY_ID.get(id); const states = all.get(view); const s = states.get(id);
    const known = s.done || s.available || s.disabled;
    const by = players.filter((p) => all.get(p).get(id).done);
    const unit = METERS[a.meter];
    const reqs = a.requires.map((r) => { const rs = states.get(r); return `<li class="${rs.done || rs.disabled ? 'ok' : ''}">${rs.done || rs.available || rs.disabled ? esc(BY_ID.get(r).title) : '???'}</li>`; }).join('');
    modal.dataset.id = id;
    modal.innerHTML = `<div class="ach-card b-${a.branch}" role="dialog" aria-modal="true" aria-label="${esc(known ? a.title : 'Locked achievement')}">
      <div class="ach-card-head">${achIcon(a.glyph, a.tier, 84, a.branch)}<div><h2>${esc(known ? a.title : '???')}</h2>
        <div class="meta"><span><strong>${a.points}</strong> points</span>${a.hours ? `<span>about <strong>${fmtNum(a.hours)} h</strong> of play</span>` : ''}<span>${a.scope === 'guild' ? 'Guild goal: everybody shares it' : 'Personal: all your characters count'}</span></div></div></div>
      <p style="margin:0">${known ? esc(a.desc) : 'Complete what comes before it to see what this one asks.'}</p>
      ${a.requires.length ? `<div><span class="muted" style="font-size:13px">Requires</span><ul class="ach-req">${reqs}</ul></div>` : ''}
      ${s.available || s.done ? `<div><div style="display:flex;justify-content:space-between;font-size:14px"><span>${s.done ? 'Unlocked' : 'Progress'}${s.manual !== null ? ' <span class="muted">(value set by a developer)</span>' : ''}</span><span class="muted">${fmtNum(s.value)} / ${fmtNum(s.target)} ${esc(unit)}</span></div><div class="ach-prog" aria-hidden="true"><i style="width:${Math.round(s.pct * 100)}%"></i></div></div>` : ''}
      ${s.disabled ? '<p class="muted" style="margin:0">The developers switched this achievement off. It does not count and does not block anything.</p>' : ''}
      ${a.scope === 'player' ? `<p class="muted" style="margin:0;font-size:13px">Unlocked by ${by.length} of ${players.length} players${by.length ? `: ${esc(by.join(', '))}` : ''}.</p>` : ''}
      ${dev ? devPanel(a, s) : ''}
      <div style="display:flex;justify-content:flex-end"><button type="button" class="btn" id="ach-close">Close</button></div></div>`;
    modal.hidden = false;
    modal.querySelector('#ach-close').onclick = closeDetail;
    if (dev) wireDev(a);
    if (!keep) modal.querySelector('#ach-close').focus();
  }
  function closeDetail() { modal.hidden = true; modal.dataset.id = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal) closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeDetail(); });

  // ---- developer controls (developer mode only; the database also checks is_dev())
  function devPanel(a, s) {
    const targets = a.scope === 'guild' ? '<option value="">The whole guild</option>' : `<option value="">Everyone</option>${players.map((p) => `<option value="${esc(p)}"${p === view ? ' selected' : ''}>${esc(p)}</option>`).join('')}`;
    return `<div class="ach-dev"><h3>Developer controls</h3>
      <div class="row-ctl"><label>For <select id="dev-who">${targets}</select></label></div>
      <div class="row-ctl"><button type="button" class="btn" data-act="off">${s.disabled ? 'Switch on again' : 'Switch off (for everyone)'}</button>
        <button type="button" class="btn" data-act="unlock">Force unlocked</button><button type="button" class="btn" data-act="lock">Force locked</button><button type="button" class="btn" data-act="free">Back to automatic</button></div>
      <div class="row-ctl"><input type="number" id="dev-value" min="0" step="any" placeholder="Value" aria-label="Value"><button type="button" class="btn" data-act="value">Set value</button>
        <button type="button" class="btn" data-act="reset">Reset progress</button><button type="button" class="btn" data-act="clear">Remove all changes</button></div>
      <div class="row-ctl"><input type="text" id="dev-note" maxlength="200" placeholder="Note (why?)" value="${esc(s.note ?? '')}" style="flex:1 1 220px"></div>
      <div class="msg muted" id="dev-msg">${s.updatedBy ? `Last changed by ${esc(s.updatedBy)}${s.updatedAt ? ` · ${new Date(s.updatedAt).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', hourCycle: 'h23', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}` : 'No changes yet: this one runs on its own.'}</div></div>`;
  }
  function wireDev(a) {
    const msg = modal.querySelector('#dev-msg');
    const say = (t, kind) => { msg.textContent = t; msg.className = `msg ${kind ?? 'muted'}`; };
    modal.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      const act = btn.dataset.act; const who = modal.querySelector('#dev-who').value; const note = modal.querySelector('#dev-note').value.trim() || null;
      const label = who || (a.scope === 'guild' ? 'the whole guild' : 'everyone');
      const targets = a.scope === 'guild' || who ? [who] : ['', ...players]; // "everyone" for a reset / value: the everyone row and every player's own row
      try {
        if (act === 'off') {
          if (!confirm(`Are you sure you want to switch "${a.title}" ${all.get(view).get(a.id).disabled ? 'on again' : 'off for everyone'}?`)) return;
          await saveOverrides([{ achievement_id: a.id, player_name: '', disabled: !all.get(view).get(a.id).disabled, note }], user.player);
        } else if (act === 'unlock' || act === 'lock') {
          if (!confirm(`Are you sure you want to force "${a.title}" ${act === 'unlock' ? 'unlocked' : 'locked'} for ${label}?`)) return;
          await saveOverrides([{ achievement_id: a.id, player_name: who, forced: act === 'unlock' ? 'unlocked' : 'locked', note }], user.player);
        } else if (act === 'free') {
          await saveOverrides([{ achievement_id: a.id, player_name: who, forced: null, note }], user.player);
        } else if (act === 'value') {
          const v = modal.querySelector('#dev-value').value;
          if (v === '' || Number.isNaN(Number(v)) || Number(v) < 0) { say('Enter a value of 0 or more.', 'bad'); return; }
          if (!confirm(`Are you sure you want to set the value of "${a.title}" to ${v} for ${label}?`)) return;
          await saveOverrides(targets.map((p) => ({ achievement_id: a.id, player_name: p, value: Number(v), note })), user.player);
        } else if (act === 'reset') {
          if (!confirm(`Are you sure you want to reset "${a.title}" for ${label}? Progress counts from now on, an unlock is taken back.`)) return;
          await saveOverrides(targets.map((p) => ({ achievement_id: a.id, player_name: p, forced: null, value: null,
            baseline: a.scope === 'guild' ? all.get(players[0]).get(a.id).measured : (p === '' ? 0 : all.get(p).get(a.id).measured), note })), user.player);
        } else if (act === 'clear') {
          if (!confirm(`Are you sure you want to remove all developer changes for "${a.title}"?`)) return;
          await clearOverrides(a.id, who === '' && a.scope !== 'guild' ? '*' : who);
        }
        data.overrides = await reloadOverrides(); compute(); render();
        const saved = modal.querySelector('#dev-msg'); if (saved) { saved.textContent = 'Saved.'; saved.className = 'msg ok'; }
      } catch (err) { say(`${err.message}${/relation|does not exist|schema cache/i.test(err.message) ? ' (run supabase/schema.sql in the SQL Editor first)' : ''}`, 'bad'); }
    }));
  }

  render();
}

export { achDefs };
