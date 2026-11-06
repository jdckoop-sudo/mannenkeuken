// The achievement tree on achievements.html: summary, the tree itself, the detail window and the developers' controls.
import { esc } from './sheet.js?v=__V__';
import { isDevMode } from './layout.js?v=__V__';
import { achIcon, achDefs } from './achicons.js?v=__V__';
import { BRANCHES, ACHIEVEMENTS, BY_ID, METERS, fmtNum, loadAchievementData, guildMeters, evaluate, summarize, saveOverrides, clearOverrides, reloadOverrides } from './achievements.js?v=__V__';

const COLW = 156; const ROWH = 130; const HEAD = 46; const NODE = 60; const LANE_GAP = 14;

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

  // ---- layout: lanes (branches) from top to bottom, nodes at column / row inside their lane
  let y = 0;
  const lane = new Map();
  for (const b of BRANCHES) { lane.set(b.key, { ...b, y }); y += HEAD + b.rows * ROWH + LANE_GAP; }
  const totalH = y; const cols = Math.max(...ACHIEVEMENTS.map((a) => a.col)) + 1; const totalW = cols * COLW;
  const pos = (a) => ({ x: a.col * COLW, y: lane.get(a.branch).y + HEAD + a.row * ROWH });
  const center = (a) => { const p = pos(a); return [p.x + COLW / 2, p.y + 4 + NODE / 2]; };

  function render() {
    const states = all.get(view);
    const sum = summarize(states);
    summary.innerHTML = `
      <div class="box stat"><span class="muted">Achievement points</span><strong>${fmtNum(sum.points)}</strong></div>
      <div class="box stat"><span class="muted">Unlocked (${esc(view)})</span><strong>${sum.done} / ${sum.total}</strong></div>
      <div class="box stat"><span class="muted">Guild goals reached</span><strong>${sum.guildDone} / ${sum.guildTotal}</strong></div>
      <div class="box stat"><span class="muted">Hardest still locked</span><strong class="stat-text">${esc(nextBig(states))}</strong></div>`;

    const lines = [];
    for (const a of ACHIEVEMENTS) {
      for (const r of a.requires) {
        const from = BY_ID.get(r); const [x1, y1] = center(from); const [x2, y2] = center(a);
        const dx = Math.max(30, Math.abs(x2 - x1) / 2);
        if (Math.abs(y2 - y1) > ROWH * 1.6) continue; // across the branches (the Legend): the window lists what it needs instead of a line through other nodes
        const s = states.get(r);
        lines.push(`<path class="${s.done || s.disabled ? 'done' : ''}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`);
      }
    }
    const lanes = BRANCHES.map((b) => { const l = lane.get(b.key); const mine = ACHIEVEMENTS.filter((a) => a.branch === b.key && !states.get(a.id).disabled);
      const d = mine.filter((a) => states.get(a.id).done).length;
      return `<div class="ach-lane" style="top:${l.y}px;height:${HEAD + b.rows * ROWH}px"><h3>${esc(b.name)} <span class="muted" style="font-size:12px;letter-spacing:0">${d} / ${mine.length}</span></h3><p>${esc(b.blurb)}</p></div>`; }).join('');
    const nodes = ACHIEVEMENTS.map((a) => {
      const s = states.get(a.id); const p = pos(a);
      const known = s.done || s.available || s.disabled;
      const cls = s.disabled ? 'off' : s.done ? 'done' : s.available ? 'avail' : 'locked';
      const name = known ? a.title : '???';
      const tip = s.disabled ? `${a.title}: switched off by the developers` : known ? `${a.title}: ${a.desc}` : `Locked: complete ${a.requires.filter((r) => !states.get(r).done).map((r) => states.get(r).available || states.get(r).done ? BY_ID.get(r).title : '???').join(' and ')} first`;
      return `<button type="button" class="ach-node ${cls} scope-${a.scope}" data-id="${a.id}" style="left:${p.x}px;top:${p.y}px;width:${COLW}px" title="${esc(tip)}" aria-label="${esc(name)}, ${cls === 'done' ? 'unlocked' : cls === 'avail' ? 'in progress' : cls === 'off' ? 'switched off' : 'locked'}">
        ${achIcon(a.glyph, a.tier, NODE)}<span class="ach-name">${esc(name)}</span>
        ${s.available && !s.done ? `<span class="ach-mini" aria-hidden="true"><i style="width:${Math.round(s.pct * 100)}%"></i></span>` : (a.scope === 'guild' ? '<span class="ach-tag">Guild goal</span>' : '')}</button>`;
    }).join('');
    tree.style.minWidth = `${totalW}px`; tree.style.height = `${totalH}px`;
    tree.innerHTML = `${lanes}<svg class="ach-lines" width="${totalW}" height="${totalH}" aria-hidden="true">${lines.join('')}</svg>${nodes}`;
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
    modal.innerHTML = `<div class="ach-card" role="dialog" aria-modal="true" aria-label="${esc(known ? a.title : 'Locked achievement')}">
      <div class="ach-card-head">${achIcon(a.glyph, a.tier, 84)}<div><h2>${esc(known ? a.title : '???')}</h2>
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
