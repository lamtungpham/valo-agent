import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeHistory, projectPension, legalRetirement, yearsForRate, pensionRate, stateAtAge } from '../src/engine/bhxh.js';
import { emergencyFund, whatIfExtra, shockJobLoss } from '../src/engine/finance.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8'));
const full = load('mr-sample.json');
const gap = load('mr-sample-gap.json');

test('Bộ 1: đóng liên tục 01/2018-10/2026 = 106 tháng, không ngắt quãng', () => {
  const h = analyzeHistory(full.socialInsurance.periods);
  assert.equal(h.totalMonths, 106);
  assert.equal(h.gapMonths.length, 0);
  assert.equal(h.firstMonth, '01/2018');
  assert.equal(h.lastMonth, '10/2026');
  assert.equal(h.byYear.find((y) => y.year === 2026).count, 10);
});

test('Bộ 2: báo đúng 3 tháng ngắt quãng 03, 04, 05/2022', () => {
  const h = analyzeHistory(gap.socialInsurance.periods);
  assert.equal(h.totalMonths, 103);
  assert.deepEqual(h.gapMonths, ['03/2022', '04/2022', '05/2022']);
  assert.equal(h.gaps.length, 1);
  assert.equal(h.gaps[0].count, 3);
  assert.equal(h.byYear.find((y) => y.year === 2022).count, 9);
});

test('Tuổi nghỉ hưu theo luật của nam sinh 05/1995 là 62 tuổi (05/2057)', () => {
  const r = legalRetirement('male', '1995-05');
  assert.equal(r.ageMonths, 62 * 12);
  assert.equal(r.ym, '05/2057');
});

test('Tuổi luật lộ trình: nam sinh 01/1962 nghỉ hưu 07/2022 (60 tuổi 6 tháng)', () => {
  // Nam sinh 01/1962: 60 tuổi 6 tháng năm 2022 → 07/2022
  const r = legalRetirement('male', '1962-01');
  assert.equal(r.ym, '07/2022');
});

test('Quy đổi tháng lẻ và tỷ lệ hưởng', () => {
  assert.equal(yearsForRate(424), 35.5);
  assert.equal(yearsForRate(427), 36);
  assert.equal(pensionRate('male', 20), 45);
  assert.equal(pensionRate('male', 15), 40);
  assert.equal(pensionRate('male', 35.5), 75);
  assert.equal(pensionRate('male', 14), 0);
});

test('Dự phóng Mr. Sample đóng 20 triệu tới 58 tuổi', () => {
  const p = projectPension({ gender: 'male', birthYM: '1995-05', periods: full.socialInsurance.periods, asOfYM: '2026-10', projectSalary: 20000000, stopAge: 58 });
  assert.equal(p.projectedMonths, 318); // 11/2026 → 04/2053
  assert.equal(p.totalMonths, 424);
  // (36×10 + 36×15 + 352×20) triệu ÷ 424
  assert.equal(Math.round(p.avgSalary), Math.round(7940000000 / 424));
  assert.equal(p.rate, 75);
  assert.equal(Math.round(p.monthlyPension), Math.round(0.75 * 7940000000 / 424));
  assert.equal(p.waitMonths, 48); // nghỉ 58, đủ tuổi 62
  assert.equal(Math.round(p.lumpSum), Math.round(0.5 * 0.5 * 7940000000 / 424));
});

test('Thanh trượt: trạng thái theo tuổi', () => {
  const p = projectPension({ gender: 'male', birthYM: '1995-05', periods: full.socialInsurance.periods, asOfYM: '2026-10', projectSalary: 20000000, stopAge: 58 });
  assert.equal(stateAtAge(p, 40, 12e6).status, 'contributing');
  assert.equal(stateAtAge(p, 60, 12e6).status, 'waiting');
  const s70 = stateAtAge(p, 70, 12e6);
  assert.equal(s70.status, 'pension');
  assert.equal(s70.monthsReceived, 96);
  assert.equal(s70.bridgeSpent, 48 * 12e6);
});

test('Quỹ dự phòng thiếu và mô phỏng', () => {
  const ef = emergencyFund(20e6, 12.5e6, 3);
  assert.ok(ef.months < 3);
  assert.equal(ef.shortfall, 17.5e6);
  const w = whatIfExtra({ target: 800e6, current: 60e6, monthly: 5e6 }, 2e6);
  assert.equal(w.baseMonths, 148);
  assert.equal(w.newMonths, 106);
  assert.equal(w.monthsSaved, 42);
  const s = shockJobLoss({ fund: 20e6, monthlyExpense: 12.5e6, months: 6 });
  assert.equal(s.shortfall, 55e6);
});

test('mục tiêu có id "main" không đè lên bí danh goal_main_*', async () => {
  const { financeFacts } = await import('../src/engine/finance.js');
  const { toMap } = await import('../src/engine/facts.js');
  const snap = JSON.parse(readFileSync(new URL('../fixtures/mr-sample.json', import.meta.url)));
  snap.goals = [
    { id: 'main', name: 'Đã xong', target: 100, current: 100, monthly: 10 },
    { id: 'x-1', name: 'Mua nhà', target: 1000, current: 347, monthly: 0 },
  ];
  const m = toMap(financeFacts(snap, {}).facts);
  assert.equal(m.goal_main_name.value, 'Mua nhà');
  assert.ok(Math.abs(m.goal_main_progress.value - 34.7) < 0.01);
  assert.equal(m.gl_main_progress.value, 100);
  assert.ok(m.gl_x_1_progress);
});
