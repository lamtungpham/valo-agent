// Giao diện Valo Agent. Không tính toán tài chính ở đây: mọi số đến từ engine phía server.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { tr, factDisplay, getLang, initI18n, setLang } from './i18n.js';
const EN = getLang() === 'en';
const vnd = (n) => (EN ? `${new Intl.NumberFormat('en-US').format(Math.round(n))} ₫` : `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} đ`);
const nf1 = (n) => new Intl.NumberFormat(EN ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 }).format(n);

let S = null;
let busy = false;
let sliderAge = 58;
let toolResult = null;

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(`/api${path}`, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// Gọi API ở chế độ luồng: máy chủ báo agent nào đang chạy theo thời gian thực, dòng cuối là kết quả.
async function apiLive(path, body) {
  const r = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify(body ?? {}) });
  if (!r.body || !String(r.headers.get('content-type')).includes('ndjson')) { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let done = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === 'stage') setLive(ev.agent, ev.detail);
      else if (ev.type === 'done') done = ev;
    }
    if (end) break;
  }
  if (!done) throw new Error('Mất kết nối giữa chừng');
  if (done.code >= 400) throw new Error(done.body?.error || `HTTP ${done.code}`);
  return done.body;
}

// Trạng thái sống của sơ đồ: agent nào đang chạy, agent nào đã chạy trong lượt này
const LIVE = { active: null, detail: '', ran: new Set(), running: false, queue: [], shownAt: 0, timer: null };
const LIVE_MIN_MS = 300; // bước chạy quá nhanh vẫn sáng đủ lâu để mắt kịp thấy
const liveMin = () => (LIVE.queue.length > 3 ? 120 : LIVE_MIN_MS); // hàng đợi dài thì tua nhanh để không bắt người dùng chờ
function setLive(agent, detail) {
  LIVE.queue.push({ agent, detail });
  pumpLive();
}
function pumpLive() {
  if (LIVE.timer || !LIVE.queue.length) return;
  const wait = Math.max(0, LIVE.shownAt + liveMin() - Date.now());
  LIVE.timer = setTimeout(() => {
    LIVE.timer = null;
    const { agent, detail } = LIVE.queue.shift();
    if (LIVE.active && LIVE.active !== agent) LIVE.ran.add(LIVE.active);
    LIVE.active = agent;
    LIVE.detail = detail;
    LIVE.running = true;
    LIVE.shownAt = Date.now();
    const t = $('#typing');
    if (t) t.textContent = `${agent}: ${detail}…`;
    paintLive();
    pumpLive();
  }, wait);
}
/** Chờ sơ đồ diễn xong các bước đã nhận rồi mới hiện kết quả. */
function drainLive() {
  return new Promise((res) => {
    const check = () => (!LIVE.queue.length && !LIVE.timer && Date.now() - LIVE.shownAt >= 200 ? res() : setTimeout(check, 50));
    check();
  });
}
function endLive() {
  LIVE.queue = [];
  if (LIVE.timer) { clearTimeout(LIVE.timer); LIVE.timer = null; }
  LIVE.active = null;
  LIVE.running = false;
  LIVE.ran.clear();
  const t = $('#typing');
  if (t) t.textContent = 'Các agent đang làm việc…';
  paintLive();
}
function paintLive() {
  const svg = document.querySelector('.ag-svg');
  if (!svg) return;
  svg.classList.toggle('running', LIVE.running);
  const idx = AGENTS.findIndex((n) => n.key === LIVE.active);
  svg.querySelectorAll('.ag-node').forEach((g) => {
    const k = g.dataset.agent;
    g.classList.toggle('active', k === LIVE.active);
    g.classList.toggle('ran', LIVE.ran.has(k) && k !== LIVE.active);
    if (k === LIVE.active) g.querySelector('.dt').textContent = LIVE.detail;
  });
  svg.querySelectorAll('.ag-link, .ag-pulse').forEach((el) => el.classList.toggle('flow', Number(el.dataset.i) === idx - 1));
  const st = $('#agLiveText');
  if (st) st.textContent = LIVE.running ? `Đang chạy: ${LIVE.active} (${LIVE.detail})` : 'Đang chờ. Nhắn tin, bấm Bắt đầu hoặc cập nhật dữ liệu để xem các agent làm việc.';
}

async function act(path, body) {
  if (busy) return;
  busy = true;
  showArchive = false;
  setBusy(true);
  try {
    const j = await apiLive(path, body);
    await drainLive();
    if (j.state) { toolResult = j.result; S = j.state; } else S = j;
    render();
  } catch (e) {
    alert(`Lỗi: ${e.message}`);
  } finally {
    busy = false;
    setBusy(false);
    endLive();
  }
}

function setBusy(b) {
  $('#typing').hidden = !b;
  document.querySelectorAll('button').forEach((x) => { if (!x.closest('.tabs')) x.disabled = b; });
}

// ---------- Fact chip & popover ----------
const FACT_STORE = new Map();
function factSpan(f) {
  if (!f) return '<span class="fact">—</span>';
  FACT_STORE.set(f.id, f);
  return `<span class="fact" data-fid="${esc(f.id)}" tabindex="0">${esc(factDisplay(f))}</span>`;
}
function factTable(facts) {
  if (!facts?.length) return '';
  facts.forEach((f) => FACT_STORE.set(f.id, f));
  return `<details class="facts"><summary>Số tính được bởi engine (${facts.length}): nguồn, ngày dữ liệu, công thức</summary>
  <table>${facts.map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(factDisplay(f))}</td><td>${esc(f.formula)}<br><i>${esc(f.source)} · dữ liệu ngày ${esc(f.asOf)}</i></td></tr>`).join('')}</table></details>`;
}
function showPop(el) {
  const f = FACT_STORE.get(el.dataset.fid);
  if (!f) return;
  const p = $('#pop');
  p.innerHTML = `<b>${esc(f.label)}</b>: ${esc(factDisplay(f))}
    <div class="k">Công thức</div>${esc(f.formula || '—')}
    <div class="k">Nguồn</div>${esc(f.source || '—')}
    <div class="k">Ngày dữ liệu</div>${esc(f.asOf || '—')}
    <div class="k">Loại</div>Số tính được (engine), không phải nhận định của AI`;
  p.hidden = false;
  const r = el.getBoundingClientRect();
  p.style.left = `${Math.min(window.innerWidth - 340, Math.max(8, r.left))}px`;
  p.style.top = `${r.bottom + 6}px`;
}
document.addEventListener('mouseover', (e) => { const el = e.target.closest('.fact'); if (el) showPop(el); });
document.addEventListener('mouseout', (e) => { if (e.target.closest('.fact')) $('#pop').hidden = true; });
document.addEventListener('focusin', (e) => { const el = e.target.closest('.fact'); if (el) showPop(el); });
document.addEventListener('focusout', () => { $('#pop').hidden = true; });

// ---------- Tin nhắn ----------
const KIND = { coach: 'Coach', alert: 'Agent chủ động lên tiếng', summary: 'Tóm tắt định kỳ' };
const STEP = {
  ST: 'Mức sẵn sàng · Stages of Change', MI1: 'MI · khơi khoảng cách', MI2: 'MI · phản chiếu lưỡng lự', MI3: 'MI · thước đo tầm quan trọng', MI4: 'MI · xin phép bước nhỏ', 'MI-END': 'MI · không ép, hẹn hỏi lại',
  G: 'GROW Goal · OSKAR Outcome', S: 'GROW Reality · OSKAR Scaling', K: 'OSKAR Know-how', O: 'GROW Options',
  WO1: 'WOOP Wish + Outcome', WO2: 'WOOP Obstacle', WP: 'WOOP Plan nếu-thì', WC: 'Thước đo tự tin', W: 'GROW Will · OSKAR Affirm + Action',
  DONE: 'Đã ghi cam kết', RV1: 'OSKAR Review · trách nhiệm giải trình', RVD: 'OSKAR Review · đã làm', RVM: 'OSKAR Review · WOOP chống tái phát', OK: 'Coach',
};

function renderSegments(m) {
  const map = Object.fromEntries((m.facts || []).map((f) => [f.id, f]));
  return (m.segments || []).map((s) => (s.t === 'text' ? esc(s.v) : factSpan(map[s.id] || S.facts[s.id]))).join('');
}

function aiBadge(m) {
  return m.aiMode === 'ai'
    ? '<span class="badge ai" title="Lời văn do Muse Spark viết, số do engine chèn">✦ Nhận định của AI · Muse Spark</span>'
    : `<span class="badge neutral" title="${esc(m.aiError || '')}">Lời dẫn mẫu (chưa gọi được AI)</span>`;
}
function verifyBadge(m) {
  const v = m.verification;
  if (!v) return '';
  return `<details style="display:inline"><summary class="badge ${v.passed ? '' : 'warn'}" style="cursor:pointer;list-style:none">${v.passed ? 'Đã kiểm chứng ✓' : 'Kiểm chứng đã sửa ⚠'}</summary><ul class="checks">${v.checks.map((c) => `<li>${esc(c.msg)}</li>`).join('')}</ul></details>`;
}

let showArchive = false;
function msgHtml(m, sevOf = {}) {
  if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
  const label = m.kind === 'coach' ? (STEP[m.step] || 'Coach') : KIND[m.kind] || m.kind;
  return `<div class="msg ${m.kind} sev-${sevOf[m.id] || ''}">
      <div class="meta"><b>${esc(label)}</b> · ${esc(fmt(m.date))} ${aiBadge(m)} ${verifyBadge(m)}</div>
      <div class="body">${renderSegments(m)}</div>
      ${factTable(m.facts)}
    </div>`;
}
function renderArchive(box) {
  const list = S.archive || [];
  box.innerHTML = `<div class="archive-head"><b>Lịch sử hội thoại (${list.length})</b><button class="btn small" id="btnBack">Quay lại phiên hiện tại</button></div>
    ${list.map((x, i) => `<details class="archive"${i === 0 ? ' open' : ''}><summary>${esc(x.title)} · ${esc(fmt(x.from))}${x.to && x.to !== x.from ? ` → ${esc(fmt(x.to))}` : ''} · ${x.count} tin</summary>${x.messages.map((m) => msgHtml(m)).join('')}</details>`).join('') || '<p class="note">Chưa có hội thoại nào được lưu trữ.</p>'}
    <p class="note">Mỗi lần mở phiên mới, nhập dữ liệu mới hoặc bấm "Xoá khung chat", hội thoại cũ được cất vào đây. Cam kết, mục tiêu và hồ sơ coaching vẫn giữ nguyên.</p>`;
  box.scrollTop = 0;
  $('#btnBack').onclick = () => { showArchive = false; renderChat(); };
}

function renderChat() {
  const box = $('#chat');
  $('#btnArchive').textContent = `Lịch sử${S.archive?.length ? ` (${S.archive.length})` : ''}`;
  if (showArchive) { renderArchive(box); $('#chips').innerHTML = ''; return; }
  const sevOf = Object.fromEntries((S.alerts || []).map((a) => [a.messageId, a.severity]));
  box.innerHTML = S.chat.map((m) => msgHtml(m, sevOf)).join('') || '<p class="note">Khung chat trống. Bấm "Bắt đầu / tiếp tục phiên" để tôi tổng kết tình hình và cùng chọn việc cần làm.</p>';
  box.scrollTop = box.scrollHeight;
  const last = [...S.chat].reverse().find((m) => m.role === 'agent');
  const chips = last && last === S.chat[S.chat.length - 1] ? last.chips || [] : [];
  $('#chips').innerHTML = chips.map((c) => `<button class="chip${/^\d+$/.test(c.label) ? ' score' : ''}" data-v="${esc(c.value)}" data-l="${esc(c.label)}">${esc(c.label)}</button>`).join('');
  $('#msg').placeholder = (last && last === S.chat[S.chat.length - 1] && last.hint) || 'Trả lời coach bằng lời của bạn…';
  const s = S.coaching.session;
  const ob = S.onboarding;
  $('#stepBadge').innerHTML = ob ? `đang khai hồ sơ (chưa dùng Valo) · câu <b>${ob.idx + 1}/${ob.total}</b>` : s ? `đang ở bước <b>${esc(STEP[s.step] || s.step)}</b> (phiên được lưu, mở lại vẫn tiếp tục)` : 'không có phiên đang dở';
}
const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const v = b.dataset.v || '';
  if (v.startsWith('ds:')) { act('/dataset', { dataset: v.slice(3) }); return; }
  if (v.startsWith('ui:')) { document.querySelector(`[data-tab=${v.slice(3)}]`)?.click(); return; }
  if (v.startsWith('tool:')) { document.querySelector('[data-tab=tools]')?.click(); document.querySelector(`[data-tool=${v.slice(5)}]`)?.click(); return; }
  act('/coach/reply', { value: v, text: b.textContent.trim() || b.dataset.l });
});
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#msg').value.trim();
  if (!t) return;
  $('#msg').value = '';
  act('/coach/reply', { text: t });
});
$('#btnStart').addEventListener('click', () => { showArchive = false; act('/coach/start', {}); });
$('#btnArchive').addEventListener('click', () => { showArchive = !showArchive; renderChat(); });
$('#btnClear').addEventListener('click', () => { showArchive = false; act('/chat/clear', {}); });
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === `tab-${b.dataset.tab}`));
});

// ---------- Tabs ----------
const F = (id) => S.facts[id];
function kpi(id, label) {
  const f = F(id);
  return `<div class="kpi card"><div class="lbl">${esc(label || f?.label)}</div><div class="val">${factSpan(f)}</div><div class="src">${esc(f?.formula || '')}</div></div>`;
}

function renderOverview() {
  const ef = F('ef_months');
  const pct = Math.min(100, (ef.value / 6) * 100);
  const alerts = S.alerts.map((a) => `<li class="row"><span>${esc(a.title)}</span><span class="badge ${a.severity === 'high' ? 'bad' : a.severity === 'info' ? 'info' : 'warn'}">${fmt(a.date)}</span></li>`).join('');
  $('#tab-overview').innerHTML = `
    <h3>Quỹ dự phòng</h3>
    <div class="card">
      <div class="inline"><div><div class="note">Đủ dùng</div><div style="font-size:24px;font-weight:700">${factSpan(ef)}</div></div>
      <div><div class="note">Số dư</div><b>${factSpan(F('ef_balance'))}</b></div><div><div class="note">Thiếu để đủ 3 tháng</div><b>${factSpan(F('ef_shortfall_3'))}</b></div></div>
      <div class="gauge"><i class="${ef.value >= 3 ? 'ok' : ''}" style="width:${pct}%"></i><span class="tick" style="left:50%"></span></div>
      <div class="note">Vạch giữa = ngưỡng 3 tháng, hết thanh = 6 tháng. ${esc(ef.formula)}.</div>
    </div>
    <div class="grid2">${kpi('monthly_expense')}${kpi('monthly_surplus')}${kpi('net_worth')}${kpi('goal_main_months', 'Mục tiêu chính: số tháng còn lại')}</div>
    <h4>Tỷ trọng tài sản</h4>
    <div class="card">${S.allocation.classes.map((c) => `<div class="row"><span>${esc(c.assetClass)}</span><span>${factSpan(F('alloc_' + c.assetClass))}</span></div>`).join('')}</div>
    <h4>Agent chủ động (chỉ lên tiếng khi lệch ngưỡng)</h4>
    <div class="card"><ul class="clean">${alerts || '<li class="note">Chưa có cảnh báo.</li>'}</ul></div>
    <h4>Tóm tắt định kỳ</h4>
    <div class="card note">${S.summaries.length ? `${S.summaries.length} bản tóm tắt, mới nhất ngày ${fmt(S.summaries[0].date)} (xem trong khung chat).` : 'Bản tóm tắt tự tạo mỗi 7 ngày. Dùng nút "Tua 7 ngày" ở tab Dữ liệu để xem.'}</div>`;
}

function renderBhxh() {
  const b = S.bhxh;
  const rows = b.byYear.map((y) => `<tr><td class="yr">${y.year}</td>${y.cells.map((c) => `<td class="c ${c.state}" title="${String(c.month).padStart(2, '0')}/${y.year}: ${c.state === 'paid' ? 'đã đóng, lương ' + vnd(c.salary) : c.state === 'gap' ? 'NGẮT QUÃNG' : 'không có dữ liệu'}"></td>`).join('')}<td class="cnt">${y.count} th · ${y.count ? nf1(y.avgSalary / 1e6) + ' tr' : ''}</td></tr>`).join('');
  const t = b.timeline;
  const total = t.length;
  const seg = (st) => t.filter((x) => x.status === st).length;
  const at = t.find((x) => x.age === sliderAge) || t[0];
  const statusText = { contributing: 'Đang đi làm và đóng BHXH', waiting: 'Đã nghỉ việc, CHƯA đủ tuổi hưởng lương hưu', pension: 'Đang hưởng lương hưu' }[at.status];
  $('#tab-bhxh').innerHTML = `
    <h3>Trợ lý BHXH · ${esc(S.data.profile.name)}</h3>
    <div class="grid2">${kpi('bhxh_hist_months')}${kpi('bhxh_gap_count')}</div>
    ${b.gapMonths.length ? `<div class="card" style="border-color:var(--neg)"><b style="color:var(--neg)">Phát hiện ${b.gapMonths.length} tháng ngắt quãng:</b> ${factSpan(F('bhxh_gap_list'))}<div class="note">Tháng thiếu nằm giữa ${esc(b.firstMonth)} và ${esc(b.lastMonth)}. Nên đối chiếu với công ty hoặc cơ quan BHXH.</div></div>` : `<div class="card note">Lịch sử liên tục từ ${esc(b.firstMonth)} đến ${esc(b.lastMonth)}, không có tháng ngắt quãng.</div>`}
    <h4>Lịch sử đóng theo năm và tháng</h4>
    <div class="card" style="overflow-x:auto"><table class="bhxh-grid"><tr><th></th>${Array.from({ length: 12 }, (_, i) => `<th>${i + 1}</th>`).join('')}<th></th></tr>${rows}</table>
      <div class="note">Xanh: đã đóng · Đỏ: ngắt quãng · Xám: ngoài khoảng dữ liệu.</div></div>
    <h4>Tuổi nghỉ dự định so với tuổi luật</h4>
    <div class="grid2">${kpi('age_planned')}${kpi('age_legal')}${kpi('retire_wait_months')}${kpi('retire_gap')}</div>
    <div class="card form"><div class="inline"><label>Đổi tuổi nghỉ dự định<input id="inPlanned" type="number" min="40" max="75" value="${b.plannedAge}"></label><button class="btn" id="btnPlanned">Cập nhật và chạy lại engine</button></div></div>
    <h4>Lương hưu dự kiến</h4>
    <div class="grid2">${kpi('bhxh_total_months')}${kpi('bhxh_years_rate')}${kpi('bhxh_avg_salary')}${kpi('bhxh_rate')}${kpi('bhxh_pension')}${kpi('bhxh_lump_sum')}</div>
    <h4>Thanh trượt tuổi 31-85</h4>
    <div class="card">
      <input class="slider" id="ageSlider" type="range" min="31" max="85" step="1" value="${sliderAge}">
      <div class="timeline">
        <span class="contributing" style="width:${(seg('contributing') / total) * 100}%">đóng BHXH</span>
        <span class="waiting" style="width:${(seg('waiting') / total) * 100}%">chờ</span>
        <span class="pension" style="width:${(seg('pension') / total) * 100}%">hưởng lương hưu</span>
        <i class="cursor" style="left:${((sliderAge - 31) / 54) * 100}%"></i>
      </div>
      <div style="font-size:18px;font-weight:700">Tại tuổi ${sliderAge} (${esc(at.ym)}): ${esc(statusText)}</div>
      <div class="grid2" style="margin-top:8px">
        <div class="kpi"><div class="lbl">Số tháng đã đóng tính tới tuổi này</div><div class="val">${at.contributedMonths} tháng</div><div class="src">≈ ${nf1(at.contributedYears)} năm</div></div>
        <div class="kpi"><div class="lbl">Lương hưu mỗi tháng</div><div class="val">${at.status === 'pension' ? vnd(b.monthlyPension) : 'Chưa hưởng'}</div><div class="src">Tỷ lệ ${b.rate}% × bình quân lương</div></div>
        <div class="kpi"><div class="lbl">Tổng lương hưu đã nhận (danh nghĩa)</div><div class="val">${vnd(at.pensionReceived)}</div><div class="src">${at.monthsReceived} tháng × lương hưu</div></div>
        <div class="kpi"><div class="lbl">Tiền tự lo giai đoạn chờ đã tiêu</div><div class="val">${vnd(at.bridgeSpent)}</div><div class="src">Số tháng chờ đã qua × chi tiêu lúc nghỉ</div></div>
      </div>
      <div class="note">Mọi số trên thanh trượt do engine BHXH tính sẵn cho từng tuổi (giả định hệ số trượt giá = 1, lương hưu giữ nguyên danh nghĩa).</div>
    </div>`;
  $('#ageSlider').addEventListener('input', (e) => { sliderAge = Number(e.target.value); renderBhxh(); $('#ageSlider').focus(); });
  $('#btnPlanned').addEventListener('click', () => act('/data/update', { plannedRetirementAge: Number($('#inPlanned').value) }));
}

function renderCommit() {
  const c = S.coaching;
  const st = { open: 'Đang mở', done: 'Đã làm', missed: 'Chưa giữ' };
  $('#tab-commit').innerHTML = `
    <h3>Hồ sơ coaching (lưu bền vững)</h3>
    <div class="card note">Khung: GROW mặc định · OSKAR cho mục tiêu và Review đầu phiên sau · WOOP cho hành vi tuần này · MI theo Stages of Change khi còn lưỡng lự.${c.readiness ? ` Giai đoạn gần nhất: <b>${esc(c.readiness.stage)}</b>.` : ''}</div>
    <h4>Cam kết</h4>
    <div class="card"><ul class="clean">${c.commitments.map((x) => `<li class="row"><div><div>${esc(x.text)}</div><div class="note">Ghi ngày ${fmt(x.createdAt)} · hạn ${fmt(x.dueDate)} · ${esc(x.goal)}</div>
      ${x.obstacle ? `<div class="note">Trở ngại (WOOP): ${esc(x.obstacle)}</div>` : ''}${x.ifThen ? `<div class="note">Kế hoạch: <b>${esc(x.ifThen)}</b></div>` : ''}
      ${x.score != null || x.confidence != null ? `<div class="note">Tự chấm tiến độ ${x.score ?? '—'}/10 · tự tin ${x.confidence ?? '—'}/10</div>` : ''}${x.reviewNote ? `<div class="note">Review: ${esc(x.reviewNote)}</div>` : ''}</div>
      <div>${x.status === 'open' ? `<button class="btn small" data-mark="${x.id}" data-s="done">Đã làm</button>` : ''} <span class="status ${x.status}">${st[x.status]}</span></div></li>`).join('') || '<li class="note">Chưa có cam kết. Hoàn thành một phiên GROW để tạo.</li>'}</ul></div>
    <h4>Lịch sử chưa giữ cam kết</h4>
    <div class="card"><ul class="clean">${c.violations.map((v) => `<li class="row"><div>${esc(v.text)}<div class="note">Ngày ${fmt(v.date)} · Lý do: ${esc(v.reason || 'chưa nêu')}</div></div></li>`).join('') || '<li class="note">Chưa có.</li>'}</ul></div>
    <h4>Mục tiêu</h4>
    <div class="card"><ul class="clean">${S.data.goals.map((g) => `<li class="row"><span>${esc(g.name)} (từ dữ liệu)</span><span>${factSpan(F(`gl_${String(g.id).replace(/\W/g, '_')}_progress`))}</span></li>`).join('')}${c.goals.map((g) => `<li class="row"><span>${esc(g.name)}</span><span class="note">tạo ${fmt(g.createdAt)}</span></li>`).join('')}</ul></div>
    <h4>Nhắc hẹn</h4>
    <div class="card"><ul class="clean">${c.reminders.map((r) => `<li class="row"><span>${esc(r.text)}</span><span class="note">${fmt(r.date)} ${r.fired ? '· đã nhắc' : ''}</span></li>`).join('') || '<li class="note">Chưa có.</li>'}</ul></div>
    <h4>Các phiên đã xong</h4>
    <div class="card"><ul class="clean">${c.sessions.map((s) => `<li class="row"><span>${s.topic === 'mi' ? `MI · chưa đặt mục tiêu · quan trọng ${s.importance ?? '—'}/10` : `Quỹ dự phòng ${s.targetMonths} tháng · tự chấm ${s.score ?? '—'}/10 · trở ngại: ${esc(s.reality || '')}`}</span><span class="note">${fmt(s.endedAt)}</span></li>`).join('') || '<li class="note">Chưa có.</li>'}</ul></div>`;
  document.querySelectorAll('[data-mark]').forEach((b) => b.addEventListener('click', () => act('/commitments/mark', { id: b.dataset.mark, status: b.dataset.s })));
}

function renderTools() {
  const r = toolResult;
  const res = r && !r.error ? `<div class="msg" style="max-width:100%"><div class="meta"><b>Kết quả tool</b> ${aiBadge(r)} ${verifyBadge(r)}</div><div class="body">${renderSegments(r)}</div>${factTable(r.facts)}</div>` : '';
  $('#tab-tools').innerHTML = `
    <h3>Công cụ hành động</h3>
    ${res}
    <div class="card form"><b>What-if: tăng tiết kiệm cho mục tiêu mua nhà</b>
      <div class="inline"><label>Thêm mỗi tháng (đ)<input id="wExtra" type="number" value="2000000" step="500000"></label><button class="btn primary" data-tool="what_if">Mô phỏng</button></div></div>
    <div class="card form"><b>So sánh phương án A và B (mua nhà)</b>
      <div class="inline"><label>A: góp tháng<input id="aM" type="number" value="7000000"></label><label>A: góp ngay<input id="aU" type="number" value="0"></label></div>
      <div class="inline"><label>B: góp tháng<input id="bM" type="number" value="5000000"></label><label>B: góp ngay<input id="bU" type="number" value="30000000"></label></div>
      <button class="btn primary" data-tool="compare_ab">So sánh</button></div>
    <div class="card form"><b>Mô phỏng sốc: mất việc</b>
      <div class="inline"><label>Số tháng mất thu nhập<input id="sM" type="number" value="6" min="1" max="24"></label><button class="btn primary" data-tool="shock_job_loss">Mô phỏng</button></div></div>
    <div class="card form"><b>Tạo mục tiêu</b>
      <div class="inline"><label>Tên<input id="gN" value="Du lịch Nhật Bản"></label><label>Số tiền (đ)<input id="gT" type="number" value="60000000"></label></div>
      <div class="inline"><label>Đã có (đ)<input id="gC" type="number" value="0"></label><label>Góp tháng (đ)<input id="gM" type="number" value="3000000"></label></div>
      <button class="btn primary" data-tool="create_goal">Tạo mục tiêu</button></div>
    <div class="card form"><b>Đặt nhắc</b>
      <div class="inline"><label>Ngày<input id="rD" type="date" value="${S.user.simDate}"></label><label>Nội dung<input id="rT" value="Kiểm tra sao kê thẻ tín dụng"></label></div>
      <button class="btn primary" data-tool="set_reminder">Đặt nhắc</button></div>`;
  const v = (id) => $(id).value;
  const P = {
    what_if: () => ({ extra: v('#wExtra') }),
    compare_ab: () => ({ aMonthly: v('#aM'), aUpfront: v('#aU'), bMonthly: v('#bM'), bUpfront: v('#bU') }),
    shock_job_loss: () => ({ months: v('#sM') }),
    create_goal: () => ({ name: v('#gN'), target: v('#gT'), current: v('#gC'), monthly: v('#gM') }),
    set_reminder: () => ({ date: v('#rD'), text: v('#rT') }),
  };
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => act('/tools/run', { tool: b.dataset.tool, params: P[b.dataset.tool]() })));
}

function renderData() {
  const d = S.data;
  $('#tab-data').innerHTML = `
    <h3>Nguồn dữ liệu</h3>
    <div class="card"><div><b>${esc(d.meta.label)}</b></div>
      <div class="note">Adapter: ${esc(d.meta.source === 'valo-import' ? 'Dữ liệu dán từ app Valo' : d.meta.source === 'mock' ? 'Mock (dữ liệu hư cấu)' : S.adapter.label)} · dữ liệu ngày ${esc(d.asOf)}${d.meta.fallbackReason ? ` · <b style="color:var(--warn)">Đang dùng mock vì: ${esc(d.meta.fallbackReason)}</b>` : ''}</div>
      ${d.edited ? '<div class="note">Có chỉnh sửa tay chồng lên dữ liệu gốc.</div>' : ''}</div>
    <div class="card form"><b>Bộ dữ liệu tài chính</b>
      <select id="ds"><option value="valo-import" ${S.user.dataset === 'valo-import' ? 'selected' : ''}>Dán dữ liệu từ Valo (mặc định)</option><option value="self-report" ${S.user.dataset === 'self-report' ? 'selected' : ''}>Chưa dùng Valo: trò chuyện để tự khai</option><option value="mr-sample" ${S.user.dataset === 'mr-sample' ? 'selected' : ''}>Bộ test 1: đóng BHXH liên tục 01/2018-10/2026</option><option value="mr-sample-gap" ${S.user.dataset === 'mr-sample-gap' ? 'selected' : ''}>Bộ test 2: thiếu BHXH 03, 04, 05/2022</option><option value="valo" ${S.user.dataset === 'valo' ? 'selected' : ''}>Valo API ${S.adapter.configured ? '' : '(chưa cấu hình, sẽ dùng dữ liệu mẫu)'}</option></select>
      ${S.user.dataset === 'valo-import' ? `<div class="note" style="margin-top:8px">Trong app Valo: mở Cố vấn AI → bấm "Chỉ sao chép dữ liệu" (JSON valo-financial-context), rồi dán vào ô dưới hoặc chọn file JSON. Dữ liệu chỉ lưu trên máy đang chạy Valo Agent.${S.user.hasValoImport ? '' : ' <b style="color:var(--warn)">Chưa có dữ liệu dán, đang tạm hiển thị dữ liệu mẫu Mr. Sample.</b>'}</div>
      <textarea id="valoPaste" rows="4" placeholder='{"schema":"valo-financial-context", ...}' style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);font:12px ui-monospace,monospace"></textarea>
      <div class="inline"><input type="file" id="valoFile" accept="application/json,.json"><button class="btn primary" id="btnImport">Nhập dữ liệu Valo</button></div>` : S.user.dataset === 'self-report' ? `<div class="note" style="margin-top:8px">Agent hỏi từng câu ngay trong khung chat coaching. Khai xong, lời khai thành nguồn dữ liệu chung cho Tổng quan, Công cụ, Cam kết và coaching; BHXH để trống cho tới khi nối Valo.${S.user.hasSelfReport ? '' : ' <b style="color:var(--warn)">Chưa khai xong, đang tạm hiển thị dữ liệu mẫu Mr. Sample.</b>'}</div>${S.user.hasSelfReport ? '<div class="inline"><button class="btn" id="btnSelfRedo">Khai lại từ đầu</button></div>' : ''}` : '<div class="note">Bộ test 1 và 2 là dữ liệu hư cấu có nhãn (Mr. Sample). "Valo API" đọc qua adapter HTTP; lỗi thì tự rơi về dữ liệu mẫu và ghi rõ lý do.</div>'}</div>
    <div class="card form"><b>Dữ liệu đổi → agent đánh giá lại theo sự kiện</b>
      <div class="inline"><label>Số dư quỹ dự phòng (đ)<input id="inEf" type="number" value="${d.accounts.find((a) => a.isEmergencyFund)?.balance ?? 0}" step="1000000"></label>
      <label>Chi tiêu tháng gần nhất (đ)<input id="inSp" type="number" value="" placeholder="giữ nguyên"></label></div>
      <button class="btn primary" id="btnUpd">Cập nhật dữ liệu</button>
      <div class="note">Thử hạ quỹ xuống dưới mức 3 tháng chi tiêu hoặc nâng lên trên: agent chỉ lên tiếng khi lệch ngưỡng.</div></div>
    <div class="card form"><b>Đồng hồ mô phỏng</b>
      <div class="inline"><button class="btn" data-days="1">Tua 1 ngày</button><button class="btn" data-days="7">Tua 7 ngày</button><button class="btn" data-days="20">Tua 20 ngày</button></div>
      <div class="note">Dùng để demo: nhắc cam kết, cam kết quá hạn, sắp tới hạn đóng BHXH, tóm tắt hằng tuần.</div></div>
    <div class="card form"><button class="btn" id="btnReset">Xoá hồ sơ coaching, bắt đầu lại demo</button></div>
    <h4>Tài khoản (đọc qua adapter)</h4>
    <div class="card"><ul class="clean">${d.accounts.map((a) => `<li class="row"><span>${esc(a.name)} <span class="note">${esc(a.assetClass)}</span></span><span>${vnd(a.balance)}</span></li>`).join('')}</ul><div class="note">Số dư hiển thị nguyên trạng từ nguồn dữ liệu.</div></div>`;
  $('#ds').addEventListener('change', (e) => act('/dataset', { dataset: e.target.value }));
  $('#valoFile')?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('#valoPaste').value = await f.text(); });
  $('#btnImport')?.addEventListener('click', () => { const t = $('#valoPaste').value.trim(); if (t) act('/valo/import', { data: t }); });
  $('#btnSelfRedo')?.addEventListener('click', () => act('/selfreport/restart', {}));
  $('#btnUpd').addEventListener('click', () => act('/data/update', { emergencyFund: $('#inEf').value, lastMonthSpending: $('#inSp').value }));
  document.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => act('/time/advance', { days: Number(b.dataset.days) })));
  $('#btnReset').addEventListener('click', () => { if (confirm('Xoá toàn bộ hồ sơ coaching demo?')) act('/reset', {}); });
}

const AGENTS = [
  { key: 'Thu thập', icon: '📥', role: 'Chỉ đọc dữ liệu', x: 70 },
  { key: 'Phân tích', icon: '🧮', role: 'Chỉ chạy engine', x: 230 },
  { key: 'Coach', icon: '💬', role: 'Chỉ đối thoại', x: 390 },
  { key: 'Kiểm chứng', icon: '🛡️', role: 'Soát từng con số', x: 550 },
  { key: 'Agent chính', icon: '🎯', role: 'Chỉ nhận tóm tắt', x: 710 },
];
function agentDetail(t) {
  if (!t) return 'chưa chạy';
  if (t.agent === 'Thu thập') return `${t.records?.spendingMonths ?? 0} tháng chi tiêu · ${t.records?.bhxhPeriods ?? 0} giai đoạn BHXH`;
  if (t.agent === 'Phân tích') return `${t.facts} fact · ${t.events?.length || 0} sự kiện`;
  if (t.agent === 'Coach') return t.mode === 'ai' ? 'Muse Spark viết lời dẫn' : /META_API_KEY/.test(t.note || '') ? 'lời dẫn mẫu (chưa có khoá AI)' : 'lời dẫn mẫu (AI lỗi, đã dự phòng)';
  if (t.agent === 'Kiểm chứng') return t.passed ? `đạt ${t.checks?.length || 0} phép kiểm` : 'chặn bản AI, dùng bản mẫu';
  if (t.agent === 'Agent chính') return `${t.action}${t.newAlerts?.length ? ` · ${t.newAlerts.length} cảnh báo mới` : ''}`;
  return t.action;
}
let agentAnimKey = '';
function renderAgents() {
  const item = (t) => {
    const rest = Object.entries(t).filter(([k]) => !['agent', 'at'].includes(k)).map(([k, v]) => `${k}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' · ');
    return `<li class="${esc(t.agent.split(' ')[0])}"><b>${esc(t.agent)}</b> · ${rest}</li>`;
  };
  const stamp = S.trace[0]?.at;
  const run = S.trace.filter((t) => t.at === stamp);
  const last = (k) => run.find((t) => t.agent === k);
  const blocked = last('Kiểm chứng') && !last('Kiểm chứng').passed;
  const Y = (i) => 56 + i * 104;
  const nodes = AGENTS.map((n, i) => {
    const t = last(n.key);
    const cls = `ag-node${n.key === 'Kiểm chứng' && blocked ? ' warn' : ''}`;
    return `<g class="${cls}" data-agent="${esc(n.key)}" transform="translate(110,${Y(i)})">
      <circle class="halo" r="40"></circle><circle class="core" r="32"></circle>
      <text class="ic" y="9" text-anchor="middle">${n.icon}</text>
      <text class="nm" x="54" y="-8">${esc(n.key)}</text>
      <text class="rl" x="54" y="11">${esc(n.role)}</text>
      <text class="dt" x="54" y="30">${esc(agentDetail(t))}</text></g>`;
  }).join('');
  const links = AGENTS.slice(0, -1).map((n, i) => {
    const d = `M110,${Y(i) + 40} L110,${Y(i + 1) - 40}`;
    return `<path class="ag-link" data-i="${i}" d="${d}"></path>
      <circle class="ag-pulse" data-i="${i}" r="5"><animateMotion dur="0.9s" repeatCount="indefinite" path="${d}"/></circle>`;
  }).join('');
  const back = `<path class="ag-back" d="M70,${Y(4)} C20,${Y(4)} 20,${Y(0)} 70,${Y(0)}"></path>
    <text class="rl" transform="translate(14,${(Y(0) + Y(4)) / 2}) rotate(-90)" text-anchor="middle">vòng lặp chủ động: sự kiện vượt ngưỡng → nhắc bạn</text>
    <path class="ag-veto" d="M150,${Y(3) - 12} C210,${Y(3) - 40} 210,${Y(2) + 40} 150,${Y(2) + 12}"></path>
    <text class="rl warnx" x="200" y="${(Y(2) + Y(3)) / 2 + 4}">số lạ → chặn, dùng bản mẫu</text>`;
  $('#tab-agents').innerHTML = `
    <h3>Multi-agent chia vai</h3>
    <p class="note">Sơ đồ chạy theo thời gian thực: agent nào đang làm việc thì sáng lên, agent vừa xong trong lượt này có viền cam nhạt. Khi đứng yên, dòng chữ dưới mỗi agent là việc nó làm ở lượt gần nhất.</p>
    <div class="ag-status" id="agLiveText"></div>
    <div class="card ag-wrap"><svg class="ag-svg" viewBox="0 0 520 520" role="img" aria-label="Sơ đồ luồng 5 agent">${back}${links}${nodes}</svg></div>
    <div class="card note">AI: Muse Spark <b>${esc(S.muse.model)}</b> qua ${esc(S.muse.baseUrl)} · ${S.muse.enabled ? 'đã cấu hình khoá' : 'chưa có META_API_KEY, Coach dùng lời dẫn mẫu'}. LLM không bao giờ nhận quyền tính số: nó chỉ chèn mã {{fact}} và Agent Kiểm chứng chặn mọi chữ số lạ.</div>
    <h4>Nhật ký gần nhất</h4>
    <ul class="clean trace">${S.trace.map(item).join('')}</ul>`;
  agentAnimKey = stamp;
  paintLive();
}

function render() {
  FACT_STORE.clear();
  $('#simDate').textContent = S.user.simDateText;
  $('#dataBadge').textContent = S.data.meta.fictional ? S.data.meta.label : `Dữ liệu Valo · ${S.data.meta.label}`;
  $('#dataBadge').className = `badge ${S.data.meta.fictional ? 'warn' : ''}`;
  $('#aiBadge').textContent = S.muse.enabled ? `AI: Muse Spark ${S.muse.model}` : 'AI: chưa có khoá Muse Spark';
  $('#aiBadge').className = `badge ${S.muse.enabled ? 'ai' : 'neutral'}`;
  renderChat();
  renderOverview();
  renderBhxh();
  renderCommit();
  renderTools();
  renderData();
  renderAgents();
}

// Chế độ hiển thị Tối → Sáng → Tự động (giống Valo Web App)
(() => {
  const order = ['dark', 'light', 'auto'];
  const label = { dark: 'Tối', light: 'Sáng', auto: 'Tự động' };
  let pref = 'auto';
  try { pref = localStorage.getItem('valo-agent.theme') || 'auto'; } catch {}
  const apply = () => {
    const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    $('#themeBtn').textContent = `Giao diện: ${label[pref]}`;
  };
  $('#themeBtn').addEventListener('click', () => {
    pref = order[(order.indexOf(pref) + 1) % order.length];
    try { localStorage.setItem('valo-agent.theme', pref); } catch {}
    apply();
  });
  apply();
})();

window.ValoApp = { act, api, get state() { return S; }, esc, factSpan, factTable, renderSegments, aiBadge, verifyBadge };

initI18n();
$('#langBtn').textContent = EN ? 'Tiếng Việt' : 'English';
$('#langBtn').addEventListener('click', async () => { try { await api('/lang', { lang: EN ? 'vi' : 'en' }); } catch {} setLang(EN ? 'vi' : 'en'); });

(async () => {
  setBusy(true);
  try {
    S = await api('/state');
    if ((S.user.lang || 'vi') !== getLang()) S = await api('/lang', { lang: getLang() }); // lời coach theo đúng ngôn ngữ giao diện
    render();
  } catch (e) { $('#chat').innerHTML = `<p>Lỗi tải: ${esc(e.message)}</p>`; }
  setBusy(false);
})();
