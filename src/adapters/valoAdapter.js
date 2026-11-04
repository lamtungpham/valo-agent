// Adapter interface cho nguồn dữ liệu Valo.
// Mọi adapter trả về cùng một "snapshot" chuẩn hoá để Agent Thu thập đọc.
//
// Snapshot chuẩn hoá (NormalizedSnapshot):
// {
//   asOf: 'YYYY-MM-DD',
//   meta: { source: 'mock' | 'valo-api' | 'valo-file', label: string, fictional: boolean, fallbackReason?: string },
//   profile: { id, name, gender: 'male'|'female', birthYM: 'YYYY-MM', plannedRetirementAge, retireMonthlySpend, riskProfile },
//   monthlyIncome: number, budget: number,
//   monthlySpending: [{ month: 'MM/YYYY', amount }],
//   accounts: [{ id, name, type: 'cash'|'deposit'|'investment'|'debt', assetClass, balance, isEmergencyFund? }],
//   goals: [{ id, name, target, current, monthly }],
//   socialInsurance: { periods: [{ from: 'YYYY-MM', to: 'YYYY-MM', salary }], projection: { salary, untilAge }, nextDueDate, payer }
// }

export class ValoDataAdapter {
  /** @returns {Promise<object>} NormalizedSnapshot */
  async getSnapshot(_userId) { throw new Error('not implemented'); }
  /** Tên nguồn để hiện trên giao diện. */
  describe() { return 'abstract'; }
}

export const REQUIRED_KEYS = ['asOf', 'profile', 'monthlyIncome', 'monthlySpending', 'accounts', 'goals', 'socialInsurance'];

export function validateSnapshot(s) {
  const missing = REQUIRED_KEYS.filter((k) => s[k] === undefined || s[k] === null);
  if (missing.length) throw new Error(`Snapshot thiếu trường: ${missing.join(', ')}`);
  return s;
}
