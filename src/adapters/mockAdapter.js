// Adapter MOCK: đọc dữ liệu HƯ CẤU "Mr. Sample" trong thư mục fixtures/.
// Luôn gắn nhãn fictional để giao diện hiển thị rõ đây là dữ liệu mẫu.
import { readFileSync } from 'node:fs';
import { ValoDataAdapter, validateSnapshot } from './valoAdapter.js';

const FILES = {
  'mr-sample': 'mr-sample.json',
  'mr-sample-gap': 'mr-sample-gap.json',
};

export class MockValoAdapter extends ValoDataAdapter {
  constructor({ dataset = 'mr-sample', fallbackReason } = {}) {
    super();
    this.dataset = FILES[dataset] ? dataset : 'mr-sample';
    this.fallbackReason = fallbackReason;
  }
  describe() { return `Mock (dữ liệu hư cấu: ${this.dataset})`; }
  async getSnapshot() {
    const raw = JSON.parse(readFileSync(new URL(`../../fixtures/${FILES[this.dataset]}`, import.meta.url), 'utf8'));
    const label = this.dataset === 'mr-sample-gap'
      ? 'DỮ LIỆU HƯ CẤU · Mr. Sample · Bộ test 2 (thiếu 03-05/2022)'
      : 'DỮ LIỆU HƯ CẤU · Mr. Sample · Bộ test 1 (đóng liên tục)';
    return validateSnapshot({
      ...raw,
      meta: { source: 'mock', dataset: this.dataset, label, fictional: true, fallbackReason: this.fallbackReason },
    });
  }
}
