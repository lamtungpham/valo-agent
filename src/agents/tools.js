// Tool hành động thật: tạo mục tiêu, đặt nhắc, what-if, so sánh A/B, mô phỏng sốc.
// Số do engine tính; Coach chỉ diễn giải; Kiểm chứng soát trước khi trả về.
import { pipeline } from './orchestrator.js';
import { fmtDate } from './analyst.js';
import { draft } from './coach.js';
import { verify } from './verifier.js';
import { fact, toMap } from '../engine/facts.js';
import { whatIfExtra, compareAB, shockJobLoss, goalProjection } from '../engine/finance.js';
import { uid } from '../store.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export async function runTool(user, { tool, params = {} }) {
  const { a } = await pipeline(user);
  const asOf = fmtDate(a.snap.asOf);
  const house = a.snap.goals.find((g) => g.id === 'house') || a.snap.goals[0] || { id: 'none', name: 'Mục tiêu', target: 0, current: 0, monthly: 0 };
  const F = (id, o) => fact(id, { asOf, source: 'Engine tài chính', ...o });
  let facts = [];
  let template = '';
  let intent = '';
  const log = { agent: 'Agent chính', action: `tool:${tool}` };

  if (tool === 'what_if') {
    const extra = Math.max(0, num(params.extra, 2000000));
    const r = whatIfExtra(house, extra);
    facts = [
      F('t_extra', { label: 'Tiết kiệm thêm mỗi tháng', value: extra, unit: 'vnd', formula: 'Tham số người dùng nhập' }),
      F('t_base', { label: `Về đích "${house.name}" với mức hiện tại`, value: r.baseMonths, unit: 'months', formula: `Làm tròn lên ((mục tiêu − đã có) ÷ ${house.monthly.toLocaleString('vi-VN')} đ)` }),
      F('t_new', { label: 'Về đích khi góp thêm', value: r.newMonths, unit: 'months', formula: 'Làm tròn lên ((mục tiêu − đã có) ÷ (góp hiện tại + góp thêm))' }),
      F('t_saved', { label: 'Về đích sớm hơn', value: r.monthsSaved, unit: 'months', formula: 'Số tháng hiện tại − số tháng mới' }),
    ];
    intent = 'Diễn giải kết quả mô phỏng what-if tăng tiết kiệm cho mục tiêu mua nhà';
    template = 'Nếu tiết kiệm thêm {{t_extra}} mỗi tháng, mục tiêu mua nhà về đích sau {{t_new}} thay vì {{t_base}}, tức sớm hơn {{t_saved}}.';
  } else if (tool === 'compare_ab') {
    const A = { name: 'A', monthly: num(params.aMonthly, house.monthly + 2000000), upfront: num(params.aUpfront, 0) };
    const B = { name: 'B', monthly: num(params.bMonthly, house.monthly), upfront: num(params.bUpfront, 30000000) };
    const r = compareAB(house, A, B);
    facts = [
      F('t_a_monthly', { label: 'Phương án A: góp mỗi tháng', value: A.monthly, unit: 'vnd', formula: 'Tham số' }),
      F('t_a_upfront', { label: 'Phương án A: góp ngay một lần', value: A.upfront, unit: 'vnd', formula: 'Tham số' }),
      F('t_a_months', { label: 'Phương án A: số tháng về đích', value: r.a.months, unit: 'months', formula: 'Làm tròn lên ((mục tiêu − đã có − góp một lần) ÷ góp tháng)' }),
      F('t_b_monthly', { label: 'Phương án B: góp mỗi tháng', value: B.monthly, unit: 'vnd', formula: 'Tham số' }),
      F('t_b_upfront', { label: 'Phương án B: góp ngay một lần', value: B.upfront, unit: 'vnd', formula: 'Tham số' }),
      F('t_b_months', { label: 'Phương án B: số tháng về đích', value: r.b.months, unit: 'months', formula: 'Làm tròn lên ((mục tiêu − đã có − góp một lần) ÷ góp tháng)' }),
      F('t_diff', { label: 'Chênh lệch', value: r.diff, unit: 'months', formula: '|A − B|' }),
      F('t_faster', { label: 'Phương án nhanh hơn', value: r.faster === 'equal' ? 'Bằng nhau' : `Phương án ${r.faster}`, unit: 'text', formula: 'So sánh số tháng' }),
    ];
    intent = 'So sánh hai phương án tiết kiệm mua nhà, nêu đánh đổi không chỉ tốc độ';
    template = 'Phương án A về đích sau {{t_a_months}}, phương án B sau {{t_b_months}}. {{t_faster}} nhanh hơn {{t_diff}}. Anh cân nhắc thêm phương án nào giữ được quỹ dự phòng an toàn.';
  } else if (tool === 'shock_job_loss') {
    const months = Math.min(24, Math.max(1, num(params.months, 6)));
    const r = shockJobLoss({ fund: a.fin.ef.balance, monthlyExpense: a.monthlyExpense, months, otherIncome: num(params.otherIncome, 0) });
    facts = [
      F('t_months', { label: 'Thời gian mất thu nhập', value: months, unit: 'months', formula: 'Tham số' }),
      F('t_need', { label: 'Tiền cần để sống qua giai đoạn này', value: r.need, unit: 'vnd', formula: 'Số tháng × (chi tiêu tháng − thu nhập khác)' }),
      F('t_fund', { label: 'Quỹ dự phòng hiện có', value: r.fund, unit: 'vnd', formula: 'Số dư quỹ' }),
      F('t_runway', { label: 'Quỹ chịu được', value: Number.isFinite(r.runwayMonths) ? r.runwayMonths : null, unit: 'months', formula: 'Quỹ ÷ (chi tiêu tháng − thu nhập khác)' }),
      F('t_short', { label: 'Còn thiếu', value: r.shortfall, unit: 'vnd', formula: 'max(0, tiền cần − quỹ)' }),
    ];
    intent = 'Diễn giải mô phỏng sốc mất việc, nói rõ rủi ro mà không gây hoảng';
    template = 'Nếu mất thu nhập {{t_months}}, anh cần {{t_need}} để giữ mức sống hiện tại. Quỹ dự phòng {{t_fund}} chỉ chịu được {{t_runway}}, còn thiếu {{t_short}}.';
  } else if (tool === 'create_goal') {
    const g = { id: uid('g'), name: String(params.name || 'Mục tiêu mới').slice(0, 80), kind: 'custom', target: num(params.target), current: num(params.current), monthly: num(params.monthly), createdAt: user.simDate };
    const p = goalProjection(g);
    user.goals.unshift({ ...g, months: Number.isFinite(p.months) ? p.months : null });
    facts = [
      F('t_goal_target', { label: `Mục tiêu "${g.name}"`, value: g.target, unit: 'vnd', formula: 'Người dùng nhập', source: 'Hồ sơ coaching' }),
      F('t_goal_months', { label: 'Số tháng dự kiến', value: Number.isFinite(p.months) ? p.months : null, unit: 'months', formula: 'Làm tròn lên ((mục tiêu − đã có) ÷ góp tháng)' }),
    ];
    intent = 'Xác nhận đã tạo mục tiêu mới và thời gian dự kiến';
    template = 'Đã tạo mục tiêu {{t_goal_target}}. Với mức góp hiện tại, dự kiến cần {{t_goal_months}}.';
  } else if (tool === 'set_reminder') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : user.simDate;
    const r = { id: uid('r'), date, text: String(params.text || 'Nhắc việc tài chính').slice(0, 140), fired: false };
    user.reminders.unshift(r);
    facts = [
      F('t_rem_date', { label: 'Ngày nhắc', value: fmtDate(date), unit: 'text', formula: 'Người dùng chọn', source: 'Lịch nhắc' }),
      F('t_rem_text', { label: 'Nội dung nhắc', value: r.text, unit: 'text', formula: 'Người dùng nhập', source: 'Lịch nhắc' }),
    ];
    intent = 'Xác nhận đã đặt nhắc';
    template = 'Đã đặt nhắc vào {{t_rem_date}}: "{{t_rem_text}}".';
  } else {
    return { error: 'Tool không tồn tại' };
  }

  const factMap = { ...a.factMap, ...toMap(facts) };
  const d = await draft({ intent, factIds: facts.map((f) => f.id), factMap, template });
  const v = verify(d, factMap, { factIds: facts.map((f) => f.id) });
  user.trace = [
    { ...log, at: new Date().toISOString() },
    { agent: 'Coach', action: tool, mode: d.mode, at: new Date().toISOString() },
    { agent: 'Kiểm chứng', action: 'verify', passed: v.verification.passed, checks: v.verification.checks.map((c) => c.msg), at: new Date().toISOString() },
    ...user.trace,
  ].slice(0, 40);
  return { tool, ...v };
}
