'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KINDS, KIND_LABEL, type AutomationKind } from '@/lib/configs/schema';
import type { AutomationConfigRow } from '@/lib/queries/configs';
import { NewConfigModal } from './new-config-modal';

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'tag-ok', label: 'Đang chạy' },
  paused: { cls: 'tag-hold', label: 'Tạm dừng' },
  draft: { cls: 'tag-mute', label: 'Nháp' },
};

/** Tóm tắt params thành một dòng đọc được trong bảng. */
function detail(c: AutomationConfigRow): string {
  const p = (c.params ?? {}) as Record<string, unknown>;
  switch (c.kind) {
    case 'auto_pause': {
      const targets = Array.isArray(p.targets) ? p.targets.length : 0;
      const guarded = Array.isArray(p.protectedCampaignIds) ? p.protectedCampaignIds.length : 0;
      return `${targets} ngưỡng CPA · ${guarded} chiến dịch được bảo vệ · ` +
        `${p.mode === 'live' ? 'ghi thật' : 'chạy thử'}`;
    }
    case 'metric_sync':
      return `nhìn lại ${p.lookbackDays ?? 30} ngày · cấp ${p.level ?? 'campaign'}`;
    case 'budget_schedule':
      return `${Array.isArray(p.slots) ? p.slots.length : 0} khung giờ`;
    case 'post_trigger':
      return `${Array.isArray(p.keywords) ? p.keywords.length : 0} từ khoá · ` +
        `khớp ${p.matchMode === 'all' ? 'tất cả' : 'bất kỳ'}`;
    default:
      return '';
  }
}

export function ConfigBrowser({
  configs,
  accounts,
  campaigns,
  currentAccountId,
}: {
  configs: AutomationConfigRow[];
  accounts: { id: string; name: string; platform: string }[];
  campaigns: Record<string, { id: string; name: string; objective: string }[]>;
  currentAccountId: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<AutomationKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return configs.filter(
      (c) =>
        (filter === 'all' || c.kind === filter) &&
        (!needle || c.name.toLowerCase().includes(needle) ||
         c.accountName.toLowerCase().includes(needle)),
    );
  }, [configs, filter, q]);

  async function toggle(c: AutomationConfigRow) {
    setBusy(c.id);
    const next = c.status === 'active' ? 'paused' : 'active';
    const res = await fetch(`/api/configs/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error ?? 'Không đổi được trạng thái');
  }

  return (
    <>
      <div className="card">
        <div className="card-head" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Tìm cấu hình…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: '0 1 240px', padding: '7px 12px', fontSize: 13,
              border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
              fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {(['all', ...KINDS] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k as AutomationKind | 'all')}
                className={filter === k ? 'btn' : 'btn btn-ghost'}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                {k === 'all' ? 'Tất cả' : KIND_LABEL[k as AutomationKind]}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setOpen(true)}>+ Thêm cấu hình</button>
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            {configs.length === 0 ? 'Chưa có cấu hình nào.' : 'Không có cấu hình nào khớp bộ lọc.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tên cấu hình</th>
                <th>Loại</th>
                <th>Chi tiết</th>
                <th>Tần suất</th>
                <th>Trạng thái</th>
                <th className="n">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const st = STATUS[c.status] ?? STATUS.draft!;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-title">{c.name}</div>
                      <div className="cell-sub">{c.accountName}</div>
                    </td>
                    <td><span className="tag tag-mute">{KIND_LABEL[c.kind]}</span></td>
                    <td style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{detail(c)}</td>
                    <td className="mono" style={{ color: 'var(--dim)' }}>{c.intervalMinutes} phút</td>
                    <td>
                      <span className={`tag ${st.cls}`}>{st.label}</span>
                      {c.lastError && <div className="note" style={{ color: 'var(--red)' }}>{c.lastError}</div>}
                    </td>
                    <td className="n">
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '5px 11px' }}
                        disabled={busy === c.id}
                        onClick={() => toggle(c)}
                      >
                        {busy === c.id ? '…' : c.status === 'active' ? 'Tạm dừng' : 'Bật'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <NewConfigModal
          accounts={accounts}
          campaigns={campaigns}
          currentAccountId={currentAccountId}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}
