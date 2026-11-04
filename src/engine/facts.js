// Lớp ENGINE: mọi con số hiển thị cho người dùng đều đi qua đây.
// Mỗi "fact" mang theo giá trị, cách hiển thị, công thức, nguồn và ngày dữ liệu,
// để giao diện luôn trưng được "số này từ đâu ra".

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

export function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  switch (unit) {
    case 'vnd': return `${nf0.format(Math.round(value))} đ`;
    case 'months': return `${nf1.format(value)} tháng`;
    case 'years': return `${nf1.format(value)} năm`;
    case 'percent': return `${nf1.format(value)}%`;
    case 'age': return `${nf1.format(value)} tuổi`;
    case 'count': return nf0.format(value);
    case 'text':
    default: return String(value);
  }
}

export function fact(id, { label, value, unit = 'text', formula, source, asOf, display }) {
  return {
    id,
    label,
    value,
    unit,
    display: display ?? formatValue(value, unit),
    formula: formula || '',
    source: source || '',
    asOf: asOf || '',
  };
}

export function toMap(facts) {
  const m = {};
  for (const f of facts) m[f.id] = f;
  return m;
}
