// AGENT PHÂN TÍCH: chỉ chạy engine xác định và đưa ra phán đoán CÓ CẤU TRÚC
// (danh sách sự kiện lệch ngưỡng, mức độ, fact liên quan). Không viết văn, không gọi LLM.
import { financeFacts, THRESHOLDS, emergencyFund, emergencyOptions, whatIfExtra, shockJobLoss } from '../engine/finance.js';
import { projectPension, bhxhFacts } from '../engine/bhxh.js';
import { fact, toMap } from '../engine/facts.js';

export const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const endOfMonth = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };

export function analyze(snap, user) {
  const asOf = fmtDate(snap.asOf);
  const source = snap.meta.label;
  const monthlyExpense = Math.round(snap.monthlySpending.reduce((s, m) => s + m.amount, 0) / snap.monthlySpending.length);
  const fin = financeFacts({
    emergencyFund: snap.emergencyFundBalance,
    monthlyExpense,
    monthlyIncome: snap.monthlyIncome,
    accounts: snap.accounts,
    monthlySpending: snap.monthlySpending,
    budget: snap.budget,
    goals: snap.goals,
  }, { source, asOf });
  const surplus = snap.monthlyIncome - monthlyExpense;
  fin.facts.push(fact('monthly_surplus', { label: 'Dòng tiền dư mỗi tháng', value: surplus, unit: 'vnd', formula: 'Thu nhập ròng − chi tiêu trung bình tháng', source: 'Engine tài chính', asOf }));

  const asOfYM = snap.asOf.slice(0, 7);
  const proj = projectPension({
    gender: snap.profile.gender,
    birthYM: snap.profile.birthYM,
    periods: snap.socialInsurance.periods,
    asOfYM,
    projectSalary: snap.socialInsurance.projection.salary,
    stopAge: snap.profile.plannedRetirementAge,
  });
  const bFacts = bhxhFacts(proj, { source, asOf, monthlySpendRetire: snap.profile.retireMonthlySpend });

  // Hạn đóng BHXH kỳ tới theo đồng hồ mô phỏng
  const sim = user.simDate;
  let due = snap.socialInsurance.nextDueDate;
  if (!due || due < sim) due = endOfMonth(sim);
  const daysToDue = daysBetween(sim, due);
  bFacts.push(fact('bhxh_due_date', { label: 'Hạn đóng BHXH kỳ tới', value: fmtDate(due), unit: 'text', formula: 'Ngày cuối tháng đóng (doanh nghiệp đóng hằng tháng)', source, asOf }));
  bFacts.push(fact('bhxh_due_days', { label: 'Số ngày tới hạn đóng BHXH', value: daysToDue, unit: 'count', display: `${daysToDue} ngày`, formula: 'Hạn đóng − ngày hôm nay', source: 'Engine', asOf: fmtDate(sim) }));

  const facts = [...fin.facts, ...bFacts];

  // Phán đoán có cấu trúc: chỉ phát sự kiện khi lệch ngưỡng
  const events = [];
  if (fin.ef.months < THRESHOLDS.emergencyMinMonths) {
    events.push({ key: 'ef_low', dedupe: `ef_low_${Math.round(fin.ef.months * 10)}`, severity: 'high', title: 'Quỹ dự phòng dưới ngưỡng 3 tháng', factIds: ['ef_months', 'ef_threshold', 'ef_shortfall_3'] });
  }
  if (fin.spend.over) {
    events.push({ key: 'spend_over', dedupe: `spend_over_${fin.spend.month}_${Math.round(fin.spend.overPct)}`, severity: 'medium', title: `Chi tiêu tháng ${fin.spend.month} vượt ngân sách`, factIds: ['spend_last', 'spend_over_pct'] });
  }
  if (daysToDue >= 0 && daysToDue <= THRESHOLDS.bhxhDueDays) {
    events.push({ key: 'bhxh_due', dedupe: `bhxh_due_${due}`, severity: 'medium', title: 'Sắp tới hạn đóng BHXH', factIds: ['bhxh_due_date', 'bhxh_due_days'] });
  }
  if (proj.hist.gapMonths.length) {
    events.push({ key: 'bhxh_gap', dedupe: `bhxh_gap_${proj.hist.gapMonths.join('_')}`, severity: 'high', title: 'Lịch sử BHXH có tháng ngắt quãng', factIds: ['bhxh_gap_count', 'bhxh_gap_list'] });
  }
  if (proj.waitMonths > 0) {
    events.push({ key: 'retire_wait', dedupe: `retire_wait_${proj.plannedAge}`, severity: 'info', title: 'Tuổi nghỉ dự định sớm hơn tuổi luật', factIds: ['age_planned', 'age_legal', 'retire_wait_months', 'retire_gap'] });
  }
  for (const c of user.commitments.filter((c) => c.status === 'open')) {
    const d = daysBetween(sim, c.dueDate);
    if (d < 0) events.push({ key: 'commit_overdue', dedupe: `commit_overdue_${c.id}`, severity: 'high', title: 'Cam kết đã quá hạn, chưa xác nhận', commitmentId: c.id, factIds: [] });
    else if (d <= 1) events.push({ key: 'commit_due', dedupe: `commit_due_${c.id}`, severity: 'medium', title: 'Cam kết sắp tới hạn', commitmentId: c.id, factIds: [] });
  }

  const log = {
    agent: 'Phân tích',
    action: 'engine',
    facts: facts.length,
    events: events.map((e) => e.key),
    efMonths: Number(fin.ef.months.toFixed(2)),
    bhxhGapMonths: proj.hist.gapMonths.length,
  };
  return { facts, factMap: toMap(facts), events, fin, proj, monthlyExpense, surplus, snap, log };
}

/** Fact phục vụ từng bước GROW (tính bằng engine, không phải LLM). */
export function growFacts(a, { targetMonths, weekly } = {}) {
  const asOf = fmtDate(a.snap.asOf);
  const out = [];
  if (targetMonths) {
    const ef = emergencyFund(a.fin.ef.balance, a.monthlyExpense, targetMonths);
    out.push(fact('g_target_months', { label: 'Mục tiêu quỹ dự phòng', value: targetMonths, unit: 'months', formula: 'Người dùng chọn ở bước Goal', source: 'Phiên coaching', asOf }));
    out.push(fact('g_target_amount', { label: 'Số tiền quỹ cần có', value: ef.targetAmount, unit: 'vnd', formula: 'Số tháng mục tiêu × chi tiêu trung bình tháng', source: 'Engine tài chính', asOf }));
    out.push(fact('g_shortfall', { label: 'Còn thiếu so với mục tiêu', value: ef.shortfall, unit: 'vnd', formula: 'Số tiền quỹ cần có − số dư quỹ hiện tại', source: 'Engine tài chính', asOf }));
    const opts = emergencyOptions(ef);
    opts.forEach((o, i) => {
      out.push(fact(`o${i + 1}_weekly`, { label: `Phương án ${i + 1}: để riêng mỗi tuần`, value: o.weekly, unit: 'vnd', formula: 'Mức đề xuất', source: 'Engine tài chính', asOf }));
      out.push(fact(`o${i + 1}_months`, { label: `Phương án ${i + 1}: số tháng để đủ`, value: Number.isFinite(o.months) ? o.months : null, unit: 'months', formula: 'Làm tròn lên (còn thiếu ÷ (mức tuần × 52 ÷ 12))', source: 'Engine tài chính', asOf }));
      out.push(fact(`o${i + 1}_share`, { label: `Phương án ${i + 1}: % dòng tiền dư`, value: a.surplus > 0 ? (o.perMonth / a.surplus) * 100 : null, unit: 'percent', formula: '(mức tuần × 52 ÷ 12) ÷ dòng tiền dư tháng × 100', source: 'Engine tài chính', asOf }));
    });
    if (weekly) {
      const o = opts.find((x) => x.weekly === weekly) || emergencyOptions(ef, [weekly])[0];
      out.push(fact('w_weekly', { label: 'Mức cam kết mỗi tuần', value: o.weekly, unit: 'vnd', formula: 'Phương án người dùng chọn', source: 'Phiên coaching', asOf }));
      out.push(fact('w_months', { label: 'Dự kiến đủ quỹ sau', value: Number.isFinite(o.months) ? o.months : null, unit: 'months', formula: 'Làm tròn lên (còn thiếu ÷ (mức tuần × 52 ÷ 12))', source: 'Engine tài chính', asOf }));
      const jl = shockJobLoss({ fund: a.fin.ef.balance, monthlyExpense: a.monthlyExpense, months: 6 });
      out.push(fact('w_shock_months', { label: 'Kịch bản sốc', value: 6, unit: 'months', formula: 'Kịch bản mất việc chuẩn của engine', source: 'Mô phỏng sốc', asOf }));
      out.push(fact('w_shock_short', { label: 'Nếu mất việc 6 tháng hôm nay, còn thiếu', value: jl.shortfall, unit: 'vnd', formula: '6 × chi tiêu tháng − quỹ dự phòng', source: 'Mô phỏng sốc', asOf }));
    }
    return { facts: out, options: opts, ef };
  }
  return { facts: out };
}

export { whatIfExtra };
