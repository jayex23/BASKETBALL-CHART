// ---------- State ----------
function mkTeam(name){ return { name, players: [], q: [0,0,0,0], qf: [0,0,0,0], score: 0, penalties: 0, timeouts: 7 }; }

let state = {
  teams: [mkTeam('Home'), mkTeam('Away')],
  quarter: 1,
  lenSecs: 600,
  secs: 600,
  timer: null,
  nextId: 1,
  log: [],
  history: []
};

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = s => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
const impact = p => p.pts + p.reb + 1.5*p.ast - 0.5*p.pf;   // MVP formula
const qLabel = q => q <= 4 ? 'Q' + q : 'OT' + (q-4);

function ensureQ(t){
  while (t.q.length < state.quarter) t.q.push(0);
  while (t.qf.length < state.quarter) t.qf.push(0);
}

// Save a snapshot for undo (names are kept live, not restored)
function snap(){
  state.history.push(JSON.stringify({ teams: state.teams, quarter: state.quarter, log: state.log }));
  if (state.history.length > 200) state.history.shift();
}

function logMsg(msg){
  state.log.unshift(`${fmt(state.secs)} ${qLabel(state.quarter)}  ${msg}`);
  if (state.log.length > 300) state.log.pop();
}

// ---------- Clock ----------
function toggleClock(){
  if (state.timer){
    clearInterval(state.timer);
    state.timer = null;
  } else {
    if (state.secs <= 0) return;
    state.timer = setInterval(tick, 1000);
  }
  render();
}

function tick(){
  state.secs--;
  if (state.secs <= 0){
    state.secs = 0;
    clearInterval(state.timer);
    state.timer = null;
    logMsg(`--- End of ${qLabel(state.quarter)} ---`);
  }
  render();
}

function setLength(mins){
  state.lenSecs = +mins * 60;
  if (!state.timer) state.secs = state.lenSecs;
  render();
}

function resetClock(){
  clearInterval(state.timer);
  state.timer = null;
  state.secs = state.lenSecs;
  render();
}

function nextQuarter(){
  snap();
  clearInterval(state.timer);
  state.timer = null;
  logMsg(`--- End of ${qLabel(state.quarter)} ---`);
  state.quarter++;
  state.teams.forEach(ensureQ);
  state.secs = state.lenSecs;
  logMsg(`--- Start of ${qLabel(state.quarter)} ---`);
  render();
}

// ---------- Teams and players ----------
function renameTeam(ti, value){
  state.teams[ti].name = value || (ti ? 'Team 2' : 'Team 1');
  render();
}

function addPlayer(ti){
  const nameEl = $('pn'+ti), numEl = $('pnum'+ti);
  const name = nameEl.value.trim();
  if (!name) return;
  snap();
  state.teams[ti].players.push({
    id: state.nextId++, name, num: numEl.value.trim() || '-',
    pts: 0, reb: 0, ast: 0, pf: 0
  });
  logMsg(`${esc(state.teams[ti].name)}: added ${name}`);
  nameEl.value = '';
  numEl.value = '';
  nameEl.focus();
  render();
}

function removePlayer(ti, pid){
  const t = state.teams[ti];
  const p = t.players.find(x => x.id === pid);
  if (!p) return;
  if (p.pts || p.reb || p.ast || p.pf){
    alert(`${p.name} already has stats. Use Undo to reverse them before removing this player.`);
    return;
  }
  if (!confirm(`Remove ${p.name} from the roster?`)) return;
  snap();
  t.players = t.players.filter(x => x.id !== pid);
  logMsg(`${esc(t.name)}: removed ${p.name}`);
  render();
}

// Record a stat for a player
function act(ti, pid, type){
  const t = state.teams[ti];
  const p = t.players.find(x => x.id === pid);
  if (!p) return;
  snap();
  ensureQ(t);
  const qi = state.quarter - 1;
  let msg = '';

  if (type.startsWith('pts')){
    const n = +type.slice(3);
    p.pts += n;
    t.score += n;
    t.q[qi] += n;
    msg = `+${n} ${p.name}`;
  } else if (type === 'reb'){
    p.reb++;
    msg = `REB ${p.name}`;
  } else if (type === 'ast'){
    p.ast++;
    msg = `AST ${p.name}`;
  } else if (type === 'pf'){
    p.pf++;
    t.qf[qi]++;
    msg = `FOUL ${p.name} (${p.pf})`;
    if (p.pf === 6) msg += ' FOULED OUT';
  }
  logMsg(`${esc(t.name)}: ${msg}`);
  render();
}

function undo(){
  const last = state.history.pop();
  if (!last) return;
  const s = JSON.parse(last);
  const names = state.teams.map(t => t.name);
  const changedQuarter = s.quarter !== state.quarter;
  state.teams = s.teams;
  state.teams.forEach((t, i) => t.name = names[i]);
  state.quarter = s.quarter;
  state.log = s.log;
  if (changedQuarter) state.secs = state.lenSecs;
  render();
}

function newGame(){
  if (!confirm('Start a new game? All current data will be cleared.')) return;
  clearInterval(state.timer);
  state = {
    teams: [mkTeam('Home'), mkTeam('Away')],
    quarter: 1, lenSecs: +$('lenSel').value * 60, secs: +$('lenSel').value * 60,
    timer: null, nextId: 1, log: [], history: []
  };
  $('name0').value = 'Home';
  $('name1').value = 'Away';
  render();
}

// ---------- Rendering ----------
function qfCur(t){ return t.qf[state.quarter-1] || 0; }

function renderBoard(){
  const [a, b] = state.teams;
  $('boardA').innerHTML = `
    <div class="teamname" style="color:var(--a)">${esc(a.name)}</div>
    <div class="score">${a.score}</div>
    <div class="muted">Team fouls ${qLabel(state.quarter)}: ${qfCur(a)}${qfCur(a) >= 5 ? ' <span class="bad">BONUS</span>' : ''}</div>
    <div class="muted">Penalties: ${a.penalties} · Timeouts left: ${a.timeouts}</div>`;
  $('boardB').innerHTML = `
    <div class="teamname" style="color:var(--b)">${esc(b.name)}</div>
    <div class="score">${b.score}</div>
    <div class="muted">Team fouls ${qLabel(state.quarter)}: ${qfCur(b)}${qfCur(b) >= 5 ? ' <span class="bad">BONUS</span>' : ''}</div>
    <div class="muted">Penalties: ${b.penalties} · Timeouts left: ${b.timeouts}</div>`;
}

function tableHTML(t, withActions){
  if (!t.players.length) return '<p class="muted">No players yet.</p>';
  const rows = t.players.map(p => {
    const btns = withActions ? `
      <td><div class="row" style="flex-wrap:nowrap">
        <button class="mini" onclick="act(${state.teams.indexOf(t)},${p.id},'pts1')">+1</button>
        <button class="mini" onclick="act(${state.teams.indexOf(t)},${p.id},'pts2')">+2</button>
        <button class="mini" onclick="act(${state.teams.indexOf(t)},${p.id},'pts3')">+3</button>
        <button class="mini" onclick="act(${state.teams.indexOf(t)},${p.id},'reb')">REB</button>
        <button class="mini" onclick="act(${state.teams.indexOf(t)},${p.id},'ast')">AST</button>
        <button class="mini" onclick="act(${state.teams.indexOf(t)},${p.id},'pf')">FOUL</button>
        <button class="mini danger" onclick="removePlayer(${state.teams.indexOf(t)},${p.id})">×</button>
      </div></td>` : '';
    return `<tr>
      <td>${esc(p.name)} <span class="muted">#${esc(p.num)}</span></td>
      <td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td>
      <td class="${p.pf >= 6 ? 'bad' : ''}">${p.pf}</td>${btns}</tr>`;
  }).join('');
  return `<div class="scroll"><table>
    <thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>PF</th>${withActions ? '<th>Actions</th>' : ''}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderRosters(){
  state.teams.forEach((t, i) => { $('roster'+i).innerHTML = tableHTML(t, true); });
}

function renderChart(){
  const [a, b] = state.teams;
  const n = Math.max(4, a.q.length, b.q.length, state.quarter);
  const max = Math.max(1, ...a.q, ...b.q);
  const bar = (v, c) => `<div class="bar" style="height:${Math.max(2, v/max*80)}px;background:${c}"><span>${v}</span></div>`;
  let html = '';
  for (let i = 0; i < n; i++){
    html += `<div class="qcol">
      <div class="bars">${bar(a.q[i]||0, 'var(--a)')}${bar(b.q[i]||0, 'var(--b)')}</div>
      <div class="muted">${qLabel(i+1)}</div></div>`;
  }
  $('chart').innerHTML = html;
  $('legA').textContent = '■ ' + a.name;
  $('legB').textContent = '■ ' + b.name;
}

function renderLog(){
  $('log').innerHTML = state.log.length ? state.log.map(l => `<div>${l}</div>`).join('') : '<span class="muted">No events yet.</span>';
}

function renderClock(){
  $('clock').textContent = fmt(state.secs);
  $('centerQ').textContent = qLabel(state.quarter);
  $('qLabel').textContent = qLabel(state.quarter) + (state.timer ? ' · running' : ' · stopped');
  $('startBtn').textContent = state.timer ? 'Pause' : 'Start';
  $('startBtn').className = state.timer ? 'danger' : 'primary';
}

function render(){
  renderClock();
  renderBoard();
  renderRosters();
  renderChart();
  renderLog();
}

// ---------- End game and MVP ----------
function endGame(){
  clearInterval(state.timer);
  state.timer = null;
  renderClock();
  const [a, b] = state.teams;
  const all = [];
  state.teams.forEach((t, ti) => t.players.forEach(p => all.push({ p, t })));
  const ranked = all.slice().sort((x, y) => impact(y.p) - impact(x.p));
  const maxI = Math.max(1, ...ranked.map(r => Math.max(0, impact(r.p))));
  const winner = a.score === b.score ? 'Tie game' : (a.score > b.score ? a.name : b.name) + ' wins';
  const mvp = ranked[0];

  const rankRows = ranked.slice(0, 10).map(r => `
    <div style="margin:8px 0">
      <div style="display:flex;justify-content:space-between;font-size:14px">
        <span>${esc(r.p.name)} <span class="muted">(${esc(r.t.name)})</span></span>
        <span>${impact(r.p).toFixed(1)}</span>
      </div>
      <div class="hbar" style="width:${Math.max(0, impact(r.p))/maxI*100}%;background:${r.t === a ? 'var(--a)' : 'var(--b)'}"></div>
    </div>`).join('');

  $('summary').innerHTML = `
    <div class="top">
      <h2>Final</h2>
      <div class="row">
        <button class="primary" onclick="downloadPDF()">Download PDF</button>
        <button onclick="closeSummary()">Close</button>
      </div>
    </div>
    <div class="board section">
      <div><div class="teamname" style="color:var(--a)">${esc(a.name)}</div><div class="score">${a.score}</div></div>
      <div class="muted">FINAL</div>
      <div><div class="teamname" style="color:var(--b)">${esc(b.name)}</div><div class="score">${b.score}</div></div>
    </div>
    <p style="text-align:center;font-size:18px">${winner}</p>

    <div class="section">
      <h3>Scoring by quarter</h3>
      <div class="scroll"><table>
        <thead><tr><th>Team</th>${a.q.map((_, i) => `<th>${qLabel(i+1)}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
          <tr><td>${esc(a.name)}</td>${a.q.map(v => `<td>${v}</td>`).join('')}<td><b>${a.score}</b></td></tr>
          <tr><td>${esc(b.name)}</td>${b.q.map(v => `<td>${v}</td>`).join('')}<td><b>${b.score}</b></td></tr>
        </tbody></table></div>
    </div>

    <div class="section">
      <h3>MVP</h3>
      ${mvp ? `<div class="mvp">${esc(mvp.p.name)} (${esc(mvp.t.name)}), score ${impact(mvp.p).toFixed(1)}</div>` : '<p class="muted">No players recorded.</p>'}
      <p class="muted">Impact = PTS + REB + 1.5 × AST − 0.5 × PF. Top players shown below.</p>
      ${rankRows || '<p class="muted">No players recorded.</p>'}
    </div>

    <div class="section"><h3>Box score: ${esc(a.name)}</h3>${tableHTML(a, false)}</div>
    <div class="section"><h3>Box score: ${esc(b.name)}</h3>${tableHTML(b, false)}</div>
  `;
  $('overlay').classList.add('show');
}

function closeSummary(){
  $('overlay').classList.remove('show');
}

// ---------- Timeouts ----------
function useTimeout(ti){
  const t = state.teams[ti];
  if (t.timeouts <= 0){
    alert(`${t.name} has no timeouts left.`);
    return;
  }
  snap();
  t.timeouts--;
  logMsg(`${esc(t.name)}: TIMEOUT (${t.timeouts} left)`);
  render();
}

// ---------- Penalties and timeouts editor ----------
function openEdit(){
  $('editFields').innerHTML = state.teams.map((t, i) => `
    <div class="card" style="margin-bottom:10px">
      <h3 style="color:var(--${i ? 'b' : 'a'})">${esc(t.name)}</h3>
      <div class="row">
        <label>Penalties<br>
          <input type="number" min="0" id="ep${i}" value="${t.penalties}" style="width:120px">
        </label>
        <label>Timeouts left<br>
          <input type="number" min="0" max="99" id="to${i}" value="${t.timeouts}" style="width:120px">
        </label>
      </div>
    </div>`).join('');
  $('editOverlay').classList.add('show');
}

function saveEdit(){
  const vals = state.teams.map((t, i) => ({
    p: Math.max(0, parseInt($('ep'+i).value, 10) || 0),
    to: Math.max(0, parseInt($('to'+i).value, 10) || 0)
  }));
  snap();
  state.teams.forEach((t, i) => { t.penalties = vals[i].p; t.timeouts = vals[i].to; });
  logMsg('Penalties and timeouts updated');
  closeEdit();
  render();
}

function closeEdit(){
  $('editOverlay').classList.remove('show');
}

// ---------- PDF export (built in the browser, no libraries) ----------
function reportLines(){
  const L = [];
  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  const rpad = (s, n) => String(s).slice(0, n).padStart(n);
  const [a, b] = state.teams;
  const nQ = Math.max(4, a.q.length, b.q.length);
  const all = [];
  state.teams.forEach(t => t.players.forEach(p => all.push({ p, t })));
  const ranked = all.slice().sort((x, y) => impact(y.p) - impact(x.p));
  const winner = a.score === b.score ? 'TIE GAME' : (a.score > b.score ? a.name : b.name) + ' WINS';

  L.push('BASKETBALL GAME REPORT');
  L.push('Generated: ' + new Date().toLocaleString());
  L.push('');
  L.push(`${a.name}  ${a.score}   -   ${b.score}  ${b.name}`);
  L.push(winner);
  L.push('');

  L.push('SCORING BY QUARTER');
  let qh = pad('Team', 18);
  for (let i = 0; i < nQ; i++) qh += rpad(qLabel(i+1), 6);
  qh += rpad('Total', 8);
  L.push(qh);
  L.push('-'.repeat(qh.length));
  state.teams.forEach(t => {
    let row = pad(t.name, 18);
    for (let i = 0; i < nQ; i++) row += rpad(t.q[i] || 0, 6);
    row += rpad(t.score, 8);
    L.push(row);
  });
  L.push('');

  state.teams.forEach(t => {
    L.push(`PLAYER STATS - ${t.name.toUpperCase()}`);
    const hdr = pad('Player', 18) + pad('#', 5) + rpad('PTS', 5) + rpad('REB', 5) + rpad('AST', 5) + rpad('PF', 5) + rpad('IMPACT', 9);
    L.push(hdr);
    L.push('-'.repeat(hdr.length));
    if (!t.players.length) L.push('(no players)');
    t.players.forEach(p => {
      L.push(pad(p.name, 18) + pad(p.num, 5) + rpad(p.pts, 5) + rpad(p.reb, 5) +
             rpad(p.ast, 5) + rpad(p.pf, 5) + rpad(impact(p).toFixed(1), 9));
    });
    const tot = t.players.reduce((s, p) => {
      s.pts += p.pts; s.reb += p.reb; s.ast += p.ast; s.pf += p.pf; return s;
    }, { pts: 0, reb: 0, ast: 0, pf: 0 });
    L.push('-'.repeat(hdr.length));
    L.push(pad('TEAM TOTAL', 23) + rpad(tot.pts, 5) + rpad(tot.reb, 5) + rpad(tot.ast, 5) + rpad(tot.pf, 5));
    L.push('');
  });

  L.push('PENALTIES AND TIMEOUTS');
  state.teams.forEach(t => {
    L.push(pad(t.name, 18) + 'Penalties: ' + pad(t.penalties, 6) + 'Timeouts left: ' + t.timeouts);
  });
  L.push('');

  L.push('MVP');
  if (ranked.length){
    L.push(`${ranked[0].p.name} (${ranked[0].t.name}) - impact ${impact(ranked[0].p).toFixed(1)}`);
  } else {
    L.push('No players recorded.');
  }
  L.push('Impact = PTS + REB + 1.5 x AST - 0.5 x PF');
  L.push('');

  L.push('ALL PLAYERS RANKED BY IMPACT');
  ranked.forEach((r, i) => {
    L.push(pad((i+1) + '.', 4) + pad(r.p.name, 18) + pad(r.t.name, 14) + rpad(impact(r.p).toFixed(1), 8));
  });
  return L;
}

function makePDF(lines){
  const PAGE_LINES = 60;
  const pages = [];
  for (let i = 0; i < lines.length; i += PAGE_LINES) pages.push(lines.slice(i, i + PAGE_LINES));
  if (!pages.length) pages.push([]);

  // Keep only printable ASCII, escape PDF special characters
  const enc = s => String(s).replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const objs = [];
  const pageIds = [];
  let next = 4;
  pages.forEach(() => { pageIds.push(next, next + 1); next += 2; });

  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => pageIds[i*2] + ' 0 R').join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';

  pages.forEach((pg, i) => {
    const pid = pageIds[i*2], cid = pageIds[i*2 + 1];
    let content = 'BT /F1 9 Tf 12 TL 40 800 Td\n';
    pg.forEach(l => { content += `(${enc(l)}) Tj T*\n`; });
    content += 'ET';
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`;
    objs[cid] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offs = [];
  for (let i = 1; i < objs.length; i++){
    offs[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

function downloadPDF(){
  const blob = makePDF(reportLines());
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'basketball-report-' + new Date().toISOString().slice(0, 10) + '.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Init ----------
$('lenSel').value = '10';
render();
