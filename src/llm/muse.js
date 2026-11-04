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
export async function museChat(messages, { temperature = 0.4, maxTokens = 500, timeoutMs = 20000 } = {}) {
  if (!museEnabled()) return { text: null, error: 'META_API_KEY chưa được đặt' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${MUSE_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.META_API_KEY}`,
      },
      body: JSON.stringify({ model: MUSE_MODEL, messages, temperature, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { text: null, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return { text: typeof text === 'string' ? text.trim() : null, error: text ? null : 'Phản hồi rỗng' };
  } catch (e) {
    return { text: null, error: e.name === 'AbortError' ? 'Hết thời gian chờ' : e.message };
  } finally {
    clearTimeout(t);
  }
}
