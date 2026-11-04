// Chọn adapter. Bộ dữ liệu "valo" dùng Valo API thật (cấu hình qua biến môi trường);
// lỗi hoặc chưa cấu hình → rơi về mock có ghi nhãn lý do. Hai bộ "mr-sample*" luôn là mock hư cấu.
import { MockValoAdapter } from './mockAdapter.js';
import { HttpValoAdapter } from './httpAdapter.js';
import { mapValoContext } from './valoContextMapper.js';
import { validateSnapshot } from './valoAdapter.js';

let lastError = null;

export function realConfigured() {
  return Boolean(process.env.VALO_API_BASE_URL || process.env.VALO_CONTEXT_FILE);
}

function realAdapter() {
  return new HttpValoAdapter({
    baseUrl: process.env.VALO_API_BASE_URL,
    token: process.env.VALO_API_TOKEN,
    file: process.env.VALO_CONTEXT_FILE,
  });
}

export function adapterStatus() {
  if (!realConfigured()) return { mode: 'mock', configured: false, label: 'Mock: dữ liệu hư cấu Mr. Sample (chưa đặt VALO_API_BASE_URL hoặc VALO_CONTEXT_FILE)' };
  const d = realAdapter().describe();
  return lastError
    ? { mode: 'fallback', configured: true, label: `${d} lỗi, đang dùng mock có nhãn`, error: lastError }
    : { mode: 'valo', configured: true, label: d };
}

/** Thử Valo thật, lỗi thì dùng mock và ghi rõ lý do. */
class FallbackAdapter {
  constructor(primary) { this.primary = primary; }
  describe() { return this.primary.describe(); }
  async getSnapshot(userId) {
    try {
      const s = await this.primary.getSnapshot(userId);
      lastError = null;
      return s;
    } catch (e) {
      lastError = e.message;
      return new MockValoAdapter({ dataset: 'mr-sample', fallbackReason: e.message }).getSnapshot(userId);
    }
  }
}

/** Dữ liệu người dùng tự dán/tải từ Valo (nút "Sao chép dữ liệu" trong Cố vấn AI của Valo). */
class ImportedValoAdapter {
  constructor(imported) { this.imported = imported; }
  describe() { return 'Valo (dữ liệu dán từ app Valo)'; }
  async getSnapshot() {
    if (!this.imported?.ctx) return new MockValoAdapter({ dataset: 'mr-sample', fallbackReason: 'Chưa dán dữ liệu Valo' }).getSnapshot();
    try {
      const s = mapValoContext(this.imported.ctx, { label: `Dữ liệu Valo (dán lúc ${this.imported.at})` });
      s.meta.source = 'valo-import';
      return validateSnapshot(s);
    } catch (e) {
      return new MockValoAdapter({ dataset: 'mr-sample', fallbackReason: `Dữ liệu dán không hợp lệ: ${e.message}` }).getSnapshot();
    }
  }
}

export function getAdapter({ dataset, imported } = {}) {
  if (dataset === 'valo-import') return new ImportedValoAdapter(imported);
  if (dataset === 'valo') {
    if (!realConfigured()) return new MockValoAdapter({ dataset: 'mr-sample', fallbackReason: 'Chưa cấu hình VALO_API_BASE_URL hoặc VALO_CONTEXT_FILE' });
    return new FallbackAdapter(realAdapter());
  }
  return new MockValoAdapter({ dataset });
}
