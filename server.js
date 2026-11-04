// Valo Agent: máy chủ HTTP không phụ thuộc thư viện ngoài. Chạy: npm start
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUser, save, resetUser } from './src/store.js';
import { startSession, reply, onDataChange, markCommitment, viewState, archiveChat } from './src/agents/orchestrator.js';
import { addDays } from './src/agents/analyst.js';
import { museStatus } from './src/llm/muse.js';
import { adapterStatus } from './src/adapters/index.js';
import { runTool } from './src/agents/tools.js';
import { mapValoContext } from './src/adapters/valoContextMapper.js';
import { progress } from './src/progress.js';

// Nạp .env nếu có (không bắt buộc), không ghi đè biến đã đặt sẵn
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.json': 'application/json' };

const json = (res, code, body) => {
  // Chế độ luồng: các dòng tiến trình đã gửi trước, dòng cuối là kết quả
  if (res.__stream) { res.end(JSON.stringify({ type: 'done', code, body }) + '\n'); return; }
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  // Trên Vercel, body có thể đã được đọc sẵn vào req.body
  if (req.body !== undefined) return typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : req.body || {};
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 100000) throw new Error('Body quá lớn'); }
  return s ? JSON.parse(s) : {};
}

const ext = () => ({ muse: museStatus(), adapter: adapterStatus() });

// Chạy cục bộ: một hồ sơ duy nhất. Trên Vercel: mỗi trình duyệt một hồ sơ riêng (cookie va_uid), để khách xem demo không đè lên nhau.
function userId(req, res) {
  if (!process.env.VERCEL) return 'mr-sample';
  const m = /(?:^|;\s*)va_uid=([a-z0-9]{8,32})/.exec(req.headers.cookie || '');
  if (m) return m[1];
  const id = randomBytes(8).toString('hex');
  res.setHeader('Set-Cookie', `va_uid=${id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`);
  return id;
}

async function api(req, res, path) {
  const uid = userId(req, res);
  const user = getUser(uid);
  // Client xin luồng tiến trình (NDJSON): báo từng agent khi nó bắt đầu chạy
  if (String(req.headers.accept || '').includes('application/x-ndjson')) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.__stream = true;
    const send = (agent, detail) => res.write(JSON.stringify({ type: 'stage', agent, detail, at: Date.now() }) + '\n');
    send('Agent chính', 'nhận yêu cầu, điều phối');
    return progress.run(send, () => route(req, res, path, user, uid));
  }
  return route(req, res, path, user, uid);
}

async function route(req, res, path, user, uid) {
  const body = req.method === 'POST' ? await readBody(req) : {};
  const state = async () => json(res, 200, await viewState(user, ext()));

  if (path === '/api/state' && req.method === 'GET') {
    if (!user.chat.length && !user.chatArchive?.length) await onDataChange(user, 'first-open');
    return state();
  }
  if (path === '/api/coach/start') { await startSession(user); return state(); }
  if (path === '/api/coach/reply') {
    if (body.value === 'commit_done') {
      const c = user.commitments.find((x) => x.status === 'open');
      if (c) await markCommitment(user, c.id, 'done');
      return state();
    }
    if (body.value === 'start') { await startSession(user); return state(); }
    await reply(user, body);
    return state();
  }
  if (path === '/api/data/update') {
    const ov = user.overrides;
    for (const k of ['emergencyFund', 'lastMonthSpending', 'monthlyIncome']) {
      if (body[k] !== undefined && body[k] !== '') ov[k] = Math.max(0, Number(body[k]) || 0);
    }
    if (body.plannedRetirementAge) user.plannedRetirementAge = Math.min(75, Math.max(40, Number(body.plannedRetirementAge)));
    await onDataChange(user, 'data-change');
    return state();
  }
  if (path === '/api/dataset') {
    user.dataset = ['mr-sample', 'mr-sample-gap', 'valo', 'valo-import', 'self-report'].includes(body.dataset) ? body.dataset : 'mr-sample';
    await onDataChange(user, 'dataset-change');
    return state();
  }
  if (path === '/api/valo/import') {
    let ctx = body.data;
    if (typeof ctx === 'string') {
      const t = ctx.trim();
      const start = t.indexOf('{');
      const end = t.lastIndexOf('}');
      try { ctx = JSON.parse(t.slice(start, end + 1)); } catch { return json(res, 400, { error: 'Không đọc được JSON. Hãy dán đúng phần dữ liệu Valo đã sao chép.' }); }
    }
    try { mapValoContext(ctx); } catch (e) { return json(res, 400, { error: e.message }); }
    const now = new Date();
    user.valoImport = { ctx, at: now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) };
    user.dataset = 'valo-import';
    user.overrides = {};
    user.alertKeys = {};
    await onDataChange(user, 'valo-import');
    return state();
  }
  if (path === '/api/time/advance') {
    const days = Math.min(30, Math.max(1, Number(body.days) || 1));
    user.simDate = addDays(user.simDate, days);
    await onDataChange(user, `time+${days}d`);
    return state();
  }
  if (path === '/api/commitments/mark') { await markCommitment(user, body.id, body.status); return state(); }
  if (path === '/api/tools/run') { const result = await runTool(user, body); save(); return json(res, 200, { result, state: await viewState(user, ext()) }); }
  if (path === '/api/chat/clear') {
    // cất vào lưu trữ, giữ câu hỏi đang dở nếu còn phiên hoặc đang khai hồ sơ
    archiveChat(user, 'Đã xoá khỏi khung chat', { keepLast: Boolean(user.session || user.onboarding?.active || user.pendingFocus?.length) });
    save();
    return state();
  }
  if (path === '/api/lang') { user.lang = body.lang === 'en' ? 'en' : 'vi'; save(); return state(); }
  if (path === '/api/selfreport/restart') {
    user.selfReport = null;
    user.onboarding = null;
    user.session = null;
    user.dataset = 'self-report';
    await onDataChange(user, 'dataset-change');
    return state();
  }
  if (path === '/api/reset') { resetUser(uid); const u = getUser(uid); await onDataChange(u, 'first-open'); return json(res, 200, await viewState(u, ext())); }
  return json(res, 404, { error: 'Không có endpoint này' });
}

export async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = normalize(join(PUBLIC, p));
    if (!file.startsWith(PUBLIC) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
}

// Chỉ mở cổng khi chạy trực tiếp (npm start); trên Vercel, api/index.js gọi handler.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) createServer(handler).listen(PORT, () => {
  const m = museStatus();
  const a = adapterStatus();
  console.log(`\nValo Agent đang chạy: http://localhost:${PORT}`);
  console.log(`AI: Muse Spark (${m.model}) qua ${m.baseUrl} · ${m.enabled ? 'đã có META_API_KEY' : 'CHƯA có META_API_KEY → dùng lời dẫn mẫu, số liệu vẫn do engine tính'}`);
  console.log(`Dữ liệu: ${a.label}\n`);
});
