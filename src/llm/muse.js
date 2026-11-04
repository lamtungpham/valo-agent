// Client Muse Spark qua Meta Model API (tương thích OpenAI Chat Completions).
// Đây là model DUY NHẤT dùng cho tính năng AI của sản phẩm.
// Key lấy từ biến môi trường, không bao giờ hardcode.

export const MUSE_BASE_URL = process.env.META_API_BASE_URL || 'https://api.meta.ai/v1';
export const MUSE_MODEL = process.env.META_MODEL || 'muse-spark-1.3';

export function museEnabled() {
  return Boolean(process.env.META_API_KEY);
}

export function museStatus() {
  return { enabled: museEnabled(), baseUrl: MUSE_BASE_URL, model: MUSE_MODEL };
}

/**
 * Gọi chat completions. Trả về chuỗi nội dung, hoặc null nếu chưa cấu hình key / lỗi mạng
 * (khi đó Agent Coach dùng lời dẫn mẫu và giao diện ghi rõ "chưa có AI").
 */
/** Lấy phần chữ từ message theo nhiều dạng phản hồi tương thích OpenAI. */
export function extractText(json) {
  const msg = json?.choices?.[0]?.message ?? {};
  const c = msg.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (Array.isArray(c)) {
    const t = c.map((p) => (typeof p === 'string' ? p : p?.text ?? p?.content ?? '')).join('').trim();
    if (t) return t;
  }
  if (typeof json?.choices?.[0]?.text === 'string' && json.choices[0].text.trim()) return json.choices[0].text.trim();
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();
  return null;
}

function describeEmpty(json) {
  const ch = json?.choices?.[0];
  const msg = ch?.message ?? {};
  return `Phản hồi rỗng (finish_reason=${ch?.finish_reason ?? '?'}; message có các trường: ${Object.keys(msg).join(', ') || 'không có'}${msg.refusal ? '; refusal: ' + String(msg.refusal).slice(0, 80) : ''})`;
}

/**
 * Gọi chat completions. Trả về chuỗi nội dung, hoặc null nếu chưa cấu hình key / lỗi mạng
 * (khi đó Agent Coach dùng lời dẫn mẫu và giao diện ghi rõ "chưa có AI").
 */
export async function museChat(messages, { temperature = 0.4, maxTokens = Number(process.env.META_MAX_TOKENS) || 8000, timeoutMs = 60000, retried = false, noEffort = false } = {}) {
  if (!museEnabled()) return { text: null, error: 'META_API_KEY chưa được đặt' };
  // Tuỳ chọn: giảm suy luận ngầm để trả lời nhanh hơn (nếu API không nhận tham số này thì tự bỏ đi)
  const effort = noEffort ? null : process.env.META_REASONING_EFFORT || null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${MUSE_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.META_API_KEY}`,
      },
      body: JSON.stringify({ model: MUSE_MODEL, messages, temperature, max_tokens: maxTokens, ...(effort ? { reasoning_effort: effort } : {}) }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (effort && res.status === 400) { clearTimeout(t); return museChat(messages, { temperature, maxTokens, timeoutMs, retried, noEffort: true }); }
      return { text: null, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    const json = await res.json();
    const text = extractText(json);
    if (text) return { text, error: null };
    // Muse Spark suy luận ngầm trước khi viết: nếu hết token khi chưa kịp viết thì gọi lại một lần với ngân sách gấp đôi
    if (!retried && json?.choices?.[0]?.finish_reason === 'length') {
      clearTimeout(t);
      return museChat(messages, { temperature, maxTokens: maxTokens * 2, timeoutMs, retried: true, noEffort });
    }
    return { text: null, error: describeEmpty(json) };
  } catch (e) {
    return { text: null, error: e.name === 'AbortError' ? 'Hết thời gian chờ' : e.message };
  } finally {
    clearTimeout(t);
  }
}
