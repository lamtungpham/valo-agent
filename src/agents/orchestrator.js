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
import { THRESHOLDS, shockJobLoss } from '../engine/finance.js';

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

// ---------- Vòng coaching ----------
// Khung mặc định GROW, bổ sung ba lớp:
//  - Stages of Change + MI: hỏi mức sẵn sàng trước; người còn lưỡng lự đi nhánh phỏng vấn tạo động lực
//    (khơi khoảng cách, phản chiếu hai phía, thước đo tầm quan trọng) thay vì bị ép đặt mục tiêu.
//  - OSKAR: Outcome (Goal), Scaling 0-10 (Reality), Know-how, Affirm + Action (Will), Review đầu phiên sau.
//  - WOOP cho hành vi nhỏ tuần này: Wish (mức cam kết), Outcome, Obstacle nội tại, Plan "Nếu… thì tôi sẽ…".
//
// Bước: RV1 → RVD | RVM (Review) ; ST (giai đoạn) → MI1 → MI2 → MI3 → MI4 | MI-END ;
//       G → S → K → O → WO1 → WO2 → WP → WC → W → DONE

const STAGES = [
  { value: 'pre', label: 'Chưa thấy cần lắm', name: 'Chưa sẵn sàng (tiền dự định)' },
  { value: 'contemplation', label: 'Biết là cần nhưng còn lưỡng lự', name: 'Đang cân nhắc' },
  { value: 'preparation', label: 'Muốn bắt đầu, cần một kế hoạch', name: 'Chuẩn bị' },
  { value: 'action', label: 'Đã bắt đầu, muốn làm đều hơn', name: 'Hành động' },
];
const stageName = (v) => STAGES.find((s) => s.value === v)?.name || v;

function parseStage(text, value) {
  if (STAGES.some((s) => s.value === value)) return value;
  const t = String(text).toLowerCase();
  if (/(chưa thấy|không cần|chưa cần)/.test(t)) return 'pre';
  if (/(lưỡng lự|cân nhắc|phân vân|chưa chắc)/.test(t)) return 'contemplation';
  if (/(đã bắt đầu|đang làm|làm đều)/.test(t)) return 'action';
  return 'preparation';
}

const parseScore = (text, value) => {
  const n = Number(value ?? (String(text).match(/\d+/) || [])[0]);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n) : null;
};

const scoreChips = () => Array.from({ length: 11 }, (_, i) => ({ label: String(i), value: String(i) }));

const OBSTACLE_PLANS = {
  'Dễ quên': ['Nếu đến tối chủ nhật mà chưa chuyển, thì tôi sẽ chuyển ngay trước khi đi ngủ', 'Nếu lương về tài khoản, thì tôi sẽ đặt lệnh chuyển tự động ngay hôm đó'],
  'Thấy tiếc khi tiền nằm im': ['Nếu thấy tiếc khi chuyển tiền, thì tôi sẽ tự nhắc quỹ này là để bảo vệ chính mình', 'Nếu muốn rút tiền quỹ ra tiêu, thì tôi sẽ đợi qua một đêm rồi mới quyết'],
  'Hay chi tiêu theo cảm xúc': ['Nếu muốn mua thứ ngoài dự định, thì tôi sẽ đợi một ngày rồi mới quyết', 'Nếu thấy căng thẳng muốn mua sắm, thì tôi sẽ đi bộ một vòng trước'],
  'Ngại thao tác chuyển tiền': ['Nếu ngại thao tác, thì tôi sẽ cài chuyển khoản định kỳ một lần cho xong', 'Nếu mở app ngân hàng, thì tôi sẽ chuyển vào quỹ trước khi làm việc khác'],
};

function sessionFacts(user, s) {
  const d = s.data;
  const asOf = fmtDate(user.simDate);
  const T = (id, label, value, formula = 'Ghi nguyên văn lời người dùng') => (value === undefined || value === null || value === '' ? null
    : fact(id, { label, value, unit: 'text', formula, source: 'Phiên coaching', asOf }));
  const S = (id, label, value) => (value === undefined || value === null ? null
    : fact(id, { label, value, unit: 'count', display: `${value}/10`, formula: 'Người dùng tự chấm trên thang 0-10', source: 'Phiên coaching', asOf }));
  return [
    fact('k_scale', { label: 'Thang tự đánh giá', value: '0 đến 10', unit: 'text', formula: 'Thang đo coaching (OSKAR, MI)', source: 'Khung coaching', asOf }),
    S('s_score', 'Điểm tự đánh giá tiến độ', d.score),
    S('s_prev_score', 'Điểm tự đánh giá phiên trước', d.prevScore),
    S('s_conf', 'Mức tự tin làm đúng kế hoạch', d.confidence),
    S('s_importance', 'Mức quan trọng với người dùng', d.importance),
    T('s_knowhow', 'Điều đã giúp anh làm được (know-how)', d.knowhow),
    T('s_outcome', 'Kết quả tốt nhất anh hình dung', d.outcome),
    T('s_obstacle', 'Trở ngại nội tại', d.obstacle),
    T('s_ifthen', 'Kế hoạch nếu-thì', d.ifThen),
    T('s_stage', 'Giai đoạn sẵn sàng', d.stage ? stageName(d.stage) : null, 'Người dùng tự chọn (Stages of Change)'),
  ].filter(Boolean);
}

function prevCommitFacts(user, c) {
  if (!c) return [];
  const asOf = fmtDate(user.simDate);
  const out = commitmentFacts(user, c);
  if (c.obstacle) out.push(fact('c_obstacle', { label: 'Trở ngại đã lường trước', value: c.obstacle, unit: 'text', formula: 'Ghi ở bước Obstacle (WOOP) phiên trước', source: 'Hồ sơ coaching', asOf }));
  if (c.ifThen) out.push(fact('c_ifthen', { label: 'Kế hoạch nếu-thì phiên trước', value: c.ifThen, unit: 'text', formula: 'Ghi ở bước Plan (WOOP) phiên trước', source: 'Hồ sơ coaching', asOf }));
  return out;
}

/** Soạn một bước trong phiên: tự gắn fact của phiên (điểm, lời người dùng). */
async function step(user, a, logs, o) {
  const s = user.session;
  s.step = o.step;
  s.lastQuestion = o.question || null;
  s.lastChips = o.chips || [];
  const extraFacts = [...(o.extraFacts || []), ...(s ? sessionFacts(user, s) : [])];
  return compose(user, a, { input: true, ...o, extraFacts }, logs);
}

function newSession(user, data = {}) {
  user.session = { id: uid('ss'), topic: 'emergency', step: null, data, startedAt: user.simDate };
  return user.session;
}

function reviewTarget(user) {
  return user.commitments.find((c) => !c.reviewed && (c.status !== 'open' || c.dueDate < user.simDate));
}

function goalChips(a) {
  const chips = [];
  if (a.fin.ef.months < 3) chips.push({ label: '3 tháng chi tiêu (mức tối thiểu)', value: '3' });
  chips.push({ label: '6 tháng chi tiêu (mức khuyến nghị)', value: '6' });
  return chips;
}

function shockFacts(a) {
  const asOf = fmtDate(a.snap.asOf);
  const jl = shockJobLoss({ fund: a.fin.ef.balance, monthlyExpense: a.monthlyExpense, months: 6 });
  return [
    fact('w_shock_months', { label: 'Kịch bản sốc', value: 6, unit: 'months', formula: 'Kịch bản mất việc chuẩn của engine', source: 'Mô phỏng sốc', asOf }),
    fact('w_shock_short', { label: 'Nếu mất việc 6 tháng hôm nay, còn thiếu', value: jl.shortfall, unit: 'vnd', formula: '6 × chi tiêu tháng − quỹ dự phòng', source: 'Mô phỏng sốc', asOf }),
  ];
}

// ----- Stages of Change + MI -----
async function askStage(user, a, logs) {
  newSession(user);
  await step(user, a, logs, {
    step: 'ST', intent: 'Stages of Change: hỏi mức sẵn sàng thay đổi, không phán xét, chưa bàn con số mục tiêu',
    question: 'Nói thật lòng, chuyện xây quỹ dự phòng lúc này với anh đang ở mức nào?',
    factIds: ['ef_months', 'ef_threshold'],
    template: 'Quỹ dự phòng của anh hiện đủ khoảng {{ef_months}} chi tiêu, dưới ngưỡng an toàn {{ef_threshold}}. Trước khi bàn con số, mình muốn hiểu anh đang đứng ở đâu. Nói thật lòng, chuyện xây quỹ dự phòng lúc này với anh đang ở mức nào?',
    chips: STAGES.map((x) => ({ label: x.label, value: x.value })),
  });
}

async function askMI1(user, a, logs, answer) {
  await step(user, a, logs, {
    step: 'MI1', intent: 'Phỏng vấn tạo động lực (MI): tôn trọng quyền tự quyết, khơi khoảng cách giữa hiện tại và điều người dùng coi trọng bằng một câu hỏi mở, không thuyết giảng', userAnswer: answer,
    question: 'Điều đó có ý nghĩa gì với anh?',
    factIds: ['ef_months', 'w_shock_months', 'w_shock_short'], extraFacts: shockFacts(a),
    template: 'Mình tôn trọng điều đó, quyết định là của anh. Thử hình dung: quỹ vẫn chỉ đủ {{ef_months}} mà anh mất thu nhập {{w_shock_months}}, anh sẽ thiếu {{w_shock_short}}. Điều đó có ý nghĩa gì với anh?',
    chips: [{ label: 'Khá đáng lo', value: 'Khá đáng lo' }, { label: 'Chắc sẽ xoay xở được', value: 'Chắc sẽ xoay xở được' }, { label: 'Chưa nghĩ tới chuyện đó', value: 'Chưa nghĩ tới chuyện đó' }],
  });
}

async function askMI2(user, a, logs, answer) {
  await step(user, a, logs, {
    step: 'MI2', intent: 'MI: phản chiếu hai mặt của sự lưỡng lự (muốn và ngại), không tranh luận, hỏi điều gì khiến còn chần chừ', userAnswer: answer,
    question: 'Điều gì khiến anh còn chần chừ?',
    template: 'Nghe như một phần trong anh thấy cần có chỗ dựa khi có biến cố, còn một phần khác vẫn đang ngần ngại, và cả hai đều có lý do. Điều gì khiến anh còn chần chừ?',
    chips: [{ label: 'Muốn dồn tiền cho mục tiêu lớn hơn', value: 'Muốn dồn tiền cho mục tiêu lớn hơn' }, { label: 'Sợ phải cắt chi tiêu', value: 'Sợ phải cắt chi tiêu' }, { label: 'Thu nhập chưa ổn định', value: 'Thu nhập chưa ổn định' }],
  });
}

async function askMI3(user, a, logs, answer) {
  await step(user, a, logs, {
    step: 'MI3', intent: 'MI: ghi nhận lý do ngần ngại là chính đáng, rồi hỏi thước đo tầm quan trọng và vì sao không thấp hơn (khơi lời nói thay đổi)', userAnswer: answer,
    question: 'Trên thang đó, việc có quỹ dự phòng quan trọng với anh tới mức nào, và vì sao không phải mức thấp hơn?',
    template: 'Đó là lý do rất thật. Trên thang {{k_scale}}, việc có quỹ dự phòng quan trọng với anh tới mức nào, và vì sao không phải mức thấp hơn?',
    chips: scoreChips(),
  });
}

async function endMI(user, a, logs, answer) {
  const s = user.session;
  const recheck = addDays(user.simDate, 7);
  user.reminders.unshift({ id: uid('r'), date: recheck, text: 'Hỏi lại về quỹ dự phòng (MI, không ép)', fired: false });
  user.readiness = { stage: s.data.stage, importance: s.data.importance, date: user.simDate };
  user.sessions.unshift({ id: s.id, topic: 'mi', startedAt: s.startedAt, endedAt: user.simDate, stage: s.data.stage, importance: s.data.importance, reality: s.data.hesitation });
  await step(user, a, logs, {
    step: 'MI-END', intent: 'MI: kết phiên tôn trọng, không ép hành động, tóm tắt điều người dùng nói, hẹn hỏi lại', userAnswer: answer,
    extraFacts: [fact('mi_recheck', { label: 'Ngày hỏi lại', value: fmtDate(recheck), unit: 'text', formula: 'Hôm nay + 7 ngày', source: 'Lịch nhắc', asOf: fmtDate(user.simDate) })],
    factIds: ['mi_recheck'], input: false,
    template: 'Cảm ơn anh đã thành thật. Mình không ép, anh cứ cân nhắc theo nhịp của mình. Mình sẽ hỏi lại anh vào {{mi_recheck}}; nếu muốn bắt đầu sớm hơn, anh chỉ cần mở phiên mới.',
  });
  user.session = null;
}

// ----- GROW + OSKAR -----
async function askGoal(user, a, logs, extra) {
  if (!user.session) newSession(user);
  await step(user, a, logs, {
    step: 'G', intent: 'GROW Goal / OSKAR Outcome: hỏi đích đến bằng hình ảnh kết quả mong muốn', extra,
    question: 'Nó cần gánh được bao nhiêu tháng chi tiêu?',
    factIds: ['ef_balance', 'ef_months'],
    template: 'Hiện quỹ là {{ef_balance}}, đủ khoảng {{ef_months}} chi tiêu. Mình bắt đầu từ đích đến: hình dung quỹ dự phòng đã đủ lớn để anh yên tâm nếu có biến cố, nó cần gánh được bao nhiêu tháng chi tiêu?',
    chips: goalChips(a),
  });
}

async function askScaling(user, a, logs, answer) {
  const s = user.session;
  const g = growFacts(a, { targetMonths: s.data.targetMonths });
  const prev = s.data.prevScore != null ? 'Lần trước anh tự chấm {{s_prev_score}}. ' : '';
  await step(user, a, logs, {
    step: 'S', intent: 'GROW Reality / OSKAR Scaling: nêu thực tế bằng số engine, rồi hỏi người dùng tự chấm trên thang', userAnswer: answer,
    question: 'Với mức cao nhất là quỹ đã đủ như anh muốn, anh tự thấy mình đang ở đâu?',
    factIds: ['g_target_amount', 'g_shortfall', 'monthly_surplus', ...(s.data.prevScore != null ? ['s_prev_score'] : [])], extraFacts: g.facts,
    template: `${prev}Thực tế bây giờ: để đạt mục tiêu, quỹ cần {{g_target_amount}}, còn thiếu {{g_shortfall}}, trong khi mỗi tháng anh dư {{monthly_surplus}}. Trên thang {{k_scale}}, với mức cao nhất là quỹ đã đủ như anh muốn, anh tự thấy mình đang ở đâu?`,
    chips: scoreChips(),
  });
}

async function askKnowhow(user, a, logs, answer) {
  await step(user, a, logs, {
    step: 'K', intent: 'OSKAR Know-how: ghi nhận điểm người dùng tự chấm như một điểm tựa, hỏi về nguồn lực, kinh nghiệm từng làm được', userAnswer: answer,
    question: 'Trước đây anh từng để dành thành công cho việc gì, và điều gì giúp anh làm được lúc đó?',
    factIds: ['s_score'],
    template: 'Mức {{s_score}} chứ không phải thấp nhất, nghĩa là anh đã có một điểm tựa. Trước đây anh từng để dành thành công cho việc gì, và điều gì giúp anh làm được lúc đó?',
    chips: [{ label: 'Đặt chuyển khoản tự động', value: 'Đặt chuyển khoản tự động' }, { label: 'Có mục tiêu rõ ràng để nhìn vào', value: 'Có mục tiêu rõ ràng để nhìn vào' }, { label: 'Chưa từng làm được', value: 'Chưa từng làm được' }],
  });
}

async function askOptions(user, a, logs, answer, extra) {
  const s = user.session;
  const g = growFacts(a, { targetMonths: s.data.targetMonths });
  s.data.options = g.options.map((o) => o.weekly);
  await step(user, a, logs, {
    step: 'O', intent: 'GROW Options: ghi nhận nguồn lực vừa nêu, trình bày ba phương án do engine tính, hỏi phương án chắc chắn làm được cả khi tuần bận', userAnswer: answer, extra,
    question: 'Mức nào anh chắc chắn làm được, kể cả vào một tuần bận rộn?',
    factIds: ['o1_weekly', 'o1_months', 'o2_weekly', 'o2_months', 'o3_weekly', 'o3_months', ...(s.data.prevScore != null ? ['s_prev_score', 's_score'] : [])], extraFacts: g.facts,
    template: (s.data.prevScore != null && s.data.score != null ? (s.data.score > s.data.prevScore ? 'Anh đã đi từ {{s_prev_score}} lên {{s_score}}, đó là tiến bộ thật. ' : 'Điểm hiện tại là {{s_score}}, so với {{s_prev_score}} lần trước. ') : '') + (s.data.relapse ? 'Lần này mình chọn mức chắc tay hơn để không lặp lại chuyện cũ.' : 'Đó là nguồn lực đáng dùng lại.') + ' Engine đã tính ba mức: {{o1_weekly}} mỗi tuần thì đủ sau {{o1_months}}; {{o2_weekly}} thì sau {{o2_months}}; {{o3_weekly}} thì sau {{o3_months}}. Mức nào anh chắc chắn làm được, kể cả vào một tuần bận rộn?',
    chips: g.options.map((o, i) => ({ label: `Phương án ${i + 1}: ${vnd(o.weekly)}/tuần`, value: String(o.weekly) })),
  });
}

// ----- WOOP -----
function willFacts(user, a) {
  const s = user.session;
  const g = growFacts(a, { targetMonths: s.data.targetMonths, weekly: s.data.weekly });
  s.data.dueDate = s.data.dueDate || addDays(user.simDate, 7);
  return [...g.facts, fact('w_due', { label: 'Hạn cam kết tuần này', value: fmtDate(s.data.dueDate), unit: 'text', formula: 'Hôm nay + 7 ngày', source: 'Phiên coaching', asOf: fmtDate(user.simDate) })];
}

async function askOutcome(user, a, logs, answer) {
  await step(user, a, logs, {
    step: 'WO1', intent: 'WOOP Wish + Outcome: biến lựa chọn thành điều ước tuần này, mời người dùng hình dung cảm nhận tốt nhất khi làm xong', userAnswer: answer,
    question: 'Điều tốt đẹp nhất anh cảm nhận được lúc đó là gì?',
    factIds: ['w_weekly'], extraFacts: willFacts(user, a),
    template: 'Hình dung tối chủ nhật này anh đã chuyển xong {{w_weekly}} vào quỹ. Điều tốt đẹp nhất anh cảm nhận được lúc đó là gì?',
    chips: [{ label: 'Yên tâm hơn', value: 'Yên tâm hơn' }, { label: 'Tự hào vì giữ lời', value: 'Tự hào vì giữ lời' }, { label: 'Bớt lo khi có biến cố', value: 'Bớt lo khi có biến cố' }],
  });
}

async function askObstacle(user, a, logs, answer, extra) {
  await step(user, a, logs, {
    step: 'WO2', intent: 'WOOP Obstacle: hỏi trở ngại NỘI TẠI (thói quen, cảm xúc, suy nghĩ), không phải hoàn cảnh bên ngoài', userAnswer: answer, extra,
    question: 'Điều gì bên trong anh, một thói quen, cảm xúc hay suy nghĩ, nhiều khả năng sẽ cản anh làm việc này?',
    factIds: ['s_outcome'],
    template: 'Cảm giác "{{s_outcome}}" là thứ đáng để giữ. Giờ thành thật với chính mình nhé: điều gì bên trong anh, một thói quen, cảm xúc hay suy nghĩ, nhiều khả năng sẽ cản anh làm việc này?',
    chips: Object.keys(OBSTACLE_PLANS).map((k) => ({ label: k, value: k })),
  });
}

async function askPlan(user, a, logs, answer, extra) {
  const s = user.session;
  const sug = OBSTACLE_PLANS[s.data.obstacle] || ['Nếu trở ngại đó xuất hiện, thì tôi sẽ chuyển tiền vào quỹ ngay lúc đó'];
  await step(user, a, logs, {
    step: 'WP', intent: 'WOOP Plan: mời người dùng tự viết kế hoạch dạng "Nếu… thì tôi sẽ…" cho đúng trở ngại vừa nêu', userAnswer: answer, extra,
    question: 'Anh hoàn thành giúp mình câu: "Nếu … thì tôi sẽ …"?',
    factIds: ['s_obstacle'],
    template: 'Mình biến trở ngại "{{s_obstacle}}" thành một kế hoạch cụ thể nhé. Anh hoàn thành giúp mình câu: "Nếu … thì tôi sẽ …"? Có thể chọn gợi ý bên dưới hoặc tự viết.',
    chips: sug.map((x) => ({ label: x, value: x })),
  });
}

async function askConfidence(user, a, logs, answer) {
  await step(user, a, logs, {
    step: 'WC', intent: 'Thước đo tự tin trước khi chốt: hỏi người dùng tự tin bao nhiêu sẽ làm đúng kế hoạch', userAnswer: answer,
    question: 'Anh tự tin bao nhiêu là sẽ làm đúng kế hoạch này trong tuần?',
    factIds: ['s_ifthen'],
    template: 'Kế hoạch của anh: "{{s_ifthen}}". Trên thang {{k_scale}}, anh tự tin bao nhiêu là sẽ làm đúng kế hoạch này trong tuần?',
    chips: scoreChips(),
  });
}

async function proposeWill(user, a, logs, answer) {
  const s = user.session;
  const d = s.data;
  const parts = [];
  if (d.lowered) parts.push('Mức tự tin {{s_conf}} cho thấy kế hoạch còn hơi căng, nên mình hạ xuống {{w_weekly}} mỗi tuần cho chắc tay.');
  if (d.knowhow) parts.push('Anh từng làm được nhờ "{{s_knowhow}}", đó là điểm mạnh của anh.');
  parts.push('Cam kết tuần này: chuyển {{w_weekly}} vào quỹ dự phòng trước {{w_due}}');
  if (d.ifThen) parts[parts.length - 1] += ', kèm kế hoạch "{{s_ifthen}}".'; else parts[parts.length - 1] += '.';
  parts.push('Giữ đều mức này, quỹ đạt mục tiêu sau {{w_months}}. Anh chốt cam kết này chứ?');
  await step(user, a, logs, {
    step: 'W', intent: 'GROW Will / OSKAR Affirm + Action: khẳng định điểm mạnh người dùng đã nêu, chốt hành động cụ thể có hạn và kế hoạch nếu-thì', userAnswer: answer,
    question: 'Anh chốt cam kết này chứ?',
    factIds: ['w_weekly', 'w_due', 'w_months', ...(d.knowhow ? ['s_knowhow'] : []), ...(d.ifThen ? ['s_ifthen'] : []), ...(d.lowered ? ['s_conf'] : [])],
    extraFacts: willFacts(user, a),
    template: parts.join(' '),
    chips: [{ label: 'Tôi cam kết', value: 'commit' }, { label: 'Giảm mức một chút', value: 'lower' }],
  });
}

async function commit(user, a, logs) {
  const s = user.session;
  const d = s.data;
  const c = {
    id: uid('c'),
    text: `Để riêng ${vnd(d.weekly)} vào quỹ dự phòng trước ${fmtDate(d.dueDate)}`,
    amount: d.weekly,
    createdAt: user.simDate,
    dueDate: d.dueDate,
    status: 'open',
    goal: `Quỹ dự phòng ${d.targetMonths} tháng`,
    targetMonths: d.targetMonths,
    sessionId: s.id,
    score: d.score ?? null,
    confidence: d.confidence ?? null,
    knowhow: d.knowhow || null,
    outcome: d.outcome || null,
    obstacle: d.obstacle || null,
    ifThen: d.ifThen || null,
    stage: d.stage || null,
  };
  user.commitments.unshift(c);
  const remindAt = addDays(c.dueDate, -1);
  user.reminders.unshift({ id: uid('r'), date: remindAt, text: `Nhắc cam kết: ${c.text}`, commitmentId: c.id, fired: false });
  const goalName = `Quỹ dự phòng ${d.targetMonths} tháng`;
  if (!user.goals.find((g) => g.name === goalName)) {
    user.goals.unshift({ id: uid('g'), name: goalName, kind: 'emergency', targetMonths: d.targetMonths, createdAt: user.simDate });
  }
  user.sessions.unshift({ id: s.id, topic: s.topic, startedAt: s.startedAt, endedAt: user.simDate, targetMonths: d.targetMonths, stage: d.stage, score: d.score, confidence: d.confidence, reality: d.obstacle, commitmentId: c.id });
  const extraFacts = [
    ...commitmentFacts(user, c),
    fact('r_date', { label: 'Ngày nhắc', value: fmtDate(remindAt), unit: 'text', formula: 'Hạn cam kết − 1 ngày', source: 'Lịch nhắc', asOf: fmtDate(user.simDate) }),
  ];
  await step(user, a, logs, {
    step: 'DONE', intent: 'Xác nhận đã ghi cam kết, nói rõ agent sẽ nhắc và đầu phiên sau sẽ cùng nhìn lại (Review)',
    factIds: ['c_text', 'r_date', 'c_due'], extraFacts, input: false,
    template: 'Đã ghi cam kết: "{{c_text}}". Mình sẽ nhắc anh vào {{r_date}}. Đầu phiên sau, mình sẽ cùng anh nhìn lại: đã làm được gì, trở ngại có xuất hiện không, và điểm trên thang đã thay đổi ra sao.',
  });
  user.session = null;
}

// ----- OSKAR Review đầu phiên sau -----
async function reviewDone(user, a, logs, c) {
  await step(user, a, logs, {
    step: 'RVD', intent: 'OSKAR Review: ghi nhận cụ thể việc đã làm bằng số engine, hỏi điều gì đã giúp làm được (củng cố know-how), không khen chung chung',
    question: 'Điều gì đã giúp anh làm được lần này?',
    factIds: ['c_text', 'ef_balance', 'ef_months'], extraFacts: prevCommitFacts(user, c),
    template: 'Anh đã giữ lời "{{c_text}}": quỹ giờ là {{ef_balance}}, đủ {{ef_months}} chi tiêu. Điều gì đã giúp anh làm được lần này?',
    chips: [{ label: 'Kế hoạch nếu-thì đã phát huy', value: 'Kế hoạch nếu-thì đã phát huy' }, { label: 'Chuyển ngay khi có lương', value: 'Chuyển ngay khi có lương' }, { label: 'Được nhắc đúng lúc', value: 'Được nhắc đúng lúc' }],
  });
}

async function reviewMissed(user, a, logs, c) {
  const has = Boolean(c.ifThen);
  await step(user, a, logs, {
    step: 'RVM', intent: 'OSKAR Review + WOOP chống tái phát: nhìn thẳng vào cam kết chưa làm, không trách móc, đối chiếu với trở ngại và kế hoạch nếu-thì đã lường trước, hỏi chuyện gì thực sự xảy ra',
    question: has ? 'Thực tế chuyện gì đã xảy ra?' : 'Điều gì đã cản trở anh?',
    factIds: has ? ['c_text', 'c_obstacle', 'c_ifthen', 'v_count'] : ['c_text', 'v_count'], extraFacts: prevCommitFacts(user, c),
    template: has
      ? 'Mình nhìn thẳng vào chuyện này để lần sau khác đi: cam kết "{{c_text}}" chưa hoàn thành, hồ sơ hiện ghi {{v_count}} chưa giữ cam kết. Lần trước mình đã lường trước trở ngại "{{c_obstacle}}" với kế hoạch "{{c_ifthen}}". Thực tế chuyện gì đã xảy ra?'
      : 'Mình ghi nhận thẳng thắn: cam kết "{{c_text}}" chưa hoàn thành; hồ sơ hiện ghi {{v_count}} chưa giữ cam kết. Mình không trách, nhưng cần hiểu rõ để kế hoạch sau thực tế hơn. Điều gì đã cản trở anh?',
    chips: has
      ? [{ label: 'Đúng trở ngại đó xuất hiện', value: 'Đúng trở ngại đó xuất hiện' }, { label: 'Gặp một trở ngại khác', value: 'Gặp một trở ngại khác' }, { label: 'Kế hoạch nếu-thì không được kích hoạt', value: 'Kế hoạch nếu-thì không được kích hoạt' }]
      : [{ label: 'Có khoản chi bất ngờ', value: 'Có khoản chi bất ngờ' }, { label: 'Quên mất', value: 'Quên mất' }, { label: 'Số tiền quá sức', value: 'Số tiền quá sức' }],
  });
}

async function okMessage(user, a, logs) {
  const asOf = fmtDate(a.snap.asOf);
  const next = a.fin.goals.find((g) => g.progressPct < 100);
  const efPart = 'Quỹ dự phòng của anh đủ {{ef_months}} chi tiêu, đã vượt mức khuyến nghị {{ef_target}}, nên đây không còn là việc gấp.';
  const extraFacts = [fact('ef_target', { label: 'Mức quỹ dự phòng khuyến nghị', value: THRESHOLDS.emergencyTargetMonths, unit: 'months', formula: 'Ngưỡng cấu hình của agent', source: 'Cấu hình Valo Agent', asOf })];
  let o;
  if (next) {
    extraFacts.push(fact('next_goal', { label: 'Mục tiêu kế tiếp', value: next.name, unit: 'text', formula: 'Mục tiêu đầu tiên chưa đạt đủ tiền', source: a.snap.meta.label, asOf }));
    o = {
      intent: 'Quỹ dự phòng đã đủ: ghi nhận, rồi chuyển sang mục tiêu kế tiếp chưa xong, gợi ý một công cụ cụ thể',
      factIds: ['ef_months', 'ef_target', 'next_goal', `goal_${next.id}_progress`, `goal_${next.id}_months`],
      template: `${efPart} Việc đáng bàn tiếp là "{{next_goal}}": đã đạt {{goal_${next.id}_progress}}, còn khoảng {{goal_${next.id}_months}} nếu giữ mức góp hiện tại. Anh muốn thử xem góp thêm mỗi tháng thì về đích sớm bao nhiêu không?`,
      chips: [{ label: 'Mô phỏng góp thêm cho mục tiêu này', value: 'tool:what_if' }, { label: 'Mô phỏng sốc mất việc', value: 'tool:shock_job_loss' }, { label: 'Tạo mục tiêu mới', value: 'ui:tools' }],
    };
  } else if (a.factMap.retire_gap?.value > 0) {
    o = {
      intent: 'Quỹ dự phòng và các mục tiêu hiện có đều đã đủ: ghi nhận, rồi chỉ ra khoảng trống hưu trí là việc lớn tiếp theo, hỏi người dùng muốn đi hướng nào',
      factIds: ['ef_months', 'ef_target', 'age_planned', 'age_legal', 'retire_gap'],
      template: `${efPart} Các mục tiêu hiện có cũng đã đủ tiền. Điểm còn hở lớn nhất là giai đoạn từ tuổi nghỉ dự định {{age_planned}} tới tuổi hưởng lương hưu {{age_legal}}: anh cần tự lo khoảng {{retire_gap}}. Anh muốn bắt đầu chuẩn bị cho khoảng này, hay đặt một mục tiêu mới?`,
      chips: [{ label: 'Xem trợ lý BHXH', value: 'ui:bhxh' }, { label: 'Tạo mục tiêu mới', value: 'ui:tools' }],
    };
  } else {
    o = {
      intent: 'Mọi mục tiêu đã đủ: ghi nhận cụ thể, mời đặt mục tiêu mới',
      factIds: ['ef_months', 'ef_target'],
      template: `${efPart} Các mục tiêu hiện có cũng đã đủ tiền. Điều gì anh muốn hướng tới tiếp theo?`,
      chips: [{ label: 'Tạo mục tiêu mới', value: 'ui:tools' }],
    };
  }
  await compose(user, a, { step: 'OK', extraFacts, ...o }, logs);
}

const CORE_FACTS = ['ef_balance', 'ef_months', 'ef_threshold', 'monthly_expense', 'monthly_income', 'monthly_surplus', 'net_worth', 'goal_main_progress', 'goal_main_months', 'bhxh_hist_months', 'bhxh_gap_count', 'bhxh_pension', 'age_legal', 'age_planned', 'retire_gap'];

const isQuestion = (t) => /\?\s*$|là sao|nghĩa là gì|là gì|tại sao|vì sao|sao vậy|chưa hiểu|không hiểu|giải thích|khó hiểu|ý là/i.test(t);

const STEP_HELP = {
  ST: 'Mình hỏi câu này để biết nên đi nhanh hay chậm. Không có đáp án đúng sai: nếu anh còn lưỡng lự, mình sẽ không ép đặt mục tiêu.',
  G: 'Quỹ dự phòng là khoản để riêng cho biến cố như mất việc hay ốm đau. Mức tối thiểu nên có là {{ef_threshold}} chi tiêu.',
  S: 'Đây là thang tự chấm, không có đúng sai: thấp nhất là chưa có gì, cao nhất là quỹ đã đủ như anh muốn. Điểm này giúp đo tiến bộ của anh qua từng phiên.',
  K: 'Mình hỏi để tìm cách đã từng hiệu quả với chính anh, thay vì áp một cách chung chung.',
  O: 'Đây là ba mức để riêng mỗi tuần, engine đã tính sẵn bao lâu thì đủ quỹ. Hãy chọn mức anh chắc làm được, không cần chọn mức cao nhất.',
  WO1: 'Hình dung trước cảm giác khi làm xong giúp anh có động lực thật lúc phải bắt tay vào làm.',
  WO2: 'Trở ngại nội tại là thứ đến từ chính mình như quên, ngại, tiếc tiền, khác với hoàn cảnh bên ngoài. Biết trước thì mới lên được kế hoạch đối phó.',
  WP: 'Kế hoạch nếu-thì gắn một tình huống cụ thể với một hành động cụ thể, để khi trở ngại xuất hiện anh không phải nghĩ lại từ đầu.',
  WC: 'Thang tự tin giúp kiểm tra kế hoạch có vừa sức không. Nếu tự tin còn thấp, mình sẽ hạ số tiền xuống cho chắc tay.',
  W: 'Đây là cam kết cụ thể cho tuần này. Bấm "Tôi cam kết" để mình ghi lại và nhắc anh, hoặc "Giảm mức một chút" nếu thấy căng.',
};

/** Câu hỏi ngoài luồng: trả lời thật bằng fact, rồi gợi ý bước tiếp theo cụ thể. */
async function answerFreeform(user, a, logs, text) {
  const last = [...user.chat].reverse().find((m) => m.role === 'agent');
  const plain = last ? last.segments.map((x) => (x.t === 'text' ? x.v : (last.facts.find((f) => f.id === x.id) || a.factMap[x.id] || {}).display || '')).join('') : '';
  const factIds = CORE_FACTS.filter((id) => a.factMap[id]);
  const efLow = a.fin.ef.months < THRESHOLDS.emergencyTargetMonths;
  await compose(user, a, {
    step: 'QA', userAnswer: text,
    intent: 'Người dùng hỏi ngoài luồng hoặc chưa hiểu tin trước. Trả lời thẳng câu hỏi bằng lời đơn giản, giải thích ý nghĩa các con số liên quan, rồi gợi ý một bước tiếp theo cụ thể',
    extra: plain ? `Tin nhắn trước của coach: "${plain.slice(0, 600)}"` : undefined,
    question: 'Anh muốn mình đi tiếp vào việc nào?',
    factIds,
    template: 'Mình nói rõ hơn nhé. Các con số có nền màu là do engine tính từ dữ liệu của anh, rê chuột vào để xem công thức. Tình hình hiện tại: quỹ dự phòng đủ {{ef_months}} chi tiêu, mỗi tháng anh dư {{monthly_surplus}} sau chi tiêu, mục tiêu chính đạt {{goal_main_progress}}. Anh muốn mình đi tiếp vào việc nào?',
    chips: [
      ...(efLow ? [{ label: 'Lên kế hoạch quỹ dự phòng', value: 'start' }] : [{ label: 'Xem việc nên làm tiếp', value: 'start' }]),
      { label: 'Mô phỏng góp thêm cho mục tiêu', value: 'tool:what_if' },
      { label: 'Xem trợ lý BHXH', value: 'ui:bhxh' },
    ],
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
  const c = reviewTarget(user);
  if (c) {
    newSession(user, { commitmentId: c.id, targetMonths: c.targetMonths || 3, prevScore: c.score ?? null, knowhow: c.knowhow || null, stage: c.stage || 'action', review: true });
    if (c.status === 'open') {
      await step(user, a, logs, {
        step: 'RV1', intent: 'OSKAR Review, trách nhiệm giải trình: mở phiên bằng việc nhìn lại cam kết cũ, hỏi thẳng đã làm chưa, không khen suông',
        question: 'Anh đã làm được chưa?',
        factIds: ['c_text', 'c_due'], extraFacts: prevCommitFacts(user, c),
        template: 'Mình bắt đầu bằng phần nhìn lại. Lần trước anh cam kết "{{c_text}}", hạn {{c_due}}, và mình chưa thấy anh xác nhận. Anh đã làm được chưa?',
        chips: [{ label: 'Đã làm rồi', value: 'done' }, { label: 'Chưa làm được', value: 'missed' }],
      });
    } else if (c.status === 'done') {
      await reviewDone(user, a, logs, c);
    } else {
      await reviewMissed(user, a, logs, c);
    }
  } else if (a.fin.ef.months < THRESHOLDS.emergencyTargetMonths) {
    await askStage(user, a, logs);
  } else {
    await okMessage(user, a, logs);
  }
  logs.push({ agent: 'Agent chính', action: 'start', step: user.session?.step || 'none' });
  pushTrace(user, logs);
  save();
}

function parseMonths(text, value) {
  const n = Number(value ?? (String(text).match(/\d+/) || [])[0]);
  return n > 0 && n <= 24 ? n : 3;
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

const lower = (w) => Math.max(200000, Math.round((w * 0.6) / 100000) * 100000);

export async function reply(user, { text = '', value }) {
  const logs = [];
  const answer = String(value ?? text).trim();
  if (text || value) userMsg(user, text || answer);
  let { a, logs: pl } = await pipeline(user);
  logs.push(...pl);
  const s = user.session;
  if (!s) {
    if (value === undefined || value === null || value === '') {
      await answerFreeform(user, a, logs, answer);
      logs.push({ agent: 'Agent chính', action: 'freeform' });
      pushTrace(user, logs);
      save();
      return;
    }
    pushTrace(user, logs);
    await startSession(user);
    return;
  }
  const d = s.data;
  if ((value === undefined || value === null || value === '') && isQuestion(answer) && s.lastQuestion) {
    // Người dùng hỏi lại trong phiên: giải thích bước hiện tại rồi hỏi lại đúng câu đó
    const help = STEP_HELP[s.step] || 'Mình hỏi để hiểu anh hơn, anh cứ trả lời theo cảm nhận thật là được.';
    await compose(user, a, {
      step: s.step, userAnswer: answer, input: true,
      intent: `Người dùng chưa hiểu câu hỏi ở bước ${s.step}. Giải thích ngắn vì sao hỏi và nên trả lời thế nào, rồi hỏi lại đúng ý câu cũ`,
      question: s.lastQuestion,
      factIds: ['ef_threshold', 'k_scale'], extraFacts: sessionFacts(user, s),
      template: `${help} ${s.lastQuestion}`,
      chips: s.lastChips || [],
    }, logs);
    pushTrace(user, logs);
    save();
    return;
  }
  const reask = async () => {
    // câu trả lời không đọc được điểm: hỏi lại đúng bước hiện tại
    await compose(user, a, { step: s.step, intent: 'Người dùng chưa chấm điểm rõ, nhờ chọn một mức trên thang', question: 'Anh chọn giúp mình một mức nhé?', extraFacts: sessionFacts(user, s), factIds: ['k_scale'], template: 'Mình chưa đọc được mức điểm. Anh chọn giúp mình một mức trên thang {{k_scale}} nhé?', chips: scoreChips(), input: true }, logs);
  };
  switch (s.step) {
    case 'RV1': {
      const c = user.commitments.find((x) => x.id === d.commitmentId);
      const done = value === 'done' || (/(rồi|xong|đã làm)/i.test(answer) && !/chưa/i.test(answer));
      if (done) {
        c.status = 'done';
        c.doneAt = user.simDate;
        user.overrides.emergencyFund = a.snap.emergencyFundBalance + c.amount;
        ({ a } = await pipeline(user));
        await reviewDone(user, a, logs, c);
        await evaluateEvents(user, a, logs);
      } else {
        c.status = 'missed';
        user.violations.unshift({ id: uid('v'), commitmentId: c.id, date: user.simDate, reason: null, text: c.text });
        await reviewMissed(user, a, logs, c);
      }
      break;
    }
    case 'RVD': {
      const c = user.commitments.find((x) => x.id === d.commitmentId);
      c.reviewed = true;
      c.reviewNote = answer;
      d.knowhow = answer;
      if (a.fin.ef.months >= THRESHOLDS.emergencyTargetMonths) {
        user.session = null;
        await okMessage(user, a, logs);
      } else {
        await askScaling(user, a, logs, answer);
      }
      break;
    }
    case 'RVM': {
      const c = user.commitments.find((x) => x.id === d.commitmentId);
      c.reviewed = true;
      if (c.status === 'open') { c.status = 'missed'; user.violations.unshift({ id: uid('v'), commitmentId: c.id, date: user.simDate, reason: null, text: c.text }); }
      const v = user.violations.find((x) => x.commitmentId === c.id);
      if (v) v.reason = answer;
      d.relapse = answer;
      await askScaling(user, a, logs, answer);
      break;
    }
    case 'ST':
      d.stage = parseStage(answer, value);
      if (d.stage === 'pre' || d.stage === 'contemplation') await askMI1(user, a, logs, answer);
      else await askGoal(user, a, logs, `Người dùng ở giai đoạn ${stageName(d.stage)}`);
      break;
    case 'MI1':
      d.discrepancy = answer;
      await askMI2(user, a, logs, answer);
      break;
    case 'MI2':
      d.hesitation = answer;
      await askMI3(user, a, logs, answer);
      break;
    case 'MI3': {
      const n = parseScore(answer, value);
      if (n === null) { await reask(); break; }
      d.importance = n;
      if (n >= 6) {
        await step(user, a, logs, {
          step: 'MI4', intent: 'MI: phản chiếu mức quan trọng người dùng vừa chấm, hỏi xin phép thử một bước nhỏ, để người dùng tự quyết', userAnswer: answer,
          question: 'Anh có muốn thử một bước nhỏ, vừa sức, ngay tuần này không?',
          factIds: ['s_importance'],
          template: 'Mức {{s_importance}} cho thấy chuyện này thật sự có ý nghĩa với anh. Anh có muốn thử một bước nhỏ, vừa sức, ngay tuần này không?',
          chips: [{ label: 'Thử một bước nhỏ', value: 'yes' }, { label: 'Để tôi nghĩ thêm', value: 'no' }],
        });
      } else {
        await endMI(user, a, logs, answer);
      }
      break;
    }
    case 'MI4':
      if (value === 'yes' || (/(thử|được|ok|có)/i.test(answer) && !/(nghĩ thêm|chưa|không)/i.test(answer))) {
        d.stage = 'preparation';
        await askGoal(user, a, logs, 'Người dùng vừa chuyển từ lưỡng lự sang sẵn sàng thử bước nhỏ; giữ mục tiêu khiêm tốn');
      } else {
        await endMI(user, a, logs, answer);
      }
      break;
    case 'G':
      d.targetMonths = parseMonths(answer, value);
      d.goalText = answer;
      await askScaling(user, a, logs, answer);
      break;
    case 'S': {
      const n = parseScore(answer, value);
      if (n === null) { await reask(); break; }
      d.score = n;
      if (d.knowhow) await askOptions(user, a, logs, answer, d.relapse ? `Phiên trước chưa giữ cam kết vì: "${d.relapse}". Nên chọn mức vừa sức hơn.` : undefined);
      else await askKnowhow(user, a, logs, answer);
      break;
    }
    case 'K':
      d.knowhow = answer;
      await askOptions(user, a, logs, answer);
      break;
    case 'O': {
      const opts = d.options || [];
      const idx = answer.match(/^\s*([1-3])\s*$/) || answer.match(/(?:phương án|phuong an|mức|muc|pa)\s*([1-3])\b/i);
      d.weekly = idx ? opts[Number(idx[1]) - 1] : parseMoney(answer) || opts[0];
      await askOutcome(user, a, logs, answer);
      break;
    }
    case 'WO1':
      d.outcome = answer;
      await askObstacle(user, a, logs, answer, d.relapse ? `Lần trước trở ngại là "${d.relapse}"` : undefined);
      break;
    case 'WO2':
      d.obstacle = answer;
      await askPlan(user, a, logs, answer, d.relapse ? 'Kế hoạch mới cần khác kế hoạch lần trước' : undefined);
      break;
    case 'WP':
      d.ifThen = /^nếu/i.test(answer) ? answer : `Nếu ${d.obstacle.toLowerCase()}, thì tôi sẽ ${answer}`;
      await askConfidence(user, a, logs, answer);
      break;
    case 'WC': {
      const n = parseScore(answer, value);
      if (n === null) { await reask(); break; }
      d.confidence = n;
      if (n < 7 && d.weekly > 200000) { d.weekly = lower(d.weekly); d.lowered = true; }
      await proposeWill(user, a, logs, answer);
      break;
    }
    case 'W': {
      const yes = value === 'commit' || /(cam kết|đồng ý|ok|chốt|được)/i.test(answer);
      const low = value === 'lower' || /(giảm|ít hơn|thấp hơn)/i.test(answer);
      if (low) { d.weekly = lower(d.weekly); d.lowered = false; await proposeWill(user, a, logs, answer); }
      else if (yes) await commit(user, a, logs);
      else { const m = parseMoney(answer); if (m) d.weekly = m; await proposeWill(user, a, logs, answer); }
      break;
    }
    default:
      user.session = null;
      await startSession(user);
      return;
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
  if (['data-change', 'dataset-change', 'valo-import'].includes(reason)) await announceNewData(user, a, logs, reason);
  user.lastDigest = digest(a);
  const before = user.chat.length;
  await evaluateEvents(user, a, logs, { reason });
  await maybeSummary(user, a, logs);
  await resumeAfterDataChange(user, a, logs, before);
  pushTrace(user, logs);
  save();
}

const DIGEST_NAME = { ef_balance: 'số dư quỹ dự phòng', ef_months: 'quỹ dự phòng đủ dùng', monthly_income: 'thu nhập ròng tháng', monthly_expense: 'chi tiêu trung bình tháng', spend_last: 'chi tiêu tháng gần nhất', net_worth: 'tài sản ròng', bhxh_hist_months: 'thời gian đã đóng BHXH', bhxh_gap_count: 'số tháng BHXH ngắt quãng', bhxh_pension: 'lương hưu dự kiến' };
const DIGEST_IDS = ['ef_balance', 'ef_months', 'monthly_income', 'monthly_expense', 'spend_last', 'net_worth', 'bhxh_hist_months', 'bhxh_gap_count', 'bhxh_pension'];
function digest(a) {
  const out = { source: a.snap.meta.label, values: {} };
  for (const id of DIGEST_IDS) if (a.factMap[id]) out.values[id] = { value: a.factMap[id].value, unit: a.factMap[id].unit, label: a.factMap[id].label };
  return out;
}

/** Dữ liệu mới vào: Agent chính chủ động báo đã nhận gì và con số nào đổi (cũ → mới), trước khi xét cảnh báo. */
async function announceNewData(user, a, logs, reason) {
  const prev = user.lastDigest;
  const asOf = fmtDate(a.snap.asOf);
  const extraFacts = [fact('d_source', { label: 'Nguồn dữ liệu', value: a.snap.meta.label, unit: 'text', formula: 'Adapter đang dùng', source: a.snap.meta.label, asOf })];
  const rec = { accounts: a.snap.accounts.length, spending: a.snap.monthlySpending.length, bhxh: a.snap.socialInsurance.periods.length, goals: a.snap.goals.length };
  const recLabel = { accounts: 'Số tài khoản', spending: 'Số tháng chi tiêu', bhxh: 'Số giai đoạn đóng BHXH', goals: 'Số mục tiêu' };
  for (const [k, v] of Object.entries(rec)) extraFacts.push(fact(`d_rec_${k}`, { label: recLabel[k], value: v, unit: 'count', formula: 'Đếm bản ghi Agent Thu thập đọc được', source: a.snap.meta.label, asOf }));
  const changes = [];
  for (const id of DIGEST_IDS) {
    const now = a.factMap[id];
    const old = prev?.values?.[id];
    if (!now || !old || old.value === now.value) continue;
    if (now.unit === 'months' && Math.abs(old.value - now.value) < 0.05) continue;
    extraFacts.push(fact(`d_old_${id}`, { label: `${now.label} (trước khi cập nhật)`, value: old.value, unit: old.unit, formula: 'Giá trị ở lần tính trước', source: prev.source, asOf }));
    changes.push(`${DIGEST_NAME[id]} từ {{d_old_${id}}} thành {{${id}}}`);
  }
  const factIds = changes.flatMap((c) => [...c.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).filter((id) => a.factMap[id]);
  const sourceChanged = prev && prev.source !== a.snap.meta.label;
  const head = reason === 'valo-import' ? 'Mình vừa nhận dữ liệu mới anh nhập từ Valo' : sourceChanged ? 'Mình vừa chuyển sang nguồn dữ liệu mới' : 'Mình vừa nhận dữ liệu anh cập nhật';
  const read = 'Agent Thu thập đọc được {{d_rec_accounts}} tài khoản, {{d_rec_spending}} tháng chi tiêu, {{d_rec_bhxh}} giai đoạn đóng BHXH và {{d_rec_goals}} mục tiêu.';
  const body = changes.length
    ? ` Con số thay đổi: ${changes.slice(0, 6).join('; ')}.`
    : prev ? ' Các con số chính không đổi so với lần tính trước.' : '';
  await compose(user, a, {
    kind: 'alert', step: 'data_received',
    intent: 'Chủ động báo người dùng đã nhận dữ liệu mới: nguồn nào, đọc được gì, con số chính nào thay đổi từ bao nhiêu thành bao nhiêu; ngắn gọn, không khuyên',
    factIds, extraFacts,
    template: `${head} ({{d_source}}). ${read}${body} Mọi số liệu đã được tính lại theo dữ liệu này.`,
  }, logs);
  logs.push({ agent: 'Agent chính', action: 'data-received', reason, changes: changes.length });
}

/** Đang coach dở mà dữ liệu đổi: báo rõ số đã tính lại, rồi hỏi lại đúng câu đang dở để phiên không bị đứt. */
async function resumeAfterDataChange(user, a, logs, before) {
  const s = user.session;
  if (!s || !s.lastQuestion) return;
  const reached = Boolean(s.data.targetMonths && a.fin.ef.months >= s.data.targetMonths);
  const newlyReached = reached && !s.reachedNoted;
  if (user.chat.length === before && !newlyReached) return;
  if (reached) s.reachedNoted = true;
  const asOf = fmtDate(a.snap.asOf);
  const extraFacts = [...sessionFacts(user, s)];
  if (s.data.targetMonths) extraFacts.push(fact('s_target_months', { label: 'Mục tiêu quỹ trong phiên', value: s.data.targetMonths, unit: 'months', formula: 'Người dùng chọn ở bước Mục tiêu', source: 'Phiên coaching', asOf }));
  const tail = reached
    ? 'Theo dữ liệu mới, quỹ đã đủ {{ef_months}} chi tiêu, chạm mục tiêu {{s_target_months}} anh đặt trong phiên. Anh có thể chốt phiên ở mức nhỏ để giữ thói quen, hoặc bấm "Bắt đầu / tiếp tục phiên" sau để bàn mục tiêu khác. '
    : 'Các con số ở bước tiếp theo sẽ tính theo dữ liệu mới. ';
  await compose(user, a, {
    step: s.step, input: true,
    intent: 'Dữ liệu vừa cập nhật giữa phiên coaching: báo ngắn rằng số đã được tính lại, rồi hỏi lại đúng câu đang dở',
    question: s.lastQuestion, factIds: ['ef_months'], extraFacts,
    template: `Dữ liệu vừa cập nhật, mình vẫn giữ phiên đang dở. ${tail}Mình hỏi lại câu lúc nãy nhé: ${s.lastQuestion}`,
    chips: s.lastChips || [],
  }, logs);
  logs.push({ agent: 'Agent chính', action: 'resume-after-data', step: s.step, reached: Boolean(reached) });
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
      session: user.session ? { step: user.session.step, topic: user.session.topic, stage: user.session.data?.stage || null } : null,
      readiness: user.readiness || null,
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
