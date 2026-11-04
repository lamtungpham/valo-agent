// Adapter Valo API THẬT: đọc định dạng "valo-financial-context" v4.0 qua HTTP hoặc từ file xuất.
// Cấu hình bằng biến môi trường (xem .env.example):
//   VALO_API_BASE_URL   ví dụ https://valo.example.com/api  → GET {base}/financial-context
//   VALO_API_TOKEN      Bearer token (tuỳ chọn)
//   VALO_CONTEXT_FILE   đường dẫn file JSON xuất từ Valo (thay cho HTTP)
// Lỗi bất kỳ → Agent Thu thập rơi về MockValoAdapter, có ghi nhãn lý do.
import { readFileSync } from 'node:fs';
import { ValoDataAdapter, validateSnapshot } from './valoAdapter.js';
import { mapValoContext } from './valoContextMapper.js';

export class HttpValoAdapter extends ValoDataAdapter {
  constructor({ baseUrl, token, file, timeoutMs = 8000 } = {}) {
    super();
    this.baseUrl = baseUrl;
    this.token = token;
    this.file = file;
    this.timeoutMs = timeoutMs;
  }
  describe() { return this.file ? `Valo (file xuất: ${this.file})` : `Valo API (${this.baseUrl})`; }

  async fetchContext() {
    if (this.file) return JSON.parse(readFileSync(this.file, 'utf8'));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/financial-context`, {
        headers: { Accept: 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Valo API trả HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Valo API hết thời gian chờ' : e.message);
    } finally {
      clearTimeout(t);
    }
  }

  async getSnapshot() {
    const ctx = await this.fetchContext();
    return validateSnapshot(mapValoContext(ctx, { label: this.file ? 'Dữ liệu Valo (file xuất)' : 'Dữ liệu Valo API' }));
  }
}
