// CHỦ ĐỀ COACHING: Agent Phân tích phát hiện các điểm chưa tốt (xác định, không LLM),
// người dùng chọn một điểm, rồi phiên coaching (GROW + OSKAR + WOOP, MI khi lưỡng lự) chạy trên chủ đề đó.
// Mỗi chủ đề tự tính fact của mình từ engine; template không chứa chữ số.
import { fact } from '../engine/facts.js';
import { THRESHOLDS, monthsToReach } from '../engine/finance.js';
import { fmtDate } from './analyst.js';

const WEEKS_PER_MONTH = 52 / 12;
const round50k = (n) => Math.max(100000, Math.round(n / 50000) * 50000);
const F = (a, id, o) => fact(id, { source: 'Engine tài chính', asOf: fmtDate(a.snap.asOf), ...o });

function monthsUntilPlanned(a) {
  const [by, bm] = a.snap.profile.birthYM.split('-').map(Number);
  const [ny, nm] = a.snap.asOf.slice(0, 7).split('-').map(Number);
  const planned = a.proj.plannedAge;
  return Math.max(1, (by + planned) * 12 + bm - (ny * 12 + nm));
}

function nextGoal(a) {
  return a.fin.goals.find((g) => g.progressPct < 100) || null;
}

/** Danh sách điểm cần cải thiện, nặng trước. Mỗi điểm có câu mô tả (template) và fact đi kèm. */
export function detectIssues(a) {
  const out = [];
  const ef = a.fin.ef;
  if (ef.months < THRESHOLDS.emergencyTargetMonths) {
    out.push({
      key: 'emergency', severity: ef.months < THRESHOLDS.emergencyMinMonths ? 3 : 1,
      label: 'Xây quỹ dự phòng',
      text: ef.months < THRESHOLDS.emergencyMinMonths
        ? 'quỹ dự phòng mới đủ {{ef_months}} chi tiêu, dưới ngưỡng an toàn {{ef_threshold}}'
        : 'quỹ dự phòng đủ {{ef_months}} chi tiêu, chưa tới mức khuyến nghị {{ef_target}}',
      factIds: ['ef_months', 'ef_threshold', 'ef_target'],
    });
  }
  if (a.fin.spend.over) {
    out.push({ key: 'spend', severity: 2, label: 'Kiểm soát chi tiêu', text: 'chi tiêu tháng gần nhất {{spend_last}}, vượt ngân sách {{spend_over_pct}}', factIds: ['spend_last', 'spend_over_pct'] });
  }
  if (a.proj.hist.gapMonths.length) {
    out.push({ key: 'bhxh_gap', severity: 2, label: 'Xử lý tháng BHXH bị thiếu', text: 'lịch sử BHXH có {{bhxh_gap_count}} tháng ngắt quãng ({{bhxh_gap_list}}), làm giảm lương hưu sau này', factIds: ['bhxh_gap_count', 'bhxh_gap_list'] });
  }
  const g = nextGoal(a);
  if (g && (!Number.isFinite(g.months) || g.months > 36)) {
    out.push({
      key: 'goal', severity: 1, label: `Đẩy nhanh mục tiêu "${g.name}"`,
      text: Number.isFinite(g.months)
        ? 'mục tiêu "{{goal_main_name}}" mới đạt {{goal_main_progress}}, giữ mức góp hiện tại còn mất {{goal_main_months}}'
        : 'mục tiêu "{{goal_main_name}}" mới đạt {{goal_main_progress}}, còn thiếu {{goal_main_remaining}} và chưa có khoản góp định kỳ',
      factIds: ['goal_main_name', 'goal_main_progress', 'goal_main_months', 'goal_main_remaining'],
    });
  }
  if (a.factMap.retire_gap?.value > 0) {
    out.push({ key: 'retire', severity: 1, label: 'Chuẩn bị cho giai đoạn nghỉ sớm', text: 'anh định nghỉ ở {{age_planned}} nhưng lương hưu bắt đầu từ {{age_legal}}, cần tự chuẩn bị khoảng {{retire_gap}}', factIds: ['age_planned', 'age_legal', 'retire_gap'] });
  }
  return out.sort((x, y) => y.severity - x.severity).slice(0, 4);
}

/** Đoán chủ đề từ câu người dùng gõ tay sau bảng tổng kết. */
export function matchTopic(text, issues) {
  const t = String(text).toLowerCase();
  const rules = [['emergency', /dự phòng|du phong|quỹ khẩn|khẩn cấp/], ['spend', /chi tiêu|chi tieu|ngân sách|tiêu xài|vượt/], ['bhxh_gap', /bhxh|bảo hiểm|ngắt quãng|thiếu tháng/], ['goal', /mục tiêu|muc tieu|nhà|xe|đẩy nhanh/], ['retire', /hưu|huu|nghỉ sớm|về già/]];
  const keys = issues.map((i) => i.key);
  for (const [k, re] of rules) if (keys.includes(k) && re.test(t)) return k;
  const n = t.match(/(?:điểm|thứ|số)?\s*([1-4])\b/);
  if (n && issues[Number(n[1]) - 1]) return issues[Number(n[1]) - 1].key;
  return null;
}

// ---------------- Cấu hình từng chủ đề (trừ "emergency" dùng luồng gốc) ----------------
const KNOWHOW_CHIPS = {
  spend: ['Ghi chép từng khoản chi', 'Để tiền tiêu riêng một tài khoản', 'Chưa từng làm được'],
  goal: ['Đặt chuyển khoản tự động', 'Có hình ảnh mục tiêu để nhìn vào', 'Chưa từng làm được'],
  retire: ['Đặt chuyển khoản tự động', 'Tách riêng một tài khoản không đụng tới', 'Chưa từng làm được'],
  bhxh_gap: ['Hỏi thẳng người phụ trách', 'Tự tra cứu trên ứng dụng', 'Chưa từng làm việc này'],
};

export const TOPICS = {
  spend: {
    name: 'giữ chi tiêu trong ngân sách',
    goal: (a) => ({
      question: 'Tháng tới, anh muốn chi tiêu dừng ở mức nào?',
      factIds: ['spend_last', 't_budget'],
      template: 'Tháng gần nhất anh chi {{spend_last}}, trong khi ngân sách là {{t_budget}}. Mình bắt đầu từ điều anh muốn: tháng tới, anh muốn chi tiêu dừng ở mức nào?',
      chips: [{ label: `Đúng ngân sách`, value: String(a.fin.spend.budget) }, { label: 'Giảm dần, chưa cần về ngân sách ngay', value: String(Math.round((a.fin.spend.amount + a.fin.spend.budget) / 2)) }],
    }),
    parseGoal: (d, answer, value, a, parseMoney) => { d.targetSpend = Number(value) || parseMoney(answer) || a.fin.spend.budget; },
    facts(a, d) {
      const sp = a.fin.spend;
      const target = d.targetSpend || sp.budget;
      const cut = Math.max(0, sp.amount - target);
      const base = cut > 0 ? cut / WEEKS_PER_MONTH : 300000;
      const opts = [0.5, 1, 1.5].map((k) => round50k(base * k));
      d.options = opts;
      const out = [
        F(a, 't_budget', { label: 'Ngân sách chi tiêu tháng', value: sp.budget, unit: 'vnd', formula: 'Ngân sách trong dữ liệu' }),
        F(a, 't_target', { label: 'Mức chi anh muốn tháng tới', value: target, unit: 'vnd', formula: 'Người dùng chọn ở bước mục tiêu', source: 'Phiên coaching' }),
        F(a, 't_cut', { label: 'Cần bớt so với tháng gần nhất', value: cut, unit: 'vnd', formula: 'Chi tiêu tháng gần nhất − mức muốn' }),
      ];
      opts.forEach((w, i) => {
        out.push(F(a, `o${i + 1}_weekly`, { label: `Phương án ${i + 1}: bớt mỗi tuần`, value: w, unit: 'vnd', formula: 'Mức đề xuất quanh (khoản cần bớt ÷ số tuần trong tháng)' }));
        out.push(F(a, `o${i + 1}_monthly`, { label: `Phương án ${i + 1}: bớt mỗi tháng`, value: w * WEEKS_PER_MONTH, unit: 'vnd', formula: 'Mức tuần × 52 ÷ 12' }));
      });
      if (d.weekly) out.push(F(a, 'w_weekly', { label: 'Mức bớt mỗi tuần đã chọn', value: d.weekly, unit: 'vnd', formula: 'Phương án người dùng chọn', source: 'Phiên coaching' }), F(a, 'w_monthly', { label: 'Mỗi tháng để dành thêm được', value: d.weekly * WEEKS_PER_MONTH, unit: 'vnd', formula: 'Mức tuần × 52 ÷ 12' }));
      return out;
    },
    reality: () => ({
      factIds: ['spend_last', 't_target', 't_cut'],
      template: 'Thực tế bây giờ: tháng gần nhất anh chi {{spend_last}}, mức anh muốn là {{t_target}}, tức cần bớt khoảng {{t_cut}}. Trên thang {{k_scale}}, với mức cao nhất là anh hoàn toàn làm chủ chi tiêu của mình, anh thấy mình đang ở đâu?',
      question: 'Với mức cao nhất là anh hoàn toàn làm chủ chi tiêu, anh thấy mình đang ở đâu?',
    }),
    knowhowQ: 'Đã có lúc nào anh giữ được chi tiêu trong khuôn khổ chưa, và điều gì giúp anh làm được lúc đó?',
    options: () => ({
      factIds: ['o1_weekly', 'o1_monthly', 'o2_weekly', 'o2_monthly', 'o3_weekly', 'o3_monthly'],
      template: 'Engine tính ba mức bớt chi tiêu không thiết yếu: {{o1_weekly}} mỗi tuần, tức khoảng {{o1_monthly}} mỗi tháng; {{o2_weekly}}, tức {{o2_monthly}}; hoặc {{o3_weekly}}, tức {{o3_monthly}}. Mức nào anh chắc chắn giữ được, kể cả vào tuần nhiều cám dỗ nhất?',
      question: 'Mức nào anh chắc chắn giữ được, kể cả vào tuần nhiều cám dỗ nhất?',
    }),
    outcome: 'Hình dung cuối tuần này anh đã giữ được khoản bớt {{w_weekly}}. Điều tốt đẹp nhất anh cảm nhận được lúc đó là gì?',
    will: 'Cam kết tuần này: bớt {{w_weekly}} chi tiêu không thiết yếu trước {{w_due}}',
    willTail: 'Giữ đều, mỗi tháng anh để dành thêm được {{w_monthly}}. Anh chốt cam kết này chứ?',
    willIds: ['w_weekly', 'w_due', 'w_monthly'],
    commitText: (d, vnd, due) => `Bớt ${vnd(d.weekly)} chi tiêu không thiết yếu trước ${due}`,
    goalName: () => 'Giữ chi tiêu trong ngân sách',
  },

  goal: {
    name: 'đẩy nhanh mục tiêu',
    goal: () => ({
      question: 'Anh muốn hoàn thành mục tiêu này trong khoảng bao lâu?',
      factIds: ['goal_main_name', 'goal_main_remaining'],
      template: 'Mục tiêu "{{goal_main_name}}" còn thiếu {{goal_main_remaining}}. Mình bắt đầu từ đích đến: anh muốn hoàn thành mục tiêu này trong khoảng bao lâu?',
      chips: [{ label: 'Trong 3 năm', value: '36' }, { label: 'Trong 5 năm', value: '60' }, { label: 'Trong 10 năm', value: '120' }],
    }),
    parseGoal: (d, answer, value) => {
      const n = Number(value) || Number((String(answer).match(/\d+/) || [])[0]) || 60;
      d.targetMonths = value ? n : /năm/i.test(answer) ? n * 12 : n;
    },
    facts(a, d) {
      const g = nextGoal(a) || a.fin.goals[0];
      d.goalId = g.id;
      d.goalName = g.name;
      const tm = d.targetMonths || 60;
      const need = g.remaining / tm;
      const gap = Math.max(0, need - (g.monthly || 0));
      const base = gap > 0 ? gap / WEEKS_PER_MONTH : 250000;
      const opts = [0.5, 1, 1.5].map((k) => round50k(base * k));
      d.options = opts;
      const out = [
        F(a, 't_target_time', { label: 'Thời hạn anh muốn', value: tm, unit: 'months', formula: 'Người dùng chọn', source: 'Phiên coaching' }),
        F(a, 't_need_monthly', { label: 'Cần góp mỗi tháng để kịp hạn', value: need, unit: 'vnd', formula: 'Còn thiếu ÷ số tháng anh muốn' }),
      ];
      opts.forEach((w, i) => {
        out.push(F(a, `o${i + 1}_weekly`, { label: `Phương án ${i + 1}: góp thêm mỗi tuần`, value: w, unit: 'vnd', formula: 'Mức đề xuất' }));
        const m = monthsToReach(g.remaining, (g.monthly || 0) + w * WEEKS_PER_MONTH);
        out.push(F(a, `o${i + 1}_months`, { label: `Phương án ${i + 1}: xong sau`, value: Number.isFinite(m) ? m : null, unit: 'months', formula: 'Làm tròn lên (còn thiếu ÷ (góp hiện tại + mức tuần × 52 ÷ 12))' }));
      });
      if (d.weekly) {
        const m = monthsToReach(g.remaining, (g.monthly || 0) + d.weekly * WEEKS_PER_MONTH);
        out.push(F(a, 'w_weekly', { label: 'Mức góp thêm mỗi tuần', value: d.weekly, unit: 'vnd', formula: 'Phương án người dùng chọn', source: 'Phiên coaching' }), F(a, 'w_months', { label: 'Dự kiến xong mục tiêu sau', value: Number.isFinite(m) ? m : null, unit: 'months', formula: 'Làm tròn lên (còn thiếu ÷ mức góp mới mỗi tháng)' }));
      }
      return out;
    },
    reality: () => ({
      factIds: ['t_target_time', 't_need_monthly', 'goal_main_monthly', 'monthly_surplus'],
      template: 'Thực tế bây giờ: để xong trong {{t_target_time}}, mỗi tháng cần góp khoảng {{t_need_monthly}}, hiện anh đang góp {{goal_main_monthly}} và mỗi tháng dư {{monthly_surplus}}. Trên thang {{k_scale}}, với mức cao nhất là mục tiêu đang đi đúng tiến độ anh muốn, anh thấy mình đang ở đâu?',
      question: 'Với mức cao nhất là mục tiêu đang đi đúng tiến độ anh muốn, anh thấy mình đang ở đâu?',
    }),
    knowhowQ: 'Trước đây anh từng để dành được một khoản lớn cho việc gì, và điều gì giúp anh làm được?',
    options: () => ({
      factIds: ['o1_weekly', 'o1_months', 'o2_weekly', 'o2_months', 'o3_weekly', 'o3_months'],
      template: 'Engine tính ba mức góp thêm: {{o1_weekly}} mỗi tuần thì xong sau {{o1_months}}; {{o2_weekly}} thì sau {{o2_months}}; {{o3_weekly}} thì sau {{o3_months}}. Mức nào anh chắc chắn làm được đều đặn?',
      question: 'Mức nào anh chắc chắn làm được đều đặn?',
    }),
    outcome: 'Hình dung tối chủ nhật này anh đã chuyển xong {{w_weekly}} vào mục tiêu. Điều tốt đẹp nhất anh cảm nhận được lúc đó là gì?',
    will: 'Cam kết tuần này: chuyển thêm {{w_weekly}} vào mục tiêu trước {{w_due}}',
    willTail: 'Giữ đều mức này, mục tiêu xong sau {{w_months}}. Anh chốt cam kết này chứ?',
    willIds: ['w_weekly', 'w_due', 'w_months'],
    commitText: (d, vnd, due) => `Chuyển thêm ${vnd(d.weekly)} vào mục tiêu "${d.goalName}" trước ${due}`,
    goalName: (d) => d.goalName,
  },

  retire: {
    name: 'chuẩn bị tiền cho giai đoạn nghỉ sớm',
    goal: () => ({
      question: 'Anh muốn tự lo được bao nhiêu phần khoảng trống đó bằng tiền tích luỹ riêng?',
      factIds: ['retire_wait_months', 'retire_gap'],
      template: 'Giai đoạn từ lúc anh nghỉ tới khi có lương hưu kéo dài {{retire_wait_months}}, cần khoảng {{retire_gap}}. Anh muốn tự lo được bao nhiêu phần khoảng trống đó bằng tiền tích luỹ riêng?',
      chips: [{ label: 'Toàn bộ', value: '1' }, { label: 'Khoảng một nửa, phần còn lại tính sau', value: '0.5' }],
    }),
    parseGoal: (d, answer, value) => { d.share = Number(value) || (/nửa|một phần/i.test(answer) ? 0.5 : 1); },
    facts(a, d) {
      const gap = (a.factMap.retire_gap?.value || 0) * (d.share || 1);
      const left = monthsUntilPlanned(a);
      const need = gap / left;
      const opts = [0.5, 1, 1.25].map((k) => round50k((need / WEEKS_PER_MONTH) * k));
      d.options = opts;
      const out = [
        F(a, 't_goal_amount', { label: 'Phần anh muốn tự lo', value: gap, unit: 'vnd', formula: 'Khoảng trống hưu trí × tỷ lệ anh chọn' }),
        F(a, 't_months_left', { label: 'Thời gian tới tuổi nghỉ dự định', value: left, unit: 'months', formula: 'Tháng nghỉ dự định − tháng hiện tại' }),
        F(a, 't_need_monthly', { label: 'Cần để dành mỗi tháng (không tính lãi)', value: need, unit: 'vnd', formula: 'Phần muốn tự lo ÷ số tháng còn lại' }),
      ];
      opts.forEach((w, i) => {
        out.push(F(a, `o${i + 1}_weekly`, { label: `Phương án ${i + 1}: để dành mỗi tuần`, value: w, unit: 'vnd', formula: 'Mức đề xuất quanh (cần mỗi tháng ÷ số tuần)' }));
        out.push(F(a, `o${i + 1}_cover`, { label: `Phương án ${i + 1}: lo được tới lúc nghỉ`, value: gap ? Math.min(100, (w * WEEKS_PER_MONTH * left / gap) * 100) : 0, unit: 'percent', formula: 'Mức tuần × 52 ÷ 12 × số tháng còn lại ÷ phần muốn tự lo × 100' }));
      });
      if (d.weekly) out.push(F(a, 'w_weekly', { label: 'Mức để dành mỗi tuần', value: d.weekly, unit: 'vnd', formula: 'Phương án người dùng chọn', source: 'Phiên coaching' }), F(a, 'w_cover', { label: 'Tới lúc nghỉ lo được', value: gap ? Math.min(100, (d.weekly * WEEKS_PER_MONTH * left / gap) * 100) : 0, unit: 'percent', formula: 'Tổng để dành tới lúc nghỉ ÷ phần muốn tự lo × 100' }));
      return out;
    },
    reality: () => ({
      factIds: ['t_goal_amount', 't_months_left', 't_need_monthly'],
      template: 'Thực tế bây giờ: phần anh muốn tự lo là {{t_goal_amount}}, còn {{t_months_left}} tới tuổi nghỉ dự định, nếu chỉ để dành không tính lãi thì mỗi tháng cần khoảng {{t_need_monthly}}. Trên thang {{k_scale}}, với mức cao nhất là anh đã có kế hoạch rõ ràng cho giai đoạn này, anh thấy mình đang ở đâu?',
      question: 'Với mức cao nhất là anh đã có kế hoạch rõ ràng cho giai đoạn này, anh thấy mình đang ở đâu?',
    }),
    knowhowQ: 'Trước đây anh từng kiên trì để dành cho một việc dài hơi nào chưa, và điều gì giúp anh giữ được nhịp?',
    options: () => ({
      factIds: ['o1_weekly', 'o1_cover', 'o2_weekly', 'o2_cover', 'o3_weekly', 'o3_cover'],
      template: 'Engine tính ba mức: để dành {{o1_weekly}} mỗi tuần thì tới lúc nghỉ lo được {{o1_cover}} phần anh muốn; {{o2_weekly}} thì được {{o2_cover}}; {{o3_weekly}} thì được {{o3_cover}}. Mức nào anh giữ được lâu dài mà không thấy quá sức?',
      question: 'Mức nào anh giữ được lâu dài mà không thấy quá sức?',
    }),
    outcome: 'Hình dung tối chủ nhật này anh đã để riêng {{w_weekly}} cho quỹ nghỉ sớm. Điều tốt đẹp nhất anh cảm nhận được lúc đó là gì?',
    will: 'Cam kết tuần này: để riêng {{w_weekly}} vào quỹ nghỉ sớm trước {{w_due}}',
    willTail: 'Giữ đều mức này, tới lúc nghỉ anh lo được {{w_cover}} phần mình muốn. Anh chốt cam kết này chứ?',
    willIds: ['w_weekly', 'w_due', 'w_cover'],
    commitText: (d, vnd, due) => `Để riêng ${vnd(d.weekly)} vào quỹ nghỉ sớm trước ${due}`,
    goalName: () => 'Quỹ cho giai đoạn nghỉ sớm',
  },

  bhxh_gap: {
    name: 'xử lý các tháng BHXH bị thiếu',
    action: true,
    goal: () => ({
      question: 'Anh muốn chuyện này được làm rõ xong trước khi nào?',
      factIds: ['bhxh_gap_list'],
      template: 'Các tháng {{bhxh_gap_list}} đang trống trong lịch sử BHXH. Mình bắt đầu từ đích đến: anh muốn chuyện này được làm rõ xong trước khi nào?',
      chips: [{ label: 'Trong tuần này', value: '7' }, { label: 'Trong tháng này', value: '30' }],
    }),
    parseGoal: (d, answer, value) => { d.days = Number(value) || (/tháng/i.test(answer) ? 30 : 7); },
    facts(a, d) {
      const out = [];
      if (d.actionText) out.push(F(a, 'w_action', { label: 'Việc anh chọn làm', value: d.actionText, unit: 'text', formula: 'Người dùng chọn', source: 'Phiên coaching' }));
      return out;
    },
    reality: () => ({
      factIds: ['bhxh_gap_count', 'bhxh_hist_months'],
      template: 'Thực tế bây giờ: anh đã đóng {{bhxh_hist_months}}, nhưng có {{bhxh_gap_count}} tháng bị trống, có thể do chuyển việc hoặc công ty chậm đóng. Trên thang {{k_scale}}, với mức cao nhất là anh đã biết chắc lý do và cách xử lý, anh thấy mình đang ở đâu?',
      question: 'Với mức cao nhất là anh đã biết chắc lý do và cách xử lý, anh thấy mình đang ở đâu?',
    }),
    knowhowQ: 'Trước đây khi cần làm rõ một giấy tờ hay thủ tục, cách nào đã giúp anh xử lý nhanh nhất?',
    options: () => ({
      factIds: [],
      template: 'Có ba cách để bắt đầu: hỏi phòng nhân sự nơi anh làm vào giai đoạn đó, tự tra cứu quá trình đóng trên ứng dụng VssID, hoặc mang sổ tới cơ quan BHXH để đối chiếu. Cách nào anh chắc chắn làm được ngay tuần này?',
      question: 'Cách nào anh chắc chắn làm được ngay tuần này?',
      chips: ['Hỏi phòng nhân sự công ty lúc đó', 'Tra cứu trên ứng dụng VssID', 'Tới cơ quan BHXH đối chiếu'],
    }),
    outcome: 'Hình dung cuối tuần này anh đã làm xong việc "{{w_action}}". Điều tốt đẹp nhất anh cảm nhận được lúc đó là gì?',
    will: 'Cam kết: {{w_action}} trước {{w_due}}',
    willTail: 'Làm xong bước này, anh sẽ biết các tháng trống có truy đóng được không. Anh chốt cam kết này chứ?',
    willIds: ['w_action', 'w_due'],
    commitText: (d, vnd, due) => `${d.actionText} trước ${due}`,
    goalName: () => 'Làm rõ tháng BHXH bị thiếu',
    obstacles: { 'Hay quên': ['Nếu tới tối thứ tư mà chưa làm, thì tôi sẽ làm ngay trước khi ngủ'], 'Ngại thủ tục giấy tờ': ['Nếu thấy ngại, thì tôi sẽ chỉ làm bước đầu tiên trong mười lăm phút'], 'Không biết hỏi ai': ['Nếu chưa biết hỏi ai, thì tôi sẽ gọi tổng đài BHXH trước'] },
  },
};

export const knowhowChips = (topic) => (KNOWHOW_CHIPS[topic] || KNOWHOW_CHIPS.goal).map((x) => ({ label: x, value: x }));
