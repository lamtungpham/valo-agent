// Nhánh CHƯA dùng Valo: hỏi 13 câu coaching có cấu trúc, mỗi câu lấp một ô mô hình tài chính.
// Bắt đầu từ điều khiến người dùng chưa yên tâm nhất, rồi mới tới con số. Mỗi tin chỉ một câu hỏi.
// Kết thúc: engine dựng "bản đồ tài chính" + hồ sơ tạm, mời nối Valo.
import { draft } from './coach.js';
import { verify } from './verifier.js';
import { fact, toMap } from '../engine/facts.js';
import { THRESHOLDS, monthsToReach } from '../engine/finance.js';
import { save, uid } from '../store.js';

export const QUESTIONS = [
  { slot: 'worry', type: 'text', q: 'Điều gì về tiền bạc đang khiến anh chưa yên tâm nhất lúc này?', chips: ['Không có khoản dự phòng', 'Nợ thẻ, nợ vay', 'Không biết tiền đi đâu hết', 'Lo chuyện về già'] },
  { slot: 'worry_impact', type: 'text', q: 'Nếu điều đó được giải quyết, cuộc sống của anh sẽ nhẹ nhõm hơn ở điểm nào?' },
  { slot: 'goal_name', type: 'text', q: 'Vậy mục tiêu tài chính quan trọng nhất của anh trong vài năm tới là gì?', chips: ['Mua nhà', 'Có quỹ dự phòng vững', 'Trả hết nợ', 'Mua xe'] },
  { slot: 'goal_amount', type: 'money', q: 'Mục tiêu đó cần khoảng bao nhiêu tiền? Anh cứ ước lượng.' },
  { slot: 'goal_years', type: 'number', q: 'Anh muốn đạt mục tiêu đó trong bao nhiêu năm?', chips: ['1', '3', '5', '10'] },
  { slot: 'income', type: 'money', q: 'Giờ mình nhìn vào dòng tiền: mỗi tháng anh thực nhận khoảng bao nhiêu?' },
  { slot: 'expense', type: 'money', q: 'Một tháng bình thường anh chi tiêu khoảng bao nhiêu, chưa tính trả nợ?' },
  { slot: 'debt', type: 'money', q: 'Hiện anh có khoản nợ nào không? Tổng dư nợ khoảng bao nhiêu (không có thì gõ 0)?', chips: ['0'] },
  { slot: 'debt_payment', type: 'money', q: 'Mỗi tháng anh trả nợ khoảng bao nhiêu?', skipIf: (a) => !a.debt },
  { slot: 'emergency', type: 'money', q: 'Anh có khoản tiền để riêng cho tình huống khẩn cấp không? Khoảng bao nhiêu?', chips: ['0'] },
  { slot: 'savings', type: 'money', q: 'Ngoài khoản đó, tiết kiệm và đầu tư khác của anh tổng cộng khoảng bao nhiêu?', chips: ['0'] },
  { slot: 'risk', type: 'choice', q: 'Nếu một khoản đầu tư của anh giảm mạnh trong một năm, anh sẽ làm gì?', chips: ['Bán ngay cho yên tâm', 'Giữ nguyên chờ hồi', 'Mua thêm khi giá rẻ'] },
  { slot: 'age', type: 'number', q: 'Câu cuối: năm nay anh bao nhiêu tuổi?' },
];

const RISK = { 'Bán ngay cho yên tâm': 'thận trọng', 'Giữ nguyên chờ hồi': 'cân bằng', 'Mua thêm khi giá rẻ': 'tăng trưởng' };

export function parseMoney(text) {
  const s = String(text).toLowerCase().replace(/\s/g, '');
  if (/^(không|ko|khong|0)$/.test(s)) return 0;
  const m = s.match(/(\d+(?:[.,]\d+)*)(tỷ|ty|triệu|tr|k|nghìn|ngàn)?/);
  if (!m) return null;
  const raw = m[1];
  let n = /[.,]\d{3}(\D|$)/.test(raw) ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'));
  const u = m[2];
  if (u === 'tỷ' || u === 'ty') n *= 1e9;
  else if (u === 'triệu' || u === 'tr') n *= 1e6;
  else if (u === 'k' || u === 'nghìn' || u === 'ngàn') n *= 1e3;
  else if (n > 0 && n < 1000) n *= 1e6; // "15" hiểu là 15 triệu
  return Math.round(n);
}

function parseAnswer(q, text) {
  if (q.type === 'money') return parseMoney(text);
  if (q.type === 'number') { const m = String(text).match(/\d+/); return m ? Number(m[0]) : null; }
  if (q.type === 'choice') return String(text).slice(0, 80);
  return String(text).trim().slice(0, 300);
}

function nextIndex(o, from) {
  let i = from;
  while (i < QUESTIONS.length && QUESTIONS[i].skipIf?.(o.answers)) i++;
  return i;
}

async function say(o, { intent, question, userAnswer, template, facts = [] }) {
  const factMap = toMap(facts);
  const d = await draft({ intent, question, factIds: facts.map((f) => f.id), factMap, userAnswer, template });
  const v = verify(d, factMap, { question, factIds: facts.map((f) => f.id) });
  o.messages.push({ id: uid('om'), role: 'agent', ...v });
}

export async function start(user) {
  user.onboarding = { active: true, idx: 0, answers: {}, messages: [], done: false, startedAt: user.simDate };
  const o = user.onboarding;
  await say(o, {
    intent: 'Mở đầu phiên làm quen cho người chưa dùng Valo: chào ngắn, nói sẽ hỏi từng câu một, bắt đầu từ nỗi lo chứ chưa hỏi số',
    question: QUESTIONS[0].q,
    template: `Chào anh, mình là Valo Agent. Mình sẽ hỏi từng câu một, bắt đầu từ điều anh đang bận lòng trước rồi mới tới con số. ${QUESTIONS[0].q}`,
  });
  save();
}

export async function answer(user, { text = '' }) {
  const o = user.onboarding;
  if (!o?.active || o.done) return;
  const q = QUESTIONS[o.idx];
  const val = parseAnswer(q, text);
  o.messages.push({ id: uid('om'), role: 'user', text: String(text).slice(0, 300) });
  if (val === null || val === '') {
    await say(o, { intent: 'Người dùng trả lời chưa rõ con số, nhờ nói lại nhẹ nhàng', question: q.q, template: `Mình chưa đọc được con số trong câu trả lời. ${q.q}` });
    save();
    return;
  }
  o.answers[q.slot] = val;
  o.idx = nextIndex(o, o.idx + 1);
  if (o.idx >= QUESTIONS.length) {
    o.done = true;
    o.profile = buildMap(o.answers, user.simDate);
    const f = o.profile.facts;
    await say(o, {
      intent: 'Kết thúc phiên làm quen: tóm tắt bản đồ tài chính bằng số engine, nhắc lại nỗi lo ban đầu, mời nối Valo để số liệu tự cập nhật',
      userAnswer: o.answers.worry,
      facts: f.filter((x) => ['ob_ef_months', 'ob_surplus', 'ob_goal_need', 'ob_goal_gap'].includes(x.id)),
      template: 'Cảm ơn anh. Bản đồ tài chính tạm đã sẵn sàng: quỹ khẩn cấp đủ {{ob_ef_months}}, mỗi tháng dư {{ob_surplus}}, mục tiêu cần để dành {{ob_goal_need}} mỗi tháng, chênh so với khả năng là {{ob_goal_gap}}. Đây mới là hồ sơ tạm từ lời khai; nối Valo để số liệu tự cập nhật nhé.',
    });
  } else {
    const nq = QUESTIONS[o.idx];
    await say(o, {
      intent: `Phiên làm quen, câu ${o.idx + 1}: ghi nhận ngắn câu trả lời vừa rồi (không nhắc lại con số) rồi hỏi câu tiếp theo`,
      question: nq.q, userAnswer: text,
      template: `${o.idx <= 2 ? 'Mình hiểu, cảm ơn anh đã chia sẻ.' : 'Mình ghi nhận.'} ${nq.q}`,
    });
  }
  save();
}

/** Engine dựng bản đồ tài chính từ lời khai (số xác định, không LLM). */
export function buildMap(a, simDate) {
  const asOf = simDate.split('-').reverse().join('/');
  const src = 'Lời khai trong phiên làm quen (hồ sơ tạm)';
  const income = a.income || 0;
  const expense = a.expense || 0;
  const debtPay = a.debt_payment || 0;
  const surplus = income - expense - debtPay;
  const efMonths = expense > 0 ? (a.emergency || 0) / expense : 0;
  const goalMonths = (a.goal_years || 1) * 12;
  const remaining = Math.max(0, (a.goal_amount || 0) - (a.savings || 0));
  const goalNeed = remaining / goalMonths;
  const atSurplus = monthsToReach(remaining, surplus);
  const F = (id, o) => fact(id, { source: src, asOf, ...o });
  const facts = [
    F('ob_income', { label: 'Thu nhập thực nhận/tháng', value: income, unit: 'vnd', formula: 'Lời khai' }),
    F('ob_expense', { label: 'Chi tiêu/tháng', value: expense, unit: 'vnd', formula: 'Lời khai' }),
    F('ob_debt_pay', { label: 'Trả nợ/tháng', value: debtPay, unit: 'vnd', formula: 'Lời khai' }),
    F('ob_surplus', { label: 'Dòng tiền dư/tháng', value: surplus, unit: 'vnd', formula: 'Thu nhập − chi tiêu − trả nợ', source: 'Engine' }),
    F('ob_saving_rate', { label: 'Tỷ lệ để dành', value: income ? (surplus / income) * 100 : 0, unit: 'percent', formula: 'Dòng tiền dư ÷ thu nhập × 100', source: 'Engine' }),
    F('ob_dti', { label: 'Tỷ lệ trả nợ trên thu nhập', value: income ? (debtPay / income) * 100 : 0, unit: 'percent', formula: 'Trả nợ tháng ÷ thu nhập × 100', source: 'Engine' }),
    F('ob_ef', { label: 'Quỹ khẩn cấp', value: a.emergency || 0, unit: 'vnd', formula: 'Lời khai' }),
    F('ob_ef_months', { label: 'Quỹ khẩn cấp đủ dùng', value: efMonths, unit: 'months', formula: 'Quỹ khẩn cấp ÷ chi tiêu tháng', source: 'Engine' }),
    F('ob_debt', { label: 'Tổng dư nợ', value: a.debt || 0, unit: 'vnd', formula: 'Lời khai' }),
    F('ob_assets', { label: 'Tài sản tài chính', value: (a.emergency || 0) + (a.savings || 0), unit: 'vnd', formula: 'Quỹ khẩn cấp + tiết kiệm, đầu tư', source: 'Engine' }),
    F('ob_net', { label: 'Tài sản ròng tài chính', value: (a.emergency || 0) + (a.savings || 0) - (a.debt || 0), unit: 'vnd', formula: 'Tài sản tài chính − dư nợ', source: 'Engine' }),
    F('ob_goal', { label: `Mục tiêu "${a.goal_name || 'chính'}"`, value: a.goal_amount || 0, unit: 'vnd', formula: 'Lời khai' }),
    F('ob_goal_need', { label: 'Cần để dành mỗi tháng cho mục tiêu', value: goalNeed, unit: 'vnd', formula: '(Mục tiêu − tiết kiệm hiện có) ÷ (số năm × 12)', source: 'Engine' }),
    F('ob_goal_gap', { label: 'Chênh giữa cần để dành và dòng tiền dư', value: goalNeed - surplus, unit: 'vnd', formula: 'Cần để dành − dòng tiền dư (âm là dư sức)', source: 'Engine' }),
    F('ob_goal_at_surplus', { label: 'Nếu dồn toàn bộ dòng tiền dư cho mục tiêu', value: Number.isFinite(atSurplus) ? atSurplus : null, unit: 'months', formula: 'Làm tròn lên (còn thiếu ÷ dòng tiền dư)', source: 'Engine' }),
    F('ob_risk', { label: 'Khẩu vị rủi ro', value: RISK[a.risk] || 'chưa rõ', unit: 'text', formula: 'Phân loại theo phản ứng khi đầu tư giảm mạnh', source: 'Engine (quy tắc)' }),
    F('ob_age', { label: 'Tuổi', value: a.age || null, unit: 'age', formula: 'Lời khai' }),
  ];
  const flags = [];
  if (efMonths < THRESHOLDS.emergencyMinMonths) flags.push({ level: 'high', text: 'Quỹ khẩn cấp dưới ngưỡng 3 tháng chi tiêu', factId: 'ob_ef_months' });
  if (surplus < 0) flags.push({ level: 'high', text: 'Chi nhiều hơn thu', factId: 'ob_surplus' });
  if (income && debtPay / income > 0.4) flags.push({ level: 'high', text: 'Trả nợ vượt 40% thu nhập', factId: 'ob_dti' });
  if (goalNeed > Math.max(0, surplus)) flags.push({ level: 'medium', text: 'Mục tiêu cần nhiều hơn dòng tiền dư hiện tại', factId: 'ob_goal_gap' });
  return {
    facts,
    flags,
    worry: a.worry,
    worryImpact: a.worry_impact,
    goalName: a.goal_name,
    flow: { income, expense, debtPay, surplus },
    balance: { emergency: a.emergency || 0, savings: a.savings || 0, debt: a.debt || 0 },
  };
}

export function view(user) {
  const o = user.onboarding;
  if (!o) return { active: false, total: QUESTIONS.length, messages: [] };
  const q = o.done ? null : QUESTIONS[o.idx];
  return {
    active: o.active,
    done: o.done,
    idx: o.idx,
    total: QUESTIONS.length,
    question: q ? { slot: q.slot, type: q.type, chips: q.chips || [] } : null,
    messages: o.messages,
    profile: o.profile || null,
  };
}
