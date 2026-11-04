// Kiểm tra kết nối Muse Spark: npm run check:ai
// In ra hình dạng phản hồi (KHÔNG in key) để chẩn đoán khi coach báo "Lời dẫn mẫu".
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const base = (process.env.META_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/$/, '');
const model = process.env.META_MODEL || 'muse-spark-1.3';
if (!process.env.META_API_KEY) { console.log('Chưa có META_API_KEY trong .env'); process.exit(1); }
console.log(`Gọi ${base}/chat/completions với model ${model} ...`);
const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.META_API_KEY}` },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Chào bằng một câu tiếng Việt ngắn.' }], max_tokens: 2000 }),
});
const text = await res.text();
console.log('HTTP', res.status);
try {
  const j = JSON.parse(text);
  const redact = (o) => JSON.stringify(o, null, 2).slice(0, 2500);
  console.log(redact(j));
  const { extractText } = await import('../src/llm/muse.js');
  console.log('\nValo Agent đọc được nội dung:', extractText(j) ?? '(KHÔNG)');
} catch {
  console.log(text.slice(0, 1500));
}
