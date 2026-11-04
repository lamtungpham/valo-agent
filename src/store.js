// Hồ sơ coaching bền vững: lưu JSON trên đĩa (data/store.json, đã gitignore).
// Phiên sau mở lại đúng chỗ phiên trước dừng.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

// Trên Vercel chỉ /tmp ghi được (tạm thời, mất khi máy chủ khởi động lại)
const FILE = process.env.VALO_AGENT_STORE || (process.env.VERCEL ? '/tmp/valo-agent-store.json' : new URL('../data/store.json', import.meta.url).pathname);

export const START_DATE = '2026-11-04';

function freshUser(id) {
  return {
    id,
    dataset: 'mr-sample',
    simDate: START_DATE, // đồng hồ mô phỏng để demo vòng lặp theo thời gian
    overrides: {}, // dữ liệu người dùng chỉnh tay (mô phỏng "dữ liệu đổi")
    plannedRetirementAge: null,
    goals: [], // mục tiêu coaching do agent/người dùng tạo
    commitments: [], // {id, text, amount, createdAt, dueDate, status: open|done|missed, goal, note}
    violations: [], // {commitmentId, date, reason}
    reminders: [],
    session: null, // phiên GROW đang dở
    sessions: [], // lịch sử phiên đã xong (tóm tắt)
    chat: [], // tin nhắn hiển thị
    alerts: [], // cảnh báo chủ động đã phát
    alertKeys: {}, // chống lặp: key → giá trị đã báo
    summaries: [], // tóm tắt định kỳ
    lastSummaryDate: null,
    valoImport: null, // dữ liệu dán từ app Valo (chỉ lưu trên máy chạy app, đã gitignore)
    readiness: null, // giai đoạn sẵn sàng gần nhất (Stages of Change)
    onboarding: null, // nhánh chưa dùng Valo
    trace: [], // nhật ký multi-agent gần nhất
  };
}

let db = null;

function load() {
  if (db) return db;
  try {
    db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { users: {} };
  } catch {
    db = { users: {} };
  }
  return db;
}

export function getUser(id = 'mr-sample') {
  const d = load();
  if (!d.users[id]) d.users[id] = freshUser(id);
  const u = d.users[id];
  // bổ sung khoá mới nếu hồ sơ cũ thiếu
  const f = freshUser(id);
  for (const k of Object.keys(f)) if (u[k] === undefined) u[k] = f[k];
  return u;
}

export function save() {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(load(), null, 2));
  renameSync(tmp, FILE);
}

export function resetUser(id = 'mr-sample') {
  const d = load();
  d.users[id] = freshUser(id);
  save();
  return d.users[id];
}

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
