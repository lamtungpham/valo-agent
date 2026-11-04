import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify, checkDraft } from '../src/agents/verifier.js';
import { fact, toMap } from '../src/engine/facts.js';

const facts = toMap([
  fact('ef_months', { label: 'Quỹ dự phòng đủ dùng', value: 1.6, unit: 'months' }),
  fact('ef_balance', { label: 'Số dư', value: 20000000, unit: 'vnd' }),
]);
const template = 'Quỹ của anh đủ {{ef_months}}.';

test('Bản nháp AI chỉ dùng placeholder thì được giữ', () => {
  const v = verify({ raw: 'Quỹ dự phòng hiện đủ {{ef_months}}, khá mỏng. Anh muốn đích đến là gì?', mode: 'ai', template }, facts);
  assert.equal(v.aiMode, 'ai');
  assert.ok(v.segments.some((s) => s.t === 'fact' && s.id === 'ef_months'));
});

test('Bản nháp AI tự viết số bị chặn, thay bằng lời dẫn mẫu', () => {
  const v = verify({ raw: 'Quỹ của anh đủ 2 tháng, nên để thêm 5 triệu.', mode: 'ai', template }, facts);
  assert.equal(v.aiMode, 'template');
  assert.equal(v.verification.checks[0].ok, false);
});

test('Số viết bằng chữ và placeholder bịa đều bị phát hiện', () => {
  assert.equal(checkDraft('Anh nên để thêm năm triệu', facts).ok, false);
  assert.equal(checkDraft('Đủ {{ef_years}}', facts).ok, false);
  assert.equal(checkDraft('Đủ {{ef_months}} chi tiêu', facts).ok, true);
});

test('Thiếu câu hỏi GROW thì được bổ sung', () => {
  const v = verify({ raw: 'Quỹ đủ {{ef_months}}.', mode: 'ai', template }, facts, { question: 'Anh muốn đủ bao nhiêu tháng?' });
  assert.ok(v.segments.map((s) => s.v || '').join('').includes('Anh muốn đủ bao nhiêu tháng?'));
});
