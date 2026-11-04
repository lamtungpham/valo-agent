// Chuyển định dạng xuất "valo-financial-context" (schemaVersion 4.0) của app Valo
// sang snapshot chuẩn hoá của Valo Agent. Chỉ ánh xạ trường, không tính toán tài chính.

const CATEGORY_CLASS = (c = '') => {
  const s = String(c).toLowerCase();
  if (/(cash|tiền mặt|thanh toán)/.test(s)) return 'Tiền mặt';
  if (/(saving|deposit|tiết kiệm|tiền gửi)/.test(s)) return 'Tiền gửi';
  if (/(stock|fund|cổ phiếu|quỹ|etf|chứng)/.test(s)) return 'Cổ phiếu/quỹ';
  if (/(gold|vàng)/.test(s)) return 'Vàng';
  if (/(real|bđs|bất động sản|nhà)/.test(s)) return 'Bất động sản';
  if (/(crypto)/.test(s)) return 'Crypto';
  return c || 'Khác';
};

const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/** records BHXH dạng {year, months[], status, monthlySalaryVND} → periods từng tháng. */
export function recordsToPeriods(records = []) {
  const out = [];
  for (const r of records) {
    if (r.status && r.status !== 'contributed') continue;
    for (const m of r.months || []) out.push({ from: ym(r.year, m), to: ym(r.year, m), salary: Number(r.monthlySalaryVND) || 0 });
  }
  return out;
}

export function mapValoContext(ctx, { label = 'Dữ liệu Valo' } = {}) {
  if (!ctx || ctx.schema !== 'valo-financial-context') throw new Error('Không phải định dạng valo-financial-context');
  const asOf = String(ctx.exportedAt || new Date().toISOString()).slice(0, 10);
  const si = ctx.socialInsurance?.history;
  const age = Number(ctx.profile?.currentAge) || 30;
  const birthYM = si?.birthDate ? si.birthDate.slice(0, 7) : `${Number(asOf.slice(0, 4)) - age}-01`;
  const gender = si?.sex === 'female' ? 'female' : 'male';
  const income = Number(ctx.monthlyCashflow?.incomeVND) || 0;
  const expense = Number(ctx.monthlyCashflow?.expenseVND) || 0;
  const efAmount = Number(ctx.emergencyFund?.amountVND) || 0;

  const accounts = (ctx.assets || []).map((a, i) => ({
    id: `asset-${i}`,
    name: a.name,
    type: 'asset',
    assetClass: CATEGORY_CLASS(a.category),
    balance: Number(a.valueVND) || 0,
  }));
  let ef = accounts.find((a) => /dự phòng|emergency/i.test(a.name));
  if (ef) ef.isEmergencyFund = true;
  else {
    ef = { id: 'emergency', name: 'Quỹ dự phòng (theo Valo)', type: 'memo', assetClass: 'Tiền mặt', balance: efAmount, isEmergencyFund: true, excludeFromAllocation: true };
    accounts.push(ef);
  }
  for (const [i, l] of (ctx.liabilities || []).entries()) {
    accounts.push({ id: `debt-${i}`, name: l.name, type: 'debt', assetClass: 'Nợ', balance: -Math.abs(Number(l.balanceVND) || 0) });
  }

  const surplus = Math.max(0, income - expense);
  const goals = (ctx.goals || []).filter((g) => g.id !== 'retirement').map((g, i) => ({
    id: i === 0 ? 'main' : String(g.id || `g${i}`).replace(/[^a-z0-9_]/gi, '_'),
    name: g.name,
    target: Number(g.nominalAmountAtTargetVND) || 0,
    current: Number(g.allocatedFromCurrentNetWorthVND) || 0,
    monthly: i === 0 ? surplus : 0, // giả định: dòng tiền dư dồn cho mục tiêu đầu tiên
  }));

  const periods = recordsToPeriods(si?.records);
  const lastSalary = periods.length ? periods[periods.length - 1].salary : 0;
  return {
    asOf,
    meta: { source: 'valo-api', label, fictional: false },
    profile: {
      id: 'valo-user',
      name: 'Người dùng Valo',
      gender,
      birthYM,
      age,
      plannedRetirementAge: Number(ctx.profile?.retirementAge) || 60,
      retireMonthlySpend: expense,
      riskProfile: ctx.profile?.riskTolerance || 'MODERATE',
    },
    monthlyIncome: income,
    budget: expense,
    monthlySpending: [{ month: `${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`, amount: expense }],
    accounts,
    goals,
    socialInsurance: {
      periods,
      projection: { salary: lastSalary, untilAge: Number(ctx.profile?.retirementAge) || 60 },
      nextDueDate: null,
      payer: 'Theo hồ sơ Valo',
    },
  };
}
