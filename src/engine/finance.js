// Engine tài chính xác định: quỹ dự phòng, tỷ trọng tài sản, chi tiêu, mục tiêu, mô phỏng.
import { fact } from './facts.js';

export const THRESHOLDS = {
  emergencyMinMonths: 3, // dưới mức này agent lên tiếng
  emergencyTargetMonths: 6,
  spendingOverPct: 10, // chi tiêu tháng vượt ngân sách quá 10%
  bhxhDueDays: 7, // còn ≤ 7 ngày tới hạn đóng BHXH
};

export function emergencyFund(balance, monthlyExpense, targetMonths = THRESHOLDS.emergencyMinMonths) {
  const months = monthlyExpense > 0 ? balance / monthlyExpense : 0;
  const targetAmount = targetMonths * monthlyExpense;
  return { balance, monthlyExpense, months, targetMonths, targetAmount, shortfall: Math.max(0, targetAmount - balance) };
}

export function allocation(accounts) {
  const assets = accounts.filter((a) => a.balance > 0 && a.type !== 'debt' && !a.excludeFromAllocation);
  const total = assets.reduce((s, a) => s + a.balance, 0);
  const byClass = {};
  for (const a of assets) byClass[a.assetClass] = (byClass[a.assetClass] || 0) + a.balance;
  const debts = accounts.filter((a) => a.type === 'debt').reduce((s, a) => s + Math.abs(a.balance), 0);
  return {
    total,
    debts,
    netWorth: total - debts,
    classes: Object.entries(byClass).map(([k, v]) => ({ assetClass: k, amount: v, pct: total ? (v / total) * 100 : 0 })),
  };
}

export function spendingCheck(monthlySpending, budget) {
  const last = monthlySpending[monthlySpending.length - 1];
  const overPct = budget ? ((last.amount - budget) / budget) * 100 : 0;
  return { month: last.month, amount: last.amount, budget, overPct, over: overPct > THRESHOLDS.spendingOverPct };
}

/** Số tháng để đạt một khoản còn thiếu với mức góp mỗi tháng. */
export function monthsToReach(remaining, perMonth) {
  if (remaining <= 0) return 0;
  if (perMonth <= 0) return Infinity;
  return Math.ceil(remaining / perMonth);
}

export function goalProjection(goal) {
  const remaining = Math.max(0, goal.target - goal.current);
  const months = monthsToReach(remaining, goal.monthly);
  return { ...goal, remaining, months, progressPct: goal.target ? (goal.current / goal.target) * 100 : 0 };
}

/** What-if: tăng góp thêm `extra`/tháng thì về đích sớm bao nhiêu tháng. */
export function whatIfExtra(goal, extra) {
  const base = goalProjection(goal);
  const alt = goalProjection({ ...goal, monthly: goal.monthly + extra });
  return { baseMonths: base.months, newMonths: alt.months, monthsSaved: base.months - alt.months, extra };
}

/** So sánh phương án A và B cho cùng một mục tiêu. */
export function compareAB(goal, a, b) {
  const pa = goalProjection({ ...goal, monthly: a.monthly, current: goal.current + (a.upfront || 0) });
  const pb = goalProjection({ ...goal, monthly: b.monthly, current: goal.current + (b.upfront || 0) });
  return { a: { ...a, months: pa.months }, b: { ...b, months: pb.months }, faster: pa.months === pb.months ? 'equal' : pa.months < pb.months ? 'A' : 'B', diff: Math.abs(pa.months - pb.months) };
}

/** Sốc mất việc N tháng: quỹ dự phòng chịu được bao lâu, thiếu bao nhiêu. */
export function shockJobLoss({ fund, monthlyExpense, months, otherIncome = 0 }) {
  const burn = Math.max(0, monthlyExpense - otherIncome);
  const need = burn * months;
  const runway = burn > 0 ? fund / burn : Infinity;
  return { months, need, fund, shortfall: Math.max(0, need - fund), runwayMonths: runway, survives: fund >= need };
}

/** Phương án cho bước Options của GROW: để riêng X mỗi tuần → bao lâu đủ mục tiêu. */
export function emergencyOptions(ef, weeklyAmounts = [500000, 1000000, 1500000]) {
  return weeklyAmounts.map((w) => {
    const perMonth = (w * 52) / 12;
    return { weekly: w, perMonth, months: monthsToReach(ef.shortfall, perMonth) };
  });
}

export function financeFacts(d, { source, asOf }) {
  const ef = emergencyFund(d.emergencyFund, d.monthlyExpense);
  const alloc = allocation(d.accounts);
  const spend = spendingCheck(d.monthlySpending, d.budget);
  const goals = d.goals.map(goalProjection);
  const facts = [
    fact('ef_balance', { label: 'Số dư quỹ dự phòng', value: ef.balance, unit: 'vnd', formula: 'Số dư tài khoản gắn nhãn "Quỹ dự phòng"', source, asOf }),
    fact('monthly_expense', { label: 'Chi tiêu trung bình tháng', value: d.monthlyExpense, unit: 'vnd', formula: 'Trung bình chi tiêu 3 tháng gần nhất', source, asOf }),
    fact('monthly_income', { label: 'Thu nhập ròng tháng', value: d.monthlyIncome, unit: 'vnd', formula: 'Lương thực nhận sau bảo hiểm và thuế', source, asOf }),
    fact('ef_months', { label: 'Quỹ dự phòng đủ dùng', value: ef.months, unit: 'months', formula: 'Số dư quỹ dự phòng ÷ chi tiêu trung bình tháng', source: 'Engine tài chính', asOf }),
    fact('ef_threshold', { label: 'Ngưỡng an toàn tối thiểu', value: THRESHOLDS.emergencyMinMonths, unit: 'months', formula: 'Ngưỡng cấu hình của agent', source: 'Cấu hình Valo Agent', asOf }),
    fact('ef_shortfall_3', { label: 'Còn thiếu để đủ 3 tháng', value: emergencyFund(d.emergencyFund, d.monthlyExpense, 3).shortfall, unit: 'vnd', formula: '3 × chi tiêu tháng − số dư quỹ', source: 'Engine tài chính', asOf }),
    fact('ef_shortfall_6', { label: 'Còn thiếu để đủ 6 tháng', value: emergencyFund(d.emergencyFund, d.monthlyExpense, 6).shortfall, unit: 'vnd', formula: '6 × chi tiêu tháng − số dư quỹ', source: 'Engine tài chính', asOf }),
    fact('net_worth', { label: 'Tài sản ròng', value: alloc.netWorth, unit: 'vnd', formula: 'Tổng tài sản − tổng nợ', source: 'Engine tài chính', asOf }),
    fact('spend_last', { label: `Chi tiêu tháng ${spend.month}`, value: spend.amount, unit: 'vnd', formula: 'Tổng giao dịch chi trong tháng', source, asOf }),
    fact('spend_over_pct', { label: 'Mức vượt ngân sách', value: spend.overPct, unit: 'percent', formula: '(Chi tiêu tháng − ngân sách) ÷ ngân sách × 100', source: 'Engine tài chính', asOf }),
  ];
  for (const c of alloc.classes) {
    facts.push(fact(`alloc_${c.assetClass}`, { label: `Tỷ trọng ${c.assetClass}`, value: c.pct, unit: 'percent', formula: 'Giá trị nhóm ÷ tổng tài sản × 100', source: 'Engine tài chính', asOf }));
  }
  // bí danh "goal_main_*": mục tiêu đang theo đuổi (mục tiêu đầu tiên chưa đủ tiền, nếu đã đủ hết thì mục tiêu đầu)
  const main = goals.find((g) => g.progressPct < 100) || goals[0];
  if (main) {
    facts.push(fact('goal_main_name', { label: 'Mục tiêu đang theo đuổi', value: main.name, unit: 'text', formula: 'Mục tiêu đầu tiên chưa đủ tiền', source, asOf }));
    facts.push(fact('goal_main_remaining', { label: `Còn thiếu "${main.name}"`, value: main.remaining, unit: 'vnd', formula: 'Số tiền mục tiêu − đã có', source: 'Engine tài chính', asOf }));
    facts.push(fact('goal_main_monthly', { label: `Góp mỗi tháng "${main.name}"`, value: main.monthly || 0, unit: 'vnd', formula: 'Khoản góp định kỳ khai trong dữ liệu', source, asOf }));
    facts.push(fact('goal_main_progress', { label: `Tiến độ "${main.name}"`, value: main.progressPct, unit: 'percent', formula: 'Đã có ÷ mục tiêu × 100', source: 'Engine tài chính', asOf }));
    facts.push(fact('goal_main_months', { label: `Số tháng còn lại "${main.name}"`, value: Number.isFinite(main.months) ? main.months : null, unit: 'months', display: Number.isFinite(main.months) ? undefined : 'chưa ước được (chưa có khoản góp định kỳ)', formula: 'Làm tròn lên (còn thiếu ÷ góp mỗi tháng)', source: 'Engine tài chính', asOf }));
  }
  for (const g of goals) {
    facts.push(fact(`goal_${g.id}_progress`, { label: `Tiến độ "${g.name}"`, value: g.progressPct, unit: 'percent', formula: 'Đã có ÷ mục tiêu × 100', source: 'Engine tài chính', asOf }));
    facts.push(fact(`goal_${g.id}_remaining`, { label: `Còn thiếu "${g.name}"`, value: g.remaining, unit: 'vnd', formula: 'Số tiền mục tiêu − đã có', source: 'Engine tài chính', asOf }));
    facts.push(fact(`goal_${g.id}_months`, { label: `Số tháng còn lại "${g.name}"`, value: Number.isFinite(g.months) ? g.months : null, unit: 'months', display: Number.isFinite(g.months) ? undefined : 'chưa ước được (chưa có khoản góp định kỳ)', formula: 'Làm tròn lên (còn thiếu ÷ góp mỗi tháng)', source: 'Engine tài chính', asOf }));
  }
  return { facts, ef, alloc, spend, goals };
}
