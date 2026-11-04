import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { mapValoContext } from '../src/adapters/valoContextMapper.js';
import { HttpValoAdapter } from '../src/adapters/httpAdapter.js';
import { analyze } from '../src/agents/analyst.js';

const ctx = JSON.parse(readFileSync(new URL('../fixtures/valo-context-sample.json', import.meta.url), 'utf8'));
const user = { simDate: '2026-11-04', commitments: [] };

test('Mapper valo-financial-context → snapshot, engine ra cùng kết quả BHXH', () => {
  const s = mapValoContext(ctx);
  assert.equal(s.profile.birthYM, '1995-05');
  assert.equal(s.socialInsurance.periods.length, 106);
  const a = analyze({ ...s, emergencyFundBalance: 20000000 }, user);
  assert.equal(a.proj.hist.totalMonths, 106);
  assert.equal(a.proj.hist.gapMonths.length, 0);
  assert.equal(a.proj.legal.ym, '05/2057');
  assert.ok(a.events.some((e) => e.key === 'ef_low'));
  assert.equal(a.fin.alloc.total, 131000000);
});

test('Adapter HTTP đọc qua API với Bearer token', async () => {
  let auth = null;
  const srv = createServer((req, res) => { auth = req.headers.authorization; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(ctx)); });
  await new Promise((r) => srv.listen(0, r));
  const ad = new HttpValoAdapter({ baseUrl: `http://localhost:${srv.address().port}/api`, token: 'test-token' });
  const s = await ad.getSnapshot();
  srv.close();
  assert.equal(auth, 'Bearer test-token');
  assert.equal(s.meta.source, 'valo-api');
  assert.equal(s.monthlyIncome, 18000000);
});

test('Valo API lỗi → fallback mock có nhãn lý do', async () => {
  process.env.VALO_API_BASE_URL = 'http://127.0.0.1:9/none';
  const { getAdapter, adapterStatus } = await import('../src/adapters/index.js');
  const s = await getAdapter({ dataset: 'valo' }).getSnapshot();
  assert.equal(s.meta.fictional, true);
  assert.ok(s.meta.fallbackReason);
  assert.equal(adapterStatus().mode, 'fallback');
  delete process.env.VALO_API_BASE_URL;
});
