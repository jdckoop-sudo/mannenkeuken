// The achievement tree on achievements.html: summary, the tree itself, the detail window and the developers' controls.
import { esc } from './sheet.js?v=__V__';
import { isDevMode } from './layout.js?v=__V__';
import { achIcon, achDefs } from './achicons.js?v=__V__';
import { BRANCHES, ACHIEVEMENTS, BY_ID, METERS, fmtNum, loadAchievementData, guildMeters, evaluate, summarize, saveOverrides, clearOverrides, reloadOverrides } from './achievements.js?v=__V__';

const NODE = 60; const NODE_W = 124;

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

  // ---- layout: a star. The Legend sits in the middle, the five branches run outwards like rays (col = distance from the middle, row = sideways).
  const ANGLE = { journey: -90, slayer: -18, craft: 54, treasury: 126, fellowship: 198 }; // degrees, clockwise from the right; Journey points up
  const R0 = 330; const STEP = 134; const LAT = 125;
  const rad = (key) => (ANGLE[key] * Math.PI) / 180;
  // Lattice point: col = distance along the ray, row = sideways (1 = the middle lane). Columns and rows may be fractions (used by the connectors).
  const at = (key, col, row) => { const t = rad(key); const r = R0 + col * STEP; const side = (row - 1) * LAT; return [Math.cos(t) * r - Math.sin(t) * side, Math.sin(t) * r + Math.cos(t) * side]; };
  const pos = (a) => (a.branch === 'legend' ? [0, 0] : at(a.branch, a.col, a.row));
  const maxCol = (key) => Math.max(...ACHIEVEMENTS.filter((a) => a.branch === key).map((a) => a.col));
  const labelPos = (key) => { const t = rad(key); const r = R0 * 0.52; const o = 64; return [Math.cos(t) * r - Math.sin(t) * o, Math.sin(t) * r + Math.cos(t) * o]; }; // beside the trunk, not on it
  const reach = Math.max(...ACHIEVEMENTS.map((a) => Math.hypot(...pos(a)))) + 110;

  const focusBranch = (e) => { const n = e.target.closest?.('.ach-node'); const b = n && [...n.classList].find((c) => c.startsWith('b-') && c !== 'b-legend'); if (b) tree.dataset.focus = b.slice(2); else tree.removeAttribute('data-focus'); };
  tree.addEventListener('pointerover', focusBranch); tree.addEventListener('pointerleave', () => tree.removeAttribute('data-focus'));
  let firstRender = true;
  function render() {
    const states = all.get(view);
    const sum = summarize(states);
    summary.innerHTML = `
      <div class="box stat"><span class="muted">Achievement points</span><strong>${fmtNum(sum.points)}</strong></div>
      <div class="box stat"><span class="muted">Unlocked (${esc(view)})</span><strong>${sum.done} / ${sum.total}</strong></div>
      <div class="box stat"><span class="muted">Guild goals reached</span><strong>${sum.guildDone} / ${sum.guildTotal}</strong></div>
      <div class="box stat"><span class="muted">Best next target</span><strong class="stat-text">${esc(nextBig(states))}</strong></div>`;

    const trunks = BRANCHES.filter((b) => b.key !== 'legend').map((b) => { const first = ACHIEVEMENTS.find((x) => x.branch === b.key && x.col === 0 && x.row === 1); const lit = states.get(first.id).done; const [x, y] = pos(first);
      return `<path class="b-${b.key} trunk${lit ? ' done' : ''}" d="M0 0 L${x} ${y}"/>`; }).join('');
    const lines = [];
    for (const a of ACHIEVEMENTS) {
      for (const r of a.requires) {
        const from = BY_ID.get(r); if (from.branch !== a.branch) continue; // the Legend lists what it needs in its window instead of lines across the star
        const k = a.branch; const s = states.get(r);
        const pts = [pos(from), pos(a)];
        lines.push(`<path class="b-${k}${s.done || s.disabled ? ' done' : ''}" d="M${pts.map((q) => q.join(' ')).join(' L')}"/>`);
      }
    }
    const labels = BRANCHES.filter((b) => b.key !== 'legend').map((b) => {
      const mine = ACHIEVEMENTS.filter((a) => a.branch === b.key && !states.get(a.id).disabled); const d = mine.filter((a) => states.get(a.id).done).length; const pts = mine.filter((a) => states.get(a.id).done && a.scope !== 'guild').reduce((n, a) => n + a.points, 0); const [x, y] = labelPos(b.key);
      return `<div class="ach-branch b-${b.key}" style="left:${x}px;top:${y}px"><h3>${esc(b.name)}</h3><strong>${pts}</strong><span>${d} / ${mine.length}</span></div>`;
    }).join('');
    const nodes = ACHIEVEMENTS.map((a) => {
      const s = states.get(a.id); const [x, y] = pos(a); const big = a.branch === 'legend'; const size = big ? 92 : NODE;
      const known = s.done || s.available || s.disabled;
      const cls = s.disabled ? 'off' : s.done ? 'done' : s.available ? 'avail' : 'locked';
      const name = known ? a.title : '???';
      const tip = s.disabled ? `${a.title}: switched off by the developers` : known ? `${a.title}: ${a.desc}` : `Locked: complete ${a.requires.filter((r) => !states.get(r).done).map((r) => states.get(r).available || states.get(r).done ? BY_ID.get(r).title : '???').join(' and ')} first`;
      return `<button type="button" class="ach-node b-${a.branch} ${cls} scope-${a.scope}${firstRender ? ' pop' : ''}" data-id="${a.id}" style="left:${x - NODE_W / 2}px;top:${y - size / 2 - 4}px;width:${NODE_W}px${firstRender ? `;--d:${Math.round(Math.hypot(x, y) * 0.55)}ms` : ''}" title="${esc(tip)}" aria-label="${esc(name)}, ${cls === 'done' ? 'unlocked' : cls === 'avail' ? 'in progress' : cls === 'off' ? 'switched off' : 'locked'}">
        ${achIcon(a.glyph, a.tier, size, a.branch)}<span class="ach-name">${esc(name)}</span>
        ${s.available && !s.done && a.meter !== 'requiredDone' ? `<span class="ach-count">${fmtNum(Math.min(s.value, s.target))}/${fmtNum(s.target)}</span>` : (a.scope === 'guild' && !s.done ? '<span class="ach-tag">Guild goal</span>' : '')}</button>`;
    }).join('');
    world.innerHTML = `<svg class="ach-lines" width="1" height="1" aria-hidden="true">${trunks}${lines.join('')}</svg>${labels}${nodes}`;
    firstRender = false;
    world.querySelectorAll('.ach-node').forEach((n) => n.addEventListener('click', () => { if (!dragged) openDetail(n.dataset.id); }));
    if (!modal.hidden && modal.dataset.id) openDetail(modal.dataset.id, true);
  }

  // ---- pan and zoom: drag to move, wheel / pinch / buttons to zoom, arrow keys and + - from the keyboard
  const world = tree; const stage = tree.parentElement;
  stage.insertAdjacentHTML('beforeend', `<div class="ach-zoom" role="group" aria-label="Zoom"><button type="button" data-z="in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out" title="Zoom out">&minus;</button><button type="button" data-z="center" aria-label="Back to the middle" title="Back to the middle">&#9678;</button><button type="button" data-z="fit" aria-label="Show everything" title="Show everything">&#9635;</button></div><p class="ach-hint muted">Drag to move &middot; scroll or pinch to zoom</p>`);
  const MIN = 0.28; const MAX = 1.7;
  let tx = 0; let ty = 0; let k = 0.8; let dragged = false;
  const apply = () => { world.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`; stage.style.setProperty('--ach-k', String(k)); };
  const zoomAt = (px, py, factor) => { const nk = Math.min(MAX, Math.max(MIN, k * factor)); const f = nk / k; tx = px - (px - tx) * f; ty = py - (py - ty) * f; k = nk; apply(); };
  const toCenter = (nk) => { const r = stage.getBoundingClientRect(); k = nk; tx = r.width / 2; ty = r.height / 2; apply(); };
  const fit = () => { const r = stage.getBoundingClientRect(); toCenter(Math.min(MAX, Math.max(MIN, Math.min(r.width, r.height) / (reach * 2)))); };
  const home = () => toCenter(stage.clientWidth < 700 ? 0.55 : 0.85);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
  const pointers = new Map(); let startX = 0; let startY = 0; let pinch = 0;
  stage.addEventListener('pointerdown', (e) => { if (e.target.closest('.ach-zoom')) return; pointers.set(e.pointerId, [e.clientX, e.clientY]); startX = e.clientX; startY = e.clientY; dragged = false; pinch = 0; });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const [px, py] = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) { dragged = true; stage.setPointerCapture(e.pointerId); stage.classList.add('moving'); }
    if (!dragged) return;
    if (pointers.size === 2) { // pinch
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = stage.getBoundingClientRect();
      if (pinch) zoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, d / pinch);
      pinch = d; return;
    }
    tx += e.clientX - px; ty += e.clientY - py; apply();
  });
  const release = (e) => { pointers.delete(e.pointerId); pinch = 0; if (!pointers.size) { stage.classList.remove('moving'); setTimeout(() => { dragged = false; }, 0); } };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  stage.addEventListener('click', (e) => { const z = e.target.closest('[data-z]')?.dataset.z; if (!z) return; const r = stage.getBoundingClientRect(); const c = [r.width / 2, r.height / 2];
    if (z === 'in') zoomAt(...c, 1.25); else if (z === 'out') zoomAt(...c, 0.8); else if (z === 'center') home(); else fit(); });
  stage.addEventListener('keydown', (e) => { const r = stage.getBoundingClientRect(); const step = 60;
    if (e.key === '+' || e.key === '=') zoomAt(r.width / 2, r.height / 2, 1.2); else if (e.key === '-') zoomAt(r.width / 2, r.height / 2, 0.83);
    else if (e.key === 'ArrowLeft') { tx += step; apply(); } else if (e.key === 'ArrowRight') { tx -= step; apply(); } else if (e.key === 'ArrowUp') { tx += 0; ty += step; apply(); } else if (e.key === 'ArrowDown') { ty -= step; apply(); } else if (e.key === '0') home(); else return;
    e.preventDefault(); });

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
  requestAnimationFrame(home);
}

export { achDefs };
