// Nhánh CHƯA dùng Valo: hỏi 13 câu ngay trong khung chat coaching chính, mỗi câu lấp một ô dữ liệu.
// Bắt đầu từ điều khiến người dùng chưa yên tâm nhất, rồi mới tới con số. Mỗi tin chỉ một câu hỏi.
// Khai xong: lời khai được dựng thành snapshot chuẩn (cùng dạng dữ liệu Valo) để mọi mục khác dùng chung.

export const QUESTIONS = [
  { slot: 'worry', type: 'text', q: 'Điều gì về tiền bạc đang khiến bạn chưa yên tâm nhất lúc này?', chips: ['Không có khoản dự phòng', 'Nợ thẻ, nợ vay', 'Không biết tiền đi đâu hết', 'Lo chuyện về già'] },
  { slot: 'worry_impact', type: 'text', q: 'Nếu điều đó được giải quyết, cuộc sống của bạn sẽ nhẹ nhõm hơn ở điểm nào?' },
  { slot: 'goal_name', type: 'text', q: 'Vậy mục tiêu tài chính quan trọng nhất của bạn trong vài năm tới là gì?', chips: ['Mua nhà', 'Có quỹ dự phòng vững', 'Trả hết nợ', 'Mua xe'] },
  { slot: 'goal_amount', type: 'money', q: 'Mục tiêu đó cần khoảng bao nhiêu tiền? Bạn cứ ước lượng.' },
  { slot: 'goal_years', type: 'number', q: 'Bạn muốn đạt mục tiêu đó trong bao nhiêu năm?', chips: ['1', '3', '5', '10'] },
  { slot: 'income', type: 'money', q: 'Giờ tôi nhìn vào dòng tiền: mỗi tháng bạn thực nhận khoảng bao nhiêu?' },
  { slot: 'expense', type: 'money', q: 'Một tháng bình thường bạn chi tiêu khoảng bao nhiêu, chưa tính trả nợ?' },
  { slot: 'debt', type: 'money', q: 'Hiện bạn có khoản nợ nào không? Tổng dư nợ khoảng bao nhiêu (không có thì gõ “không”)?', chips: ['0'] },
  { slot: 'debt_payment', type: 'money', q: 'Mỗi tháng bạn trả nợ khoảng bao nhiêu?', skipIf: (a) => !a.debt },
  { slot: 'emergency', type: 'money', q: 'Bạn có khoản tiền để riêng cho tình huống khẩn cấp không? Khoảng bao nhiêu?', chips: ['0'] },
  { slot: 'savings', type: 'money', q: 'Ngoài khoản đó, tiết kiệm và đầu tư khác của bạn tổng cộng khoảng bao nhiêu?', chips: ['0'] },
  { slot: 'risk', type: 'choice', q: 'Nếu một khoản đầu tư của bạn giảm mạnh trong một năm, bạn sẽ làm gì?', chips: ['Bán ngay cho yên tâm', 'Giữ nguyên chờ hồi', 'Mua thêm khi giá rẻ'] },
  { slot: 'age', type: 'number', q: 'Câu cuối: năm nay bạn bao nhiêu tuổi?' },
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

export function parseAnswer(q, text) {
  if (q.type === 'money') return parseMoney(text);
  if (q.type === 'number') { const m = String(text).match(/\d+/); return m ? Number(m[0]) : null; }
  if (q.type === 'choice') return String(text).slice(0, 80);
  return String(text).trim().slice(0, 300);
}

export function nextIndex(o, from) {
  let i = from;
  while (i < QUESTIONS.length && QUESTIONS[i].skipIf?.(o.answers)) i++;
  return i;
}


export const INPUT_HINT = { money: 'Ví dụ: 15 triệu, 500k, 20.000.000', number: 'Nhập một con số', text: 'Trả lời bằng lời của bạn', choice: 'Chọn một ý hoặc tự gõ' };

/** Lời khai → snapshot chuẩn hoá (như dữ liệu Valo), để Tổng quan, Công cụ, Cam kết, coaching dùng chung. */
export function selfReportSnapshot(sr) {
  const a = sr.answers || {};
  const asOf = sr.at;
  const income = a.income || 0;
  const debtPay = a.debt_payment || 0;
  const spend = (a.expense || 0) + debtPay; // chi tiêu tháng tính cả trả nợ để dòng tiền dư không bị thổi phồng
  const age = a.age || 30;
  const surplus = Math.max(0, income - spend);
  const accounts = [
    { id: 'sr-ef', name: 'Quỹ khẩn cấp (tự khai)', type: 'cash', assetClass: 'Tiền mặt', balance: a.emergency || 0, isEmergencyFund: true },
  ];
  if (a.savings) accounts.push({ id: 'sr-sav', name: 'Tiết kiệm, đầu tư khác (tự khai)', type: 'deposit', assetClass: 'Tiền gửi', balance: a.savings });
  if (a.debt) accounts.push({ id: 'sr-debt', name: 'Dư nợ (tự khai)', type: 'debt', assetClass: 'Nợ', balance: -Math.abs(a.debt) });
  const goals = a.goal_amount ? [{ id: 'self_goal', name: a.goal_name || 'Mục tiêu chính', target: a.goal_amount, current: Math.min(a.savings || 0, a.goal_amount), monthly: surplus, years: a.goal_years || null }] : [];
  return {
    asOf,
    meta: { source: 'self-report', label: `Hồ sơ bạn tự khai qua trò chuyện (ngày ${asOf.split('-').reverse().join('/')})`, fictional: false },
    profile: {
      id: 'self-report', name: 'Bạn (tự khai)', gender: 'male', birthYM: `${Number(asOf.slice(0, 4)) - age}-01`, age,
      plannedRetirementAge: 60, retireMonthlySpend: a.expense || 0, riskProfile: RISK[a.risk] || 'chưa rõ',
      worry: a.worry || null, worryImpact: a.worry_impact || null,
    },
    monthlyIncome: income,
    budget: spend,
    monthlySpending: [{ month: `${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`, amount: spend }],
    accounts,
    goals,
    socialInsurance: { periods: [], projection: { salary: 0, untilAge: 60 }, nextDueDate: null, payer: 'Chưa có lịch sử BHXH (hồ sơ tự khai)' },
  };
}
