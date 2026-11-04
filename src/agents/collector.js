// AGENT THU THẬP: chỉ ĐỌC dữ liệu. Không tính toán, không ghi.
// Đọc qua adapter (mock hoặc Valo API), áp các chỉnh sửa người dùng nhập tay, rồi đóng băng snapshot.
import { getAdapter } from '../adapters/index.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export async function collect(user) {
  const adapter = getAdapter({ dataset: user.dataset, imported: user.valoImport, selfReport: user.selfReport });
  const snap = structuredClone(await adapter.getSnapshot(user.id));
  // Chuẩn hoá: tách quỹ dự phòng và chi tiêu trung bình (chỉ trích xuất, không suy diễn)
  const ov = user.overrides || {};
  const efAcc = snap.accounts.find((a) => a.isEmergencyFund);
  if (efAcc && typeof ov.emergencyFund === 'number') efAcc.balance = ov.emergencyFund;
  if (typeof ov.lastMonthSpending === 'number' && snap.monthlySpending.length) {
    snap.monthlySpending[snap.monthlySpending.length - 1].amount = ov.lastMonthSpending;
  }
  if (typeof ov.monthlyIncome === 'number') snap.monthlyIncome = ov.monthlyIncome;
  if (user.plannedRetirementAge) snap.profile.plannedRetirementAge = user.plannedRetirementAge;
  snap.emergencyFundBalance = efAcc ? efAcc.balance : 0;
  snap.edited = Object.keys(ov).length > 0;
  const log = {
    agent: 'Thu thập',
    action: 'read',
    source: snap.meta.label,
    records: {
      accounts: snap.accounts.length,
      spendingMonths: snap.monthlySpending.length,
      bhxhPeriods: snap.socialInsurance.periods.length,
      goals: snap.goals.length,
    },
    edited: snap.edited ? Object.keys(ov) : [],
  };
  return { snapshot: deepFreeze(snap), log };
}
