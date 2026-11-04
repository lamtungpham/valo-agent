// Giao diện Valo Agent. Không tính toán tài chính ở đây: mọi số đến từ engine phía server.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} đ`;
const nf1 = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n);

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

async function act(path, body) {
  if (busy) return;
  busy = true;
  setBusy(true);
  try {
    const j = await api(path, body);
    if (j.state) { toolResult = j.result; S = j.state; } else S = j;
    render();
  } catch (e) {
    alert(`Lỗi: ${e.message}`);
  } finally {
    busy = false;
    setBusy(false);
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
  return `<span class="fact" data-fid="${esc(f.id)}" tabindex="0">${esc(f.display)}</span>`;
}
function factTable(facts) {
  if (!facts?.length) return '';
  facts.forEach((f) => FACT_STORE.set(f.id, f));
  return `<details class="facts"><summary>Số tính được bởi engine (${facts.length}): nguồn, ngày dữ liệu, công thức</summary>
  <table>${facts.map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.display)}</td><td>${esc(f.formula)}<br><i>${esc(f.source)} · dữ liệu ngày ${esc(f.asOf)}</i></td></tr>`).join('')}</table></details>`;
}
function showPop(el) {
  const f = FACT_STORE.get(el.dataset.fid);
  if (!f) return;
  const p = $('#pop');
  p.innerHTML = `<b>${esc(f.label)}</b>: ${esc(f.display)}
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
    ? '<span class="badge ai" title="Lời văn do Muse Spark viết, số do engine chèn">Nhận định của AI · Muse Spark</span>'
    : `<span class="badge neutral" title="${esc(m.aiError || '')}">Lời dẫn mẫu (chưa gọi được AI)</span>`;
}
function verifyBadge(m) {
  const v = m.verification;
  if (!v) return '';
  return `<details style="display:inline"><summary class="badge ${v.passed ? '' : 'warn'}" style="cursor:pointer;list-style:none">${v.passed ? 'Đã kiểm chứng ✓' : 'Kiểm chứng đã sửa ⚠'}</summary><ul class="checks">${v.checks.map((c) => `<li>${esc(c.msg)}</li>`).join('')}</ul></details>`;
}

function renderChat() {
  const box = $('#chat');
  const sevOf = Object.fromEntries((S.alerts || []).map((a) => [a.messageId, a.severity]));
  box.innerHTML = S.chat.map((m) => {
    if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
    const label = m.kind === 'coach' ? (STEP[m.step] || 'Coach') : KIND[m.kind] || m.kind;
    return `<div class="msg ${m.kind} sev-${sevOf[m.id] || ''}">
      <div class="meta"><b>${esc(label)}</b> · ${esc(fmt(m.date))} ${aiBadge(m)} ${verifyBadge(m)}</div>
      <div class="body">${renderSegments(m)}</div>
      ${factTable(m.facts)}
    </div>`;
  }).join('') || '<p class="note">Chưa có tin nhắn.</p>';
  box.scrollTop = box.scrollHeight;
  const last = [...S.chat].reverse().find((m) => m.role === 'agent');
  const chips = last && last === S.chat[S.chat.length - 1] ? last.chips || [] : [];
  $('#chips').innerHTML = chips.map((c) => `<button class="chip${/^\d+$/.test(c.label) ? ' score' : ''}" data-v="${esc(c.value)}" data-l="${esc(c.label)}">${esc(c.label)}</button>`).join('');
  const s = S.coaching.session;
  $('#stepBadge').innerHTML = s ? `đang ở bước <b>${esc(STEP[s.step] || s.step)}</b> (phiên được lưu, mở lại vẫn tiếp tục)` : 'không có phiên đang dở';
}
const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (b) act('/coach/reply', { value: b.dataset.v, text: b.dataset.l });
});
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#msg').value.trim();
  if (!t) return;
  $('#msg').value = '';
  act('/coach/reply', { text: t });
});
$('#btnStart').addEventListener('click', () => act('/coach/start', {}));
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === `tab-${b.dataset.tab}`));
  if (b.dataset.tab === 'onboard') window.Onboard?.load();
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
    ${b.gapMonths.length ? `<div class="card" style="border-color:var(--bad)"><b style="color:var(--bad)">Phát hiện ${b.gapMonths.length} tháng ngắt quãng:</b> ${factSpan(F('bhxh_gap_list'))}<div class="note">Tháng thiếu nằm giữa ${esc(b.firstMonth)} và ${esc(b.lastMonth)}. Nên đối chiếu với công ty hoặc cơ quan BHXH.</div></div>` : `<div class="card note">Lịch sử liên tục từ ${esc(b.firstMonth)} đến ${esc(b.lastMonth)}, không có tháng ngắt quãng.</div>`}
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
    <div class="card"><ul class="clean">${S.data.goals.map((g) => `<li class="row"><span>${esc(g.name)} (từ dữ liệu)</span><span>${factSpan(F(`goal_${g.id}_progress`))}</span></li>`).join('')}${c.goals.map((g) => `<li class="row"><span>${esc(g.name)}</span><span class="note">tạo ${fmt(g.createdAt)}</span></li>`).join('')}</ul></div>
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
    <div class="card form"><b>Bộ dữ liệu test</b>
      <select id="ds"><option value="mr-sample" ${S.user.dataset === 'mr-sample' ? 'selected' : ''}>Bộ 1: đóng BHXH liên tục 01/2018-10/2026</option><option value="mr-sample-gap" ${S.user.dataset === 'mr-sample-gap' ? 'selected' : ''}>Bộ 2: thiếu 03, 04, 05/2022</option><option value="valo-import" ${S.user.dataset === 'valo-import' ? 'selected' : ''}>Dữ liệu dán từ Valo</option><option value="valo" ${S.user.dataset === 'valo' ? 'selected' : ''}>Valo API thật ${S.adapter.configured ? '' : '(chưa cấu hình, sẽ dùng mock)'}</option></select>
      <div class="note">Bộ 1 và 2 là dữ liệu hư cấu có nhãn. "Valo API thật" đọc qua adapter HTTP; lỗi thì tự rơi về mock và ghi rõ lý do.</div></div>
    <div class="card form" id="valoImportCard"><b>Nối dữ liệu từ Valo</b>
      <div class="note">Trong app Valo: mở Cố vấn AI → bấm "Chỉ sao chép dữ liệu" (JSON valo-financial-context). Dán vào đây hoặc chọn file JSON. Dữ liệu chỉ lưu trên máy đang chạy Valo Agent.</div>
      <textarea id="valoPaste" rows="4" placeholder='{"schema":"valo-financial-context", ...}' style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);font:12px ui-monospace,monospace"></textarea>
      <div class="inline"><input type="file" id="valoFile" accept="application/json,.json"><button class="btn primary" id="btnImport">Nhập dữ liệu Valo</button></div></div>
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
  $('#valoFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('#valoPaste').value = await f.text(); });
  $('#btnImport').addEventListener('click', () => { const t = $('#valoPaste').value.trim(); if (t) act('/valo/import', { data: t }); });
  $('#btnUpd').addEventListener('click', () => act('/data/update', { emergencyFund: $('#inEf').value, lastMonthSpending: $('#inSp').value }));
  document.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => act('/time/advance', { days: Number(b.dataset.days) })));
  $('#btnReset').addEventListener('click', () => { if (confirm('Xoá toàn bộ hồ sơ coaching demo?')) act('/reset', {}); });
}

function renderAgents() {
  const item = (t) => {
    const rest = Object.entries(t).filter(([k]) => !['agent', 'at'].includes(k)).map(([k, v]) => `${k}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' · ');
    return `<li class="${esc(t.agent.split(' ')[0])}"><b>${esc(t.agent)}</b> · ${rest}</li>`;
  };
  $('#tab-agents').innerHTML = `
    <h3>Multi-agent chia vai</h3>
    <div class="pipeline"><span>Thu thập: chỉ đọc</span>→<span>Phân tích: chỉ engine</span>→<span>Coach: chỉ đối thoại</span>→<span>Kiểm chứng: soát số</span>→<span>Agent chính: chỉ nhận tóm tắt</span></div>
    <div class="card note">AI: Muse Spark <b>${esc(S.muse.model)}</b> qua ${esc(S.muse.baseUrl)} · ${S.muse.enabled ? 'đã cấu hình khoá' : 'chưa có META_API_KEY, Coach dùng lời dẫn mẫu'}. LLM không bao giờ nhận quyền tính số: nó chỉ chèn mã {{fact}} và Agent Kiểm chứng chặn mọi chữ số lạ.</div>
    <h4>Nhật ký gần nhất</h4>
    <ul class="clean trace">${S.trace.map(item).join('')}</ul>`;
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

window.ValoApp = { act, api, get state() { return S; }, esc, factSpan, factTable, renderSegments, aiBadge, verifyBadge };

(async () => {
  setBusy(true);
  try { S = await api('/state'); render(); } catch (e) { $('#chat').innerHTML = `<p>Lỗi tải: ${esc(e.message)}</p>`; }
  setBusy(false);
})();

// ---------- Nhánh chưa dùng Valo ----------
window.Onboard = (() => {
  const { act: _a, api, esc, factSpan, factTable, renderSegments, aiBadge, verifyBadge } = window.ValoApp;
  let O = null;
  let wait = false;
  const el = () => document.querySelector('#tab-onboard');
  async function call(path, body) {
    if (wait) return;
    wait = true;
    renderView(true);
    try { O = await api(path, body); } catch (e) { alert(e.message); }
    wait = false;
    renderView();
  }
  function bar(parts, total) {
    return `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid var(--line)">${parts.filter((p) => p.v > 0).map((p) => `<span title="${esc(p.l)}" style="width:${(p.v / total) * 100}%;background:${p.c};color:#fff;font-size:11px;display:grid;place-items:center;overflow:hidden;white-space:nowrap">${esc(p.l)}</span>`).join('')}</div>`;
  }
  function mapView(p) {
    const fm = Object.fromEntries(p.facts.map((f) => [f.id, f]));
    const fl = p.flow;
    const flowTotal = Math.max(fl.income, fl.expense + fl.debtPay, 1);
    const b = p.balance;
    const balTotal = Math.max(b.emergency + b.savings, b.debt, 1);
    const ef = fm.ob_ef_months.value;
    const need = fm.ob_goal_need.value;
    const cap = Math.max(0, fm.ob_surplus.value);
    const gTotal = Math.max(need, cap, 1);
    return `<h3>Bản đồ tài chính (hồ sơ tạm)</h3>
      <div class="card"><div class="note">Điều anh chưa yên tâm nhất</div><b>"${esc(p.worry)}"</b>${p.worryImpact ? `<div class="note">Khi giải quyết được: ${esc(p.worryImpact)}</div>` : ''}</div>
      <div class="card"><b>Dòng tiền tháng</b> · thu nhập ${factSpan(fm.ob_income)}
        <div style="margin:8px 0">${bar([{ v: fl.expense, l: 'Chi tiêu', c: '#8a8f2a' }, { v: fl.debtPay, l: 'Trả nợ', c: 'var(--bad)' }, { v: Math.max(0, fl.surplus), l: 'Dư', c: 'var(--brand)' }], flowTotal)}</div>
        <div class="note">Dư ${factSpan(fm.ob_surplus)} · tỷ lệ để dành ${factSpan(fm.ob_saving_rate)} · trả nợ/thu nhập ${factSpan(fm.ob_dti)}</div></div>
      <div class="card"><b>Tài sản và nợ</b>
        <div style="margin:8px 0">${bar([{ v: b.emergency, l: 'Quỹ khẩn cấp', c: 'var(--info)' }, { v: b.savings, l: 'Tiết kiệm, đầu tư', c: 'var(--brand)' }], balTotal)}</div>
        <div style="margin:8px 0">${bar([{ v: b.debt, l: 'Nợ', c: 'var(--bad)' }], balTotal)}</div>
        <div class="note">Tài sản ròng tài chính ${factSpan(fm.ob_net)}</div></div>
      <div class="card"><b>Quỹ khẩn cấp</b> đủ ${factSpan(fm.ob_ef_months)}
        <div class="gauge"><i class="${ef >= 3 ? 'ok' : ''}" style="width:${Math.min(100, (ef / 6) * 100)}%"></i><span class="tick" style="left:50%"></span></div>
        <div class="note">Vạch giữa = ngưỡng 3 tháng.</div></div>
      <div class="card"><b>Mục tiêu: ${esc(p.goalName || '')}</b> ${factSpan(fm.ob_goal)}
        <div class="note" style="margin-top:6px">Cần để dành mỗi tháng</div>${bar([{ v: need, l: 'Cần', c: 'var(--warn)' }], gTotal)}
        <div class="note" style="margin-top:6px">Khả năng hiện tại (dòng tiền dư)</div>${bar([{ v: cap, l: 'Có thể', c: 'var(--brand)' }], gTotal)}
        <div class="note">Chênh ${factSpan(fm.ob_goal_gap)} · nếu dồn toàn bộ phần dư: ${factSpan(fm.ob_goal_at_surplus)}</div></div>
      <div class="card"><b>Điểm cần chú ý</b><ul>${p.flags.map((f) => `<li>${esc(f.text)}: ${factSpan(fm[f.factId])}</li>`).join('') || '<li>Không có điểm lệch ngưỡng.</li>'}</ul>
        <div class="note">Khẩu vị rủi ro: ${factSpan(fm.ob_risk)}</div></div>
      ${factTable(p.facts)}
      <div class="card" style="border-color:var(--brand)"><b>Nối Valo để số liệu tự cập nhật</b>
        <p class="note">Hồ sơ này dựa trên lời khai nên sẽ cũ dần. Khi nối Valo, Agent Thu thập đọc số dư, chi tiêu và lịch sử BHXH qua adapter và tự đánh giá lại mỗi khi dữ liệu đổi.</p>
        <button class="btn primary" id="obConnect">Nối Valo</button> <button class="btn" id="obRestart">Làm lại từ đầu</button></div>`;
  }
  function renderView(loading) {
    const box = el();
    if (!O || (!O.active && !O.messages?.length)) {
      box.innerHTML = `<h3>Dành cho người chưa dùng Valo</h3>
        <div class="card"><p>Khoảng 12-13 câu hỏi ngắn theo kiểu khai vấn, mỗi lần một câu. Bắt đầu từ điều anh đang lo nhất về tiền bạc, rồi mới tới con số. Kết thúc bằng một bản đồ tài chính trực quan và hồ sơ tạm.</p>
        <button class="btn primary" id="obStart">Bắt đầu</button></div>`;
      box.querySelector('#obStart').onclick = () => call('/onboarding/start', {});
      return;
    }
    const msgs = O.messages.map((m) => m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>`
      : `<div class="msg"><div class="meta">${aiBadge(m)} ${verifyBadge(m)}</div><div class="body">${renderSegments(m)}</div></div>`).join('');
    const q = O.question;
    box.innerHTML = `<div class="note">Câu ${Math.min(O.idx + 1, O.total)}/${O.total}${O.done ? ' · đã xong' : ''}</div>
      <div class="chat" style="max-height:${O.done ? '260px' : '460px'};padding:8px 0">${msgs}</div>
      ${loading ? '<div class="typing">Coach đang trả lời…</div>' : ''}
      ${q ? `<div class="chips" style="padding:6px 0">${q.chips.map((c) => `<button class="chip" data-ob="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <form id="obForm" class="composer" style="padding:6px 0;border:0"><input id="obIn" placeholder="${q.type === 'money' ? 'Ví dụ: 15 triệu, 500k, 20.000.000' : q.type === 'number' ? 'Nhập một con số' : 'Trả lời bằng lời của anh'}" autocomplete="off"><button class="btn primary">Gửi</button></form>` : ''}
      ${O.done && O.profile ? mapView(O.profile) : ''}`;
    const c = box.querySelector('.chat');
    if (c) c.scrollTop = c.scrollHeight;
    box.querySelectorAll('[data-ob]').forEach((b) => (b.onclick = () => call('/onboarding/answer', { text: b.dataset.ob })));
    const f = box.querySelector('#obForm');
    if (f) f.onsubmit = (e) => { e.preventDefault(); const t = box.querySelector('#obIn').value.trim(); if (t) call('/onboarding/answer', { text: t }); };
    const cn = box.querySelector('#obConnect');
    if (cn) cn.onclick = () => { document.querySelector('[data-tab=data]').click(); setTimeout(() => document.querySelector('#valoPaste')?.focus(), 50); };
    const rs = box.querySelector('#obRestart');
    if (rs) rs.onclick = () => call('/onboarding/start', {});
  }
  return { async load() { if (!O) { O = await api('/onboarding'); } renderView(); } };
})();
