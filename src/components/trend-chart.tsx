'use client';

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { TrendPoint } from '@/lib/queries/ads';

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}tr` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <div className="empty" style={{ padding: '40px 20px' }}>Chưa có dữ liệu để vẽ.</div>;
  }

  // Ngày hiển thị dạng DD/MM — trục x nhiều mốc, để nguyên YYYY-MM-DD thì chồng chữ.
  const rows = data.map((d) => ({ ...d, label: `${d.date.slice(8)}/${d.date.slice(5, 7)}` }));

  return (
    <div style={{ width: '100%', height: 250, padding: '14px 8px 4px' }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--dim)' }}
                 axisLine={{ stroke: 'var(--line)' }} tickLine={false} interval="preserveStartEnd" />
          <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: 'var(--dim)' }}
                 axisLine={false} tickLine={false} tickFormatter={short} width={48} />
          <YAxis yAxisId="cpa" orientation="right" tick={{ fontSize: 11, fill: 'var(--amb)' }}
                 axisLine={false} tickLine={false} tickFormatter={short} width={48} />
          <Tooltip
            contentStyle={{
              background: 'var(--card)', border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-sm)', fontSize: 12.5,
            }}
            labelStyle={{ color: 'var(--dim)', marginBottom: 4 }}
            formatter={(value, name) => {
              // recharts khai value là ValueType|undefined — ép an toàn thay vì
              // ép kiểu bừa, vì tooltip có thể gọi với mục chưa có dữ liệu.
              const n = typeof value === 'number' ? value : Number(value ?? 0);
              return [vnd(n), String(name)];
            }}
          />
          <Bar yAxisId="spend" dataKey="spend" name="Chi tiêu" fill="var(--acc)"
               radius={[3, 3, 0, 0]} maxBarSize={22} opacity={0.85} />
          <Line yAxisId="cpa" type="monotone" dataKey="cpa" name="CPA"
                stroke="var(--amb)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
