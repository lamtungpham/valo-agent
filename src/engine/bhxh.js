// Engine BHXH xác định (deterministic). Không có LLM ở đây.
// Căn cứ áp dụng (đơn giản hoá cho demo, ghi rõ trong từng fact):
//  - Tuổi nghỉ hưu điều kiện lao động bình thường: Bộ luật Lao động 2019 Điều 169,
//    Nghị định 135/2020/NĐ-CP: nam 60 tuổi 3 tháng (2021), +3 tháng/năm, tối đa 62;
//    nữ 55 tuổi 4 tháng (2021), +4 tháng/năm, tối đa 60.
//  - Lương hưu: Luật BHXH 2024 (hiệu lực 01/07/2025): đủ tuổi + tối thiểu 15 năm đóng.
//    Nam: 45% cho 20 năm, mỗi năm thêm +2%, tối đa 75%; 15 đến dưới 20 năm: 40% + 1%/năm.
//    Nữ: 45% cho 15 năm, mỗi năm thêm +2%, tối đa 75%.
//    Tháng lẻ: 1-6 tháng tính nửa năm, 7-11 tháng tính một năm.
//  - Trợ cấp một lần khi nghỉ hưu: mỗi năm đóng vượt số năm đạt 75% (nam 35, nữ 30)
//    được 0,5 tháng lương bình quân.
//  - Bình quân tiền lương: trung bình toàn bộ thời gian đóng. Giả định hệ số trượt giá = 1
//    (chưa điều chỉnh CPI) vì không biết trước hệ số tương lai.

import { fact } from './facts.js';

export const LUONG_CO_SO = 2340000; // từ 01/07/2024
export const TRAN_DONG = 20 * LUONG_CO_SO;

export const parseYM = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); };
export const fmtYM = (i) => `${String((i % 12) + 1).padStart(2, '0')}/${Math.floor(i / 12)}`;
export const yearOf = (i) => Math.floor(i / 12);

/** Trải các giai đoạn đóng thành danh sách tháng {idx, salary}. */
export function expandPeriods(periods) {
  const map = new Map();
  for (const p of periods) {
    for (let i = parseYM(p.from); i <= parseYM(p.to); i++) map.set(i, p.salary);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([idx, salary]) => ({ idx, salary }));
}

/** Lịch sử đóng theo năm, theo tháng, và phát hiện tháng ngắt quãng. */
export function analyzeHistory(periods) {
  const months = expandPeriods(periods);
  if (!months.length) return { months, totalMonths: 0, byYear: [], gaps: [], gapMonths: [], firstMonth: '—', lastMonth: '—', overCap: 0 };
  const set = new Set(months.map((m) => m.idx));
  const first = months[0].idx;
  const last = months[months.length - 1].idx;
  const gapMonths = [];
  for (let i = first; i <= last; i++) if (!set.has(i)) gapMonths.push(i);
  // gom tháng thiếu liền nhau thành đoạn
  const gaps = [];
  for (const g of gapMonths) {
    const cur = gaps[gaps.length - 1];
    if (cur && cur.toIdx === g - 1) { cur.toIdx = g; cur.count++; }
    else gaps.push({ fromIdx: g, toIdx: g, count: 1 });
  }
  gaps.forEach((g) => { g.from = fmtYM(g.fromIdx); g.to = fmtYM(g.toIdx); });
  const salaryOf = new Map(months.map((m) => [m.idx, m.salary]));
  const byYear = [];
  for (let y = yearOf(first); y <= yearOf(last); y++) {
    const cells = [];
    let count = 0;
    let sum = 0;
    for (let mo = 0; mo < 12; mo++) {
      const idx = y * 12 + mo;
      const s = salaryOf.get(idx);
      let state = 'none';
      if (s !== undefined) { state = 'paid'; count++; sum += s; }
      else if (idx > first && idx < last) state = 'gap';
      cells.push({ month: mo + 1, state, salary: s ?? null });
    }
    byYear.push({ year: y, count, avgSalary: count ? sum / count : 0, cells });
  }
  return {
    months,
    totalMonths: months.length,
    firstMonth: fmtYM(first),
    lastMonth: fmtYM(last),
    firstIdx: first,
    lastIdx: last,
    byYear,
    gaps,
    gapMonths: gapMonths.map(fmtYM),
    overCap: months.filter((m) => m.salary > TRAN_DONG).length,
  };
}

/** Tuổi nghỉ hưu theo luật (điều kiện bình thường). Trả về tháng đủ tuổi. */
export function legalRetirement(gender, birthYM) {
  const birth = parseYM(birthYM);
  const male = gender === 'male';
  const base2021 = male ? 60 * 12 + 3 : 55 * 12 + 4;
  const step = male ? 3 : 4;
  const cap = male ? 62 * 12 : 60 * 12;
  const pre = male ? 60 * 12 : 55 * 12;
  const required = (y) => (y < 2021 ? pre : Math.min(base2021 + step * (y - 2021), cap));
  for (let m = birth + pre; m < birth + cap + 1; m++) {
    if (m - birth >= required(yearOf(m))) {
      const ageMonths = m - birth;
      return { idx: m, ym: fmtYM(m), ageMonths, ageYears: ageMonths / 12 };
    }
  }
  return { idx: birth + cap, ym: fmtYM(birth + cap), ageMonths: cap, ageYears: cap / 12 };
}

/** Quy đổi số tháng đóng thành số năm dùng để tính tỷ lệ (tháng lẻ 1-6 = 0,5; 7-11 = 1). */
export function yearsForRate(totalMonths) {
  const y = Math.floor(totalMonths / 12);
  const r = totalMonths % 12;
  return y + (r === 0 ? 0 : r <= 6 ? 0.5 : 1);
}

export function pensionRate(gender, years) {
  const male = gender === 'male';
  if (years < 15) return 0;
  if (male) {
    if (years < 20) return Math.min(75, 40 + (years - 15) * 1);
    return Math.min(75, 45 + (years - 20) * 2);
  }
  return Math.min(75, 45 + (years - 15) * 2);
}

/**
 * Dự phóng đầy đủ: lịch sử + đóng tiếp tới `stopAge`, so với tuổi luật, lương hưu dự kiến.
 * @param {object} p {gender, birthYM, periods, asOfYM, projectSalary, stopAge}
 */
export function projectPension({ gender, birthYM, periods, asOfYM, projectSalary, stopAge }) {
  const hist = analyzeHistory(periods);
  const birth = parseYM(birthYM);
  const asOf = parseYM(asOfYM);
  const stopIdx = birth + stopAge * 12; // đóng tới tháng trước sinh nhật stopAge
  const projected = [];
  for (let i = Math.max(asOf + 1, (hist.lastIdx ?? asOf) + 1); i < stopIdx; i++) projected.push({ idx: i, salary: projectSalary });
  const all = [...hist.months, ...projected];
  const totalMonths = all.length;
  const sum = all.reduce((a, m) => a + m.salary, 0);
  const avgSalary = totalMonths ? sum / totalMonths : 0;
  const years = yearsForRate(totalMonths);
  const rate = pensionRate(gender, years);
  const legal = legalRetirement(gender, birthYM);
  const fullYears = gender === 'male' ? 35 : 30;
  const extraYears = Math.max(0, years - fullYears);
  const lumpSum = rate >= 75 ? extraYears * 0.5 * avgSalary : 0;
  const monthlyPension = rate > 0 ? (rate / 100) * avgSalary : 0;
  const plannedIdx = birth + stopAge * 12;
  const waitMonths = Math.max(0, legal.idx - plannedIdx);
  return {
    hist,
    projectedMonths: projected.length,
    totalMonths,
    avgSalary,
    years,
    rate,
    monthlyPension,
    lumpSum,
    extraYears,
    eligible: years >= 15,
    legal,
    plannedAge: stopAge,
    plannedYM: fmtYM(plannedIdx),
    plannedIdx,
    waitMonths,
    birthIdx: birth,
    stopIdx,
    all,
  };
}

/** Trạng thái tại một tuổi bất kỳ (thanh trượt 31-85). */
export function stateAtAge(proj, age, monthlySpendRetire) {
  const idx = proj.birthIdx + Math.round(age * 12);
  const contributed = proj.all.filter((m) => m.idx < idx).length;
  let status;
  if (idx < proj.stopIdx) status = 'contributing';
  else if (idx < proj.legal.idx) status = 'waiting';
  else status = 'pension';
  const monthsReceived = status === 'pension' ? idx - proj.legal.idx : 0;
  const bridgeSpent = Math.min(Math.max(0, idx - proj.stopIdx), proj.waitMonths) * monthlySpendRetire;
  return {
    age,
    ym: fmtYM(idx),
    status,
    contributedMonths: contributed,
    contributedYears: contributed / 12,
    monthsReceived,
    pensionReceived: monthsReceived * proj.monthlyPension,
    bridgeSpent,
  };
}

/** Bộ fact BHXH chuẩn hoá để agent khác dùng. */
export function bhxhFacts(proj, { source, asOf, monthlySpendRetire }) {
  const h = proj.hist;
  const src = source;
  const out = [
    fact('bhxh_hist_months', { label: 'Số tháng đã đóng BHXH', value: h.totalMonths, unit: 'months', formula: `Đếm tháng có đóng từ ${h.firstMonth} đến ${h.lastMonth}`, source: src, asOf }),
    fact('bhxh_hist_years', { label: 'Số năm đã đóng (quy đổi)', value: h.totalMonths / 12, unit: 'years', formula: 'Số tháng đã đóng ÷ 12', source: src, asOf }),
    fact('bhxh_gap_count', { label: 'Số tháng ngắt quãng', value: h.gapMonths.length, unit: 'count', formula: 'Đếm tháng không có bản ghi đóng nằm giữa tháng đầu và tháng cuối', source: src, asOf }),
    fact('bhxh_gap_list', { label: 'Các tháng ngắt quãng', value: h.gapMonths.length ? h.gapMonths.join(', ') : 'Không có', unit: 'text', formula: 'Liệt kê tháng thiếu', source: src, asOf }),
    fact('bhxh_total_months', { label: 'Tổng tháng đóng dự phóng', value: proj.totalMonths, unit: 'months', formula: `Đã đóng ${h.totalMonths} + dự phóng ${proj.projectedMonths} tháng (tới trước sinh nhật ${proj.plannedAge} tuổi)`, source: src + ' + giả định dự phóng', asOf }),
    fact('bhxh_years_rate', { label: 'Số năm tính tỷ lệ hưởng', value: proj.years, unit: 'years', formula: 'Năm tròn + tháng lẻ (1-6 tháng = 0,5 năm; 7-11 tháng = 1 năm)', source: 'Quy tắc làm tròn tháng lẻ', asOf }),
    fact('bhxh_avg_salary', { label: 'Bình quân tiền lương đóng', value: proj.avgSalary, unit: 'vnd', formula: 'Tổng lương đóng mọi tháng ÷ tổng số tháng; giả định hệ số trượt giá = 1', source: src + ' + giả định dự phóng', asOf }),
    fact('bhxh_rate', { label: 'Tỷ lệ hưởng lương hưu', value: proj.rate, unit: 'percent', formula: 'Nam: 45% cho 20 năm, +2%/năm, tối đa 75% (Luật BHXH 2024)', source: 'Luật BHXH 2024', asOf }),
    fact('bhxh_pension', { label: 'Lương hưu dự kiến mỗi tháng', value: proj.monthlyPension, unit: 'vnd', formula: 'Tỷ lệ hưởng × bình quân tiền lương', source: 'Engine BHXH', asOf }),
    fact('bhxh_lump_sum', { label: 'Trợ cấp một lần khi nghỉ hưu', value: proj.lumpSum, unit: 'vnd', formula: 'Số năm vượt mốc 75% × 0,5 × bình quân tiền lương', source: 'Luật BHXH 2024', asOf }),
    fact('age_legal', { label: 'Tuổi nghỉ hưu theo luật', value: proj.legal.ageYears, unit: 'age', formula: 'BLLĐ 2019 Điều 169 + NĐ 135/2020 (điều kiện lao động bình thường)', source: 'Pháp luật lao động', asOf }),
    fact('age_legal_month', { label: 'Tháng đủ tuổi nghỉ hưu', value: proj.legal.ym, unit: 'text', formula: 'Tháng sinh + tuổi nghỉ hưu theo luật', source: 'Pháp luật lao động', asOf }),
    fact('age_planned', { label: 'Tuổi nghỉ dự định', value: proj.plannedAge, unit: 'age', formula: 'Người dùng khai báo', source: 'Hồ sơ người dùng', asOf }),
    fact('retire_wait_months', { label: 'Số tháng chờ giữa nghỉ dự định và tuổi luật', value: proj.waitMonths, unit: 'months', formula: 'Tháng đủ tuổi luật − tháng nghỉ dự định', source: 'Engine BHXH', asOf }),
    fact('retire_gap', { label: 'Khoảng trống hưu trí (giai đoạn chưa có lương hưu)', value: proj.waitMonths * monthlySpendRetire, unit: 'vnd', formula: `Số tháng chờ × chi tiêu dự kiến lúc nghỉ (${new Intl.NumberFormat('vi-VN').format(monthlySpendRetire)} đ/tháng, giá hôm nay)`, source: 'Engine BHXH + hồ sơ chi tiêu', asOf }),
  ];
  return out;
}
