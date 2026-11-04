// AGENT KIỂM CHỨNG: soát lại bản nháp trước khi tới tay người dùng.
// - Mọi con số phải đến từ placeholder {{fact_id}} có thật trong engine.
// - Có chữ số hoặc số viết bằng chữ ngoài placeholder → chặn bản nháp AI, dùng lời dẫn mẫu.
// - Fact được thay bằng giá trị engine, kèm nguồn, ngày dữ liệu, công thức.

const PH = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const NUMBER_WORDS = /(^|[\s,.;:(])(mười|mươi|trăm|nghìn|ngàn|triệu|tỷ|tỉ|phần trăm)(?=$|[\s,.;:)!?])/i;

export function checkDraft(raw, factMap) {
  const issues = [];
  const ids = [...raw.matchAll(PH)].map((m) => m[1]);
  const unknown = ids.filter((id) => !factMap[id]);
  if (unknown.length) issues.push(`Placeholder không tồn tại trong engine: ${unknown.join(', ')}`);
  const stripped = raw.replace(PH, '');
  const digits = stripped.match(/\d[\d.,]*/g);
  if (digits) issues.push(`Có số không do engine cung cấp: ${digits.slice(0, 5).join(', ')}`);
  const words = stripped.match(NUMBER_WORDS);
  if (words) issues.push(`Có số viết bằng chữ: "${words[2]}"`);
  return { ok: issues.length === 0, issues, ids };
}

function toSegments(text) {
  const segs = [];
  let last = 0;
  for (const m of text.matchAll(PH)) {
    if (m.index > last) segs.push({ t: 'text', v: text.slice(last, m.index) });
    segs.push({ t: 'fact', id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ t: 'text', v: text.slice(last) });
  return segs;
}

/**
 * @param {{raw:string, mode:string, template:string, error?:string}} d bản nháp từ Agent Coach
 * @param {object} factMap fact của engine
 * @param {{question?:string, factIds?:string[]}} opts
 */
export function verify(d, factMap, { question, factIds = [] } = {}) {
  const checks = [];
  let text = (d.raw || '').replace(/\*\*/g, '').trim();
  let mode = d.mode;
  let res = checkDraft(text, factMap);
  if (!res.ok && mode === 'ai') {
    checks.push({ ok: false, msg: `Chặn bản nháp AI: ${res.issues.join('; ')}` });
    text = d.template;
    mode = 'template';
    res = checkDraft(text, factMap);
  }
  if (!res.ok) {
    // lời dẫn mẫu cũng không được lọt số lạ: gỡ placeholder sai
    checks.push({ ok: false, msg: `Lời dẫn mẫu lỗi: ${res.issues.join('; ')}` });
    text = text.replace(PH, (m, id) => (factMap[id] ? m : '')).replace(/\d[\d.,]*/g, '…');
  } else {
    checks.push({ ok: true, msg: 'Không có số nào ngoài fact của engine' });
  }
  if (question && !text.includes('?')) {
    text = `${text} ${question}`.trim();
    checks.push({ ok: true, msg: 'Bổ sung câu hỏi GROW còn thiếu' });
  }
  const segments = toSegments(text);
  const used = [...new Set([...segments.filter((s) => s.t === 'fact').map((s) => s.id), ...factIds])].filter((id) => factMap[id]);
  checks.push({ ok: true, msg: `${used.length} con số kèm nguồn, ngày dữ liệu, công thức` });
  return {
    segments,
    facts: used.map((id) => factMap[id]),
    aiMode: mode,
    aiError: d.error || null,
    verification: { passed: checks.every((c) => c.ok) || mode === 'template', checks },
  };
}
