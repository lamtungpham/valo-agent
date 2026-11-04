// AGENT CHÍNH (điều phối): không đọc dữ liệu thô, không tính, không viết lời coach.
// Chỉ nhận TÓM TẮT từ các agent con và quyết định bước tiếp theo của vòng lặp coaching.
//
//   Thu thập (đọc) → Phân tích (engine + phán đoán có cấu trúc) → Coach (đối thoại)
//   → Kiểm chứng (soát số) → người dùng
import { collect } from './collector.js';
import { analyze, growFacts, fmtDate, addDays, daysBetween } from './analyst.js';
import { draft } from './coach.js';
import { verify } from './verifier.js';
import { fact } from '../engine/facts.js';
import { stateAtAge } from '../engine/bhxh.js';
import { save, uid, START_DATE } from '../store.js';
import { THRESHOLDS } from '../engine/finance.js';

const vnd = (n) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} đ`;

function pushTrace(user, entries) {
  const stamp = new Date().toISOString();
  user.trace = [...entries.map((e) => ({ ...e, at: stamp })), ...user.trace].slice(0, 40);
}

export async function pipeline(user) {
  const { snapshot, log: cLog } = await collect(user);
  const a = analyze(snapshot, user);
  return { a, logs: [cLog, a.log] };
}

function commitmentFacts(user, c) {
  if (!c) return [];
  const missed = user.violations.length;
  return [
    fact('c_text', { label: 'Cam kết đã ghi', value: c.text, unit: 'text', formula: 'Ghi lại nguyên văn khi chốt bước Will', source: 'Hồ sơ coaching', asOf: fmtDate(c.createdAt) }),
    fact('c_due', { label: 'Hạn cam kết', value: fmtDate(c.dueDate), unit: 'text', formula: 'Ngày chốt + 7 ngày', source: 'Hồ sơ coaching', asOf: fmtDate(c.createdAt) }),
    fact('c_amount', { label: 'Số tiền cam kết', value: c.amount, unit: 'vnd', formula: 'Mức tuần người dùng chọn', source: 'Hồ sơ coaching', asOf: fmtDate(c.createdAt) }),
    fact('v_count', { label: 'Số lần chưa giữ cam kết', value: missed, unit: 'count', display: `${missed} lần`, formula: 'Đếm lịch sử vi phạm cam kết', source: 'Hồ sơ coaching', asOf: fmtDate(user.simDate) }),
  ];
}

/** Coach soạn → Kiểm chứng soát → tạo tin nhắn hiển thị. */
async function compose(user, a, { kind = 'coach', step, intent, question, factIds = [], extraFacts = [], userAnswer, template, chips = [], input = false, extra }, logs) {
  const factMap = { ...a.factMap };
  for (const f of extraFacts) factMap[f.id] = f;
  const d = await draft({ intent, question, factIds, factMap, userAnswer, extra, template });
  const v = verify(d, factMap, { question, factIds });
  logs.push({ agent: 'Coach', action: step || kind, mode: d.mode, note: d.error || 'Muse Spark' });
  logs.push({ agent: 'Kiểm chứng', action: 'verify', passed: v.verification.passed, checks: v.verification.checks.map((c) => c.msg) });
  const msg = {
    id: uid('m'), role: 'agent', kind, step: step || null,
    segments: v.segments, facts: v.facts, aiMode: v.aiMode, aiError: v.aiError,
    verification: v.verification, chips, input, date: user.simDate, createdAt: new Date().toISOString(),
  };
  user.chat.push(msg);
  return msg;
}

function userMsg(user, text) {
  user.chat.push({ id: uid('m'), role: 'user', text, date: user.simDate, createdAt: new Date().toISOString() });
}

// ---------- Đánh giá chủ động theo sự kiện ----------
const ALERT_TPL = {
  ef_low: { intent: 'Cảnh báo chủ động: quỹ dự phòng dưới ngưỡng', t: 'Mình để ý quỹ dự phòng của anh hiện chỉ đủ {{ef_months}} chi tiêu, dưới ngưỡng an toàn {{ef_threshold}}. Để chạm ngưỡng còn thiếu {{ef_shortfall_3}}. Mình mở một phiên ngắn để lên kế hoạch nhé?', chips: [{ label: 'Bắt đầu phiên coaching', value: 'start' }] },
  spend_over: { intent: 'Cảnh báo chủ động: chi tiêu vượt ngân sách', t: 'Chi tiêu tháng vừa rồi là {{spend_last}}, vượt ngân sách {{spend_over_pct}}. Khoản vượt này đang ăn trực tiếp vào phần có thể để dành cho quỹ dự phòng.' },
  bhxh_due: { intent: 'Nhắc chủ động: sắp tới hạn đóng BHXH', t: 'Còn {{bhxh_due_days}} là tới hạn đóng BHXH kỳ này ({{bhxh_due_date}}). Anh nhớ kiểm tra công ty đã đóng đủ tháng này để lịch sử không bị ngắt quãng.' },
  bhxh_gap: { intent: 'Cảnh báo chủ động: lịch sử BHXH có tháng ngắt quãng', t: 'Lịch sử BHXH của anh có {{bhxh_gap_count}} tháng ngắt quãng: {{bhxh_gap_list}}. Anh nên đối chiếu với công ty hoặc cơ quan BHXH, vì tháng thiếu làm giảm thời gian đóng và lương hưu.' },
  retire_wait: { intent: 'Nhận định: tuổi nghỉ dự định sớm hơn tuổi luật', t: 'Anh dự định nghỉ ở {{age_planned}}, còn tuổi hưởng lương hưu theo luật là {{age_legal}} (tháng {{age_legal_month}}). Giai đoạn chờ {{retire_wait_months}} chưa có lương hưu, cần tự chuẩn bị khoảng {{retire_gap}}.' },
  commit_due: { intent: 'Nhắc cam kết sắp tới hạn', t: 'Nhắc nhẹ: cam kết "{{c_text}}" tới hạn vào {{c_due}}. Anh làm xong thì bấm xác nhận để mình cập nhật quỹ nhé.', chips: [{ label: 'Tôi đã làm xong', value: 'commit_done' }] },
  commit_overdue: { intent: 'Trách nhiệm giải trình: cam kết quá hạn chưa xác nhận', t: 'Cam kết "{{c_text}}" đã qua hạn {{c_due}} mà mình chưa thấy anh xác nhận. Mình muốn cùng anh nhìn lại xem vướng ở đâu.', chips: [{ label: 'Mở phiên nhìn lại', value: 'start' }] },
};

export async function evaluateEvents(user, a, logs, { reason = 'data-change' } = {}) {
  const rank = { info: 0, medium: 1, high: 2 };
  // phát cảnh báo nhẹ trước, nặng sau: tin cuối cùng (kèm nút hành động) là việc quan trọng nhất
  const fresh = a.events.filter((e) => user.alertKeys[e.key] !== e.dedupe).sort((x, y) => rank[x.severity] - rank[y.severity]);
  logs.push({ agent: 'Agent chính', action: 'evaluate', reason, received: a.events.map((e) => e.key), newAlerts: fresh.map((e) => e.key) });
  for (const e of fresh) {
    user.alertKeys[e.key] = e.dedupe;
    const tpl = ALERT_TPL[e.key];
    if (!tpl) continue;
    const c = e.commitmentId ? user.commitments.find((x) => x.id === e.commitmentId) : null;
    const extraFacts = commitmentFacts(user, c);
    const factIds = [...e.factIds, ...(c ? ['c_text', 'c_due'] : [])];
    const msg = await compose(user, a, { kind: 'alert', step: e.key, intent: tpl.intent, factIds, extraFacts, template: tpl.t, chips: tpl.chips || [] }, logs);
    user.alerts.unshift({ id: uid('al'), key: e.key, severity: e.severity, title: e.title, date: user.simDate, messageId: msg.id });
  }
  // Sự kiện đã hết (ví dụ quỹ đã lên trên ngưỡng) → bỏ khoá để lần sau tụt lại sẽ báo tiếp
  const active = new Set(a.events.map((e) => e.key));
  for (const k of Object.keys(user.alertKeys)) if (!active.has(k)) delete user.alertKeys[k];
}

export async function maybeSummary(user, a, logs) {
  const last = user.lastSummaryDate || START_DATE;
  if (daysBetween(last, user.simDate) < 7) return;
  user.lastSummaryDate = user.simDate;
  const done = user.commitments.filter((c) => c.status === 'done').length;
  const missed = user.commitments.filter((c) => c.status === 'missed').length;
  const open = user.commitments.filter((c) => c.status === 'open').length;
  const asOf = fmtDate(user.simDate);
  const extraFacts = [
    fact('s_date', { label: 'Ngày tóm tắt', value: asOf, unit: 'text', source: 'Lịch tóm tắt định kỳ (7 ngày)', asOf }),
    fact('s_done', { label: 'Cam kết đã hoàn thành', value: done, unit: 'count', display: `${done}`, formula: 'Đếm cam kết trạng thái hoàn thành', source: 'Hồ sơ coaching', asOf }),
    fact('s_missed', { label: 'Cam kết chưa giữ', value: missed, unit: 'count', display: `${missed}`, formula: 'Đếm cam kết trạng thái chưa làm', source: 'Hồ sơ coaching', asOf }),
    fact('s_open', { label: 'Cam kết đang mở', value: open, unit: 'count', display: `${open}`, formula: 'Đếm cam kết đang mở', source: 'Hồ sơ coaching', asOf }),
  ];
  const ids = ['s_date', 'ef_months', 'goal_main_progress', 's_done', 's_missed', 's_open'];
  const msg = await compose(user, a, {
    kind: 'summary', step: 'weekly', intent: 'Tóm tắt tiến độ mục tiêu định kỳ hằng tuần, nêu một điểm cần chú ý nhất',
    factIds: ids, extraFacts,
    template: 'Tóm tắt tuần tính đến {{s_date}}: quỹ dự phòng đủ {{ef_months}}, mục tiêu chính đạt {{goal_main_progress}}. Cam kết đã hoàn thành {{s_done}}, chưa giữ {{s_missed}}, đang mở {{s_open}}.',
  }, logs);
  user.summaries.unshift({ id: uid('s'), date: user.simDate, messageId: msg.id });
}

// ---------- Vòng GROW ----------
function openOverdue(user) {
  return user.commitments.find((c) => c.status === 'open' && c.dueDate < user.simDate);
}

function goalChips(a) {
  const chips = [];
  if (a.fin.ef.months < 3) chips.push({ label: '3 tháng chi tiêu (mức tối thiểu)', value: '3' });
  chips.push({ label: '6 tháng chi tiêu (mức khuyến nghị)', value: '6' });
  return chips;
}

async function askGoal(user, a, logs, extra) {
  user.session = { id: uid('ss'), topic: 'emergency', step: 'G', data: {}, startedAt: user.simDate };
  await compose(user, a, {
    step: 'G', intent: 'GROW, bước Goal: hỏi mục tiêu quỹ dự phòng', extra,
    question: 'Anh muốn quỹ dự phòng đủ cho bao nhiêu tháng chi tiêu?',
    factIds: ['ef_balance', 'ef_months', 'ef_threshold'],
    template: 'Hiện quỹ dự phòng của anh là {{ef_balance}}, đủ khoảng {{ef_months}} chi tiêu, trong khi ngưỡng an toàn tối thiểu là {{ef_threshold}}. Mình bắt đầu từ đích đến trước: anh muốn quỹ dự phòng đủ cho bao nhiêu tháng chi tiêu?',
    chips: goalChips(a), input: true,
  }, logs);
}

export async function startSession(user) {
  const logs = [];
  const { a, logs: pl } = await pipeline(user);
  logs.push(...pl);
  if (user.session) {
    logs.push({ agent: 'Agent chính', action: 'resume', step: user.session.step });
    pushTrace(user, logs);
    save();
    return;
  }
  const overdue = openOverdue(user);
  if (overdue) {
    user.session = { id: uid('ss'), topic: 'accountability', step: 'A1', data: { commitmentId: overdue.id }, startedAt: user.simDate };
    await compose(user, a, {
      step: 'A1', intent: 'Trách nhiệm giải trình: nhắc lại cam kết cũ chưa xác nhận, không khen suông',
      question: 'Anh đã làm được chưa?',
      factIds: ['c_text', 'c_due'], extraFacts: commitmentFacts(user, overdue),
      template: 'Trước khi bàn tiếp, mình muốn nhìn lại cam kết lần trước: "{{c_text}}", hạn {{c_due}}, và mình chưa thấy anh xác nhận. Anh đã làm được chưa?',
      chips: [{ label: 'Đã làm rồi', value: 'done' }, { label: 'Chưa làm được', value: 'missed' }], input: true,
    }, logs);
  } else if (a.fin.ef.months < THRESHOLDS.emergencyTargetMonths) {
    await askGoal(user, a, logs);
  } else {
    await compose(user, a, {
      step: 'OK', intent: 'Quỹ dự phòng đã đủ mức khuyến nghị, chuyển sự chú ý sang mục tiêu mua nhà và công cụ mô phỏng',
      factIds: ['ef_months', 'goal_main_progress', 'goal_main_months'],
      template: 'Quỹ dự phòng của anh đã đủ {{ef_months}}, đạt mức khuyến nghị. Mục tiêu chính đang đạt {{goal_main_progress}} và còn khoảng {{goal_main_months}} nếu giữ mức góp hiện tại. Anh có thể thử các công cụ mô phỏng bên phải để xem phương án nhanh hơn.',
    }, logs);
  }
  logs.push({ agent: 'Agent chính', action: 'start', step: user.session?.step || 'none' });
  pushTrace(user, logs);
  save();
}

function parseMonths(text, value) {
  const n = Number(value ?? (String(text).match(/\d+/) || [])[0]);
  return [3, 4, 5, 6, 9, 12].includes(n) ? n : n > 0 && n <= 24 ? n : 3;
}

function parseMoney(text) {
  const s = String(text).toLowerCase().replace(/\s/g, '');
  const m = s.match(/(\d+(?:[.,]\d+)*)(triệu|tr|k|nghìn|ngàn|đ|d)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  if (m[2] === 'triệu' || m[2] === 'tr') n *= 1e6;
  else if (m[2] === 'k' || m[2] === 'nghìn' || m[2] === 'ngàn') n *= 1e3;
  else if (n < 10000) n *= 1e3; // "500" hiểu là 500 nghìn
  return Math.round(n);
}

async function askReality(user, a, logs, answer) {
  const s = user.session;
  const g = growFacts(a, { targetMonths: s.data.targetMonths });
  s.step = 'R';
  await compose(user, a, {
    step: 'R', intent: 'GROW, bước Reality: phản chiếu thực tế bằng số engine rồi hỏi điều gì đang cản trở', userAnswer: answer,
    question: 'Điều gì đang khiến việc để riêng tiền vào quỹ khó nhất với anh lúc này?',
    factIds: ['g_target_amount', 'g_shortfall', 'monthly_surplus'], extraFacts: g.facts,
    template: 'Với mục tiêu này, quỹ cần khoảng {{g_target_amount}}, tức là còn thiếu {{g_shortfall}}. Thực tế mỗi tháng anh đang dư {{monthly_surplus}} sau chi tiêu. Điều gì đang khiến việc để riêng tiền vào quỹ khó nhất với anh lúc này?',
    chips: [
      { label: 'Chi tiêu phát sinh khó kiểm soát', value: 'Chi tiêu phát sinh khó kiểm soát' },
      { label: 'Đang dồn tiền cho mục tiêu mua nhà', value: 'Đang dồn tiền cho mục tiêu mua nhà' },
      { label: 'Chưa có tài khoản riêng cho quỹ', value: 'Chưa có tài khoản riêng cho quỹ' },
    ],
    input: true,
  }, logs);
}

async function askOptions(user, a, logs, answer) {
  const s = user.session;
  const g = growFacts(a, { targetMonths: s.data.targetMonths });
  s.step = 'O';
  s.data.options = g.options.map((o) => o.weekly);
  await compose(user, a, {
    step: 'O', intent: 'GROW, bước Options: thừa nhận vướng mắc người dùng vừa nêu, trình bày ba phương án do engine tính, hỏi phương án nào làm được ngay tuần này', userAnswer: answer,
    question: 'Trong ba phương án này, anh thấy phương án nào làm được ngay từ tuần này?',
    factIds: ['o1_weekly', 'o1_months', 'o2_weekly', 'o2_months', 'o3_weekly', 'o3_months'], extraFacts: g.facts,
    template: 'Mình hiểu, đó là vướng mắc rất thật. Có ba phương án: để riêng {{o1_weekly}} mỗi tuần thì đủ sau {{o1_months}}; {{o2_weekly}} mỗi tuần thì sau {{o2_months}}; {{o3_weekly}} mỗi tuần thì sau {{o3_months}}. Trong ba phương án này, anh thấy phương án nào làm được ngay từ tuần này?',
    chips: g.options.map((o, i) => ({ label: `Phương án ${i + 1}: ${vnd(o.weekly)}/tuần`, value: String(o.weekly) })),
    input: true,
  }, logs);
}

async function proposeWill(user, a, logs, answer) {
  const s = user.session;
  const g = growFacts(a, { targetMonths: s.data.targetMonths, weekly: s.data.weekly });
  s.step = 'W';
  const due = addDays(user.simDate, 7);
  s.data.dueDate = due;
  const extraFacts = [...g.facts, fact('w_due', { label: 'Hạn cam kết tuần này', value: fmtDate(due), unit: 'text', formula: 'Hôm nay + 7 ngày', source: 'Phiên coaching', asOf: fmtDate(user.simDate) })];
  await compose(user, a, {
    step: 'W', intent: 'GROW, bước Will: đề xuất kế hoạch cụ thể và một cam kết có hạn trong tuần này, mời người dùng chốt', userAnswer: answer,
    question: 'Anh chốt cam kết này chứ?',
    factIds: ['w_weekly', 'w_months', 'w_due', 'w_shock_months', 'w_shock_short'], extraFacts,
    template: 'Kế hoạch: mỗi tuần để riêng {{w_weekly}} vào quỹ dự phòng, dự kiến đạt mục tiêu sau {{w_months}}. Lý do cần làm ngay: nếu mất việc {{w_shock_months}} từ hôm nay, anh sẽ thiếu {{w_shock_short}}. Cam kết tuần này là chuyển {{w_weekly}} vào quỹ trước {{w_due}}. Anh chốt cam kết này chứ?',
    chips: [{ label: 'Tôi cam kết', value: 'commit' }, { label: 'Giảm mức một chút', value: 'lower' }],
    input: true,
  }, logs);
}

async function commit(user, a, logs) {
  const s = user.session;
  const c = {
    id: uid('c'),
    text: `Để riêng ${vnd(s.data.weekly)} vào quỹ dự phòng trước ${fmtDate(s.data.dueDate)}`,
    amount: s.data.weekly,
    createdAt: user.simDate,
    dueDate: s.data.dueDate,
    status: 'open',
    goal: `Quỹ dự phòng ${s.data.targetMonths} tháng`,
    sessionId: s.id,
  };
  user.commitments.unshift(c);
  const remindAt = addDays(c.dueDate, -1);
  user.reminders.unshift({ id: uid('r'), date: remindAt, text: `Nhắc cam kết: ${c.text}`, commitmentId: c.id, fired: false });
  const goalName = `Quỹ dự phòng ${s.data.targetMonths} tháng`;
  if (!user.goals.find((g) => g.name === goalName)) {
    user.goals.unshift({ id: uid('g'), name: goalName, kind: 'emergency', targetMonths: s.data.targetMonths, createdAt: user.simDate });
  }
  user.sessions.unshift({ id: s.id, topic: s.topic, startedAt: s.startedAt, endedAt: user.simDate, targetMonths: s.data.targetMonths, reality: s.data.reality, commitmentId: c.id });
  user.session = null;
  const extraFacts = [
    ...commitmentFacts(user, c),
    fact('r_date', { label: 'Ngày nhắc', value: fmtDate(remindAt), unit: 'text', formula: 'Hạn cam kết − 1 ngày', source: 'Lịch nhắc', asOf: fmtDate(user.simDate) }),
  ];
  await compose(user, a, {
    step: 'DONE', intent: 'Xác nhận đã ghi cam kết, nói rõ agent sẽ nhắc và sẽ hỏi lại khi tới hạn',
    factIds: ['c_text', 'r_date', 'c_due'], extraFacts,
    template: 'Đã ghi cam kết: "{{c_text}}". Mình sẽ nhắc anh vào {{r_date}} và hỏi lại kết quả khi tới hạn {{c_due}}. Hẹn anh phiên sau.',
  }, logs);
}

export async function reply(user, { text = '', value }) {
  const logs = [];
  const answer = String(value ?? text).trim();
  if (text || value) userMsg(user, text || answer);
  let { a, logs: pl } = await pipeline(user);
  logs.push(...pl);
  const s = user.session;
  if (!s) {
    // Ngoài phiên: mở phiên mới (hoặc phiên trách nhiệm nếu có cam kết quá hạn)
    pushTrace(user, logs);
    await startSession(user);
    return;
  }
  if (s.step === 'A1') {
    const c = user.commitments.find((x) => x.id === s.data.commitmentId);
    const done = value === 'done' || (/(rồi|xong|đã làm)/i.test(answer) && !/chưa/i.test(answer));
    if (done) {
      c.status = 'done';
      c.doneAt = user.simDate;
      user.overrides.emergencyFund = a.snap.emergencyFundBalance + c.amount;
      ({ a } = await pipeline(user));
      await compose(user, a, {
        step: 'A1-done', intent: 'Ghi nhận người dùng đã giữ cam kết, cập nhật quỹ bằng số engine, không khen quá đà',
        factIds: ['ef_balance', 'ef_months'],
        template: 'Cảm ơn anh đã giữ lời. Quỹ dự phòng giờ là {{ef_balance}}, đủ {{ef_months}} chi tiêu.',
      }, logs);
      user.session = null;
      await evaluateEvents(user, a, logs);
      if (a.fin.ef.months < THRESHOLDS.emergencyTargetMonths) await askGoal(user, a, logs, 'Người dùng vừa hoàn thành cam kết trước, giờ đặt cam kết tiếp theo');
    } else {
      c.status = 'missed';
      user.violations.unshift({ id: uid('v'), commitmentId: c.id, date: user.simDate, reason: null, text: c.text });
      s.step = 'A2';
      await compose(user, a, {
        step: 'A2', intent: 'Trách nhiệm giải trình: ghi nhận thẳng thắn cam kết chưa hoàn thành, không trách móc, hỏi vướng ở đâu',
        question: 'Điều gì đã cản trở anh?',
        factIds: ['c_text', 'v_count'], extraFacts: commitmentFacts(user, c),
        template: 'Mình ghi nhận thẳng thắn: cam kết "{{c_text}}" chưa hoàn thành; hồ sơ hiện ghi {{v_count}} chưa giữ cam kết. Mình không trách, nhưng cần hiểu rõ để kế hoạch sau thực tế hơn. Điều gì đã cản trở anh?',
        chips: [
          { label: 'Có khoản chi bất ngờ', value: 'Có khoản chi bất ngờ' },
          { label: 'Quên mất', value: 'Quên mất' },
          { label: 'Số tiền quá sức', value: 'Số tiền quá sức' },
        ],
        input: true,
      }, logs);
    }
  } else if (s.step === 'A2') {
    const v = user.violations.find((x) => x.commitmentId === s.data.commitmentId);
    if (v) v.reason = answer;
    user.session = null;
    await askGoal(user, a, logs, `Người dùng vừa giải thích lý do chưa giữ cam kết: "${answer}". Lần này cần chọn mức vừa sức hơn.`);
  } else if (s.step === 'G') {
    s.data.targetMonths = parseMonths(answer, value);
    s.data.goalText = answer;
    await askReality(user, a, logs, answer);
  } else if (s.step === 'R') {
    s.data.reality = answer;
    await askOptions(user, a, logs, answer);
  } else if (s.step === 'O') {
    const opts = s.data.options || [];
    const idx = answer.match(/^(?:phương án\s*)?([1-3])$/i);
    s.data.weekly = idx ? opts[Number(idx[1]) - 1] : parseMoney(answer) || opts[0];
    await proposeWill(user, a, logs, answer);
  } else if (s.step === 'W') {
    const yes = value === 'commit' || /(cam kết|đồng ý|ok|chốt|được)/i.test(answer);
    const lower = value === 'lower' || /(giảm|ít hơn|thấp hơn)/i.test(answer);
    if (lower) {
      s.data.weekly = Math.max(200000, Math.round((s.data.weekly * 0.6) / 100000) * 100000);
      await proposeWill(user, a, logs, answer);
    } else if (yes) {
      await commit(user, a, logs);
    } else {
      const m = parseMoney(answer);
      if (m) s.data.weekly = m;
      await proposeWill(user, a, logs, answer);
    }
  }
  logs.push({ agent: 'Agent chính', action: 'reply', step: user.session?.step || 'ended' });
  pushTrace(user, logs);
  save();
}

// ---------- Dữ liệu đổi / thời gian trôi ----------
export async function onDataChange(user, reason) {
  const logs = [];
  const { a, logs: pl } = await pipeline(user);
  logs.push(...pl);
  // nhắc hẹn đến ngày
  for (const r of user.reminders.filter((r) => !r.fired && r.date <= user.simDate)) {
    r.fired = true;
    if (r.commitmentId) continue; // cam kết đã có sự kiện commit_due riêng
    const asOf = fmtDate(user.simDate);
    await compose(user, a, {
      kind: 'alert', step: 'reminder', intent: 'Nhắc hẹn người dùng đã đặt',
      factIds: ['rm_text'], extraFacts: [fact('rm_text', { label: 'Nội dung nhắc', value: r.text, unit: 'text', source: 'Lịch nhắc', formula: `Đặt cho ngày ${fmtDate(r.date)}`, asOf })],
      template: 'Nhắc hẹn: {{rm_text}}.',
    }, logs);
  }
  await evaluateEvents(user, a, logs, { reason });
  await maybeSummary(user, a, logs);
  pushTrace(user, logs);
  save();
}

export async function markCommitment(user, id, status) {
  const c = user.commitments.find((x) => x.id === id);
  if (!c || c.status !== 'open') return;
  if (status === 'done') {
    c.status = 'done';
    c.doneAt = user.simDate;
    const { a } = await pipeline(user);
    user.overrides.emergencyFund = a.snap.emergencyFundBalance + c.amount;
    userMsg(user, `Tôi đã làm xong: ${c.text}`);
  }
  await onDataChange(user, 'commitment-update');
}

// ---------- Trạng thái cho giao diện ----------
export async function viewState(user, extras = {}) {
  const { a } = await pipeline(user);
  const p = a.proj;
  const timeline = [];
  for (let age = 31; age <= 85; age++) timeline.push(stateAtAge(p, age, a.snap.profile.retireMonthlySpend));
  return {
    user: { id: user.id, dataset: user.dataset, simDate: user.simDate, simDateText: fmtDate(user.simDate) },
    data: { meta: a.snap.meta, asOf: fmtDate(a.snap.asOf), profile: a.snap.profile, edited: a.snap.edited, accounts: a.snap.accounts, goals: a.fin.goals, monthlyExpense: a.monthlyExpense, surplus: a.surplus },
    facts: a.factMap,
    events: a.events,
    bhxh: {
      byYear: p.hist.byYear,
      gaps: p.hist.gaps,
      gapMonths: p.hist.gapMonths,
      totalMonths: p.hist.totalMonths,
      firstMonth: p.hist.firstMonth,
      lastMonth: p.hist.lastMonth,
      legal: p.legal,
      plannedAge: p.plannedAge,
      plannedYM: p.plannedYM,
      monthlyPension: p.monthlyPension,
      rate: p.rate,
      timeline,
    },
    allocation: a.fin.alloc,
    coaching: {
      session: user.session ? { step: user.session.step, topic: user.session.topic } : null,
      goals: user.goals,
      commitments: user.commitments,
      violations: user.violations,
      reminders: user.reminders,
      sessions: user.sessions,
    },
    chat: user.chat.slice(-80),
    alerts: user.alerts.slice(0, 30),
    summaries: user.summaries,
    trace: user.trace.slice(0, 25),
    ...extras,
  };
}
