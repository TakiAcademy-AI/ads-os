'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KINDS, KIND_LABEL, type AutomationKind } from '@/lib/configs/schema';
import type { AutomationConfigRow } from '@/lib/queries/configs';
import { NewConfigModal, type EditingConfig } from './new-config-modal';

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'tag-ok', label: 'Đang chạy' },
  paused: { cls: 'tag-hold', label: 'Tạm dừng' },
  draft: { cls: 'tag-hold', label: 'Nháp — chưa chạy' },
};

/** Loại có thể ghi lên tài khoản quảng cáo. metric_sync chỉ đọc. */
const HAS_MODE: AutomationKind[] = ['auto_pause', 'budget_schedule', 'post_trigger'];

function isLive(c: AutomationConfigRow): boolean {
  return (c.params as { mode?: string } | null)?.mode === 'live';
}

/** Hậu quả của việc bật cấu hình này ở chế độ ghi thật, nói bằng tiếng người. */
function liveConsequence(kind: AutomationKind): string {
  switch (kind) {
    case 'auto_pause': return 'TẮT chiến dịch thật trong tài khoản';
    case 'budget_schedule': return 'ĐỔI NGÂN SÁCH thật của chiến dịch';
    case 'post_trigger': return 'TẠO chiến dịch thật (luôn ở trạng thái tạm dừng)';
    default: return 'thay đổi tài khoản quảng cáo';
  }
}

/** Tóm tắt params thành một dòng đọc được trong bảng. */
function detail(c: AutomationConfigRow): string {
  const p = (c.params ?? {}) as Record<string, unknown>;
  switch (c.kind) {
    case 'auto_pause': {
      const targets = Array.isArray(p.targets) ? p.targets.length : 0;
      const guarded = Array.isArray(p.protectedCampaignIds) ? p.protectedCampaignIds.length : 0;
      return `${targets} ngưỡng CPA · ${guarded} chiến dịch được bảo vệ · `
        + `tối đa ${p.maxPausesPerRun ?? 3} lần tắt/lượt`;
    }
    case 'metric_sync':
      return `nhìn lại ${p.lookbackDays ?? 30} ngày · cấp ${p.level ?? 'campaign'}`;
    case 'budget_schedule': {
      const slots = Array.isArray(p.slots)
        ? (p.slots as { startHour: number; endHour: number; percent: number }[])
        : [];
      if (slots.length === 0) return 'chưa đặt khung giờ nào';
      // Hiện luôn phần trăm — "2 khung giờ" không cho biết nó định làm gì.
      return slots.map((s) => `${s.startHour}-${s.endHour}h ${s.percent}%`).join(' · ');
    }
    case 'post_trigger': {
      const kw = Array.isArray(p.keywords) ? p.keywords.length : 0;
      const budget = typeof p.dailyBudgetMicros === 'number'
        ? `${Math.round(p.dailyBudgetMicros / 1_000_000).toLocaleString('vi-VN')}đ/ngày` : '';
      return [
        p.pageName ? `Page ${p.pageName}` : 'chưa chọn Page',
        `${kw} từ khoá (khớp ${p.matchMode === 'all' ? 'tất cả' : 'bất kỳ'})`,
        budget,
      ].filter(Boolean).join(' · ');
    }
    default:
      return '';
  }
}

/** "3 phút trước", "2 giờ trước"… Người dùng cần biết bot có thật sự chạy không. */
function ago(iso: string | null): string {
  if (!iso) return 'chưa chạy lần nào';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

/**
 * Cấu hình bật nhưng chưa chạy sau hai chu kỳ = bộ hẹn giờ có vấn đề.
 *
 * Đây là kiểu hỏng tệ nhất của sản phẩm này: giao diện xanh "Đang chạy" trong
 * khi không có gì chạy, và người dùng tin rằng bot đang canh CPA hộ mình.
 */
function isStale(c: AutomationConfigRow): boolean {
  if (c.status !== 'active') return false;
  const limit = c.intervalMinutes * 2 * 60_000;
  if (!c.lastRunAt) return Date.now() - new Date(c.createdAt).getTime() > limit;
  return Date.now() - new Date(c.lastRunAt).getTime() > limit;
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
  const [editing, setEditing] = useState<EditingConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return configs.filter(
      (c) =>
        (filter === 'all' || c.kind === filter) &&
        (!needle || c.name.toLowerCase().includes(needle) ||
         c.accountName.toLowerCase().includes(needle)),
    );
  }, [configs, filter, q]);

  async function send(c: AutomationConfigRow, body: object, method = 'PATCH') {
    setBusy(c.id);
    setError('');
    const res = await fetch(`/api/configs/${c.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify(body),
    });
    setBusy(null);
    if (res.ok) router.refresh();
    // Lỗi hiện ngay trong trang chứ không phải alert() — thông báo quan trọng
    // nhất ở đây ("đã có cấu hình tắt ads đang chạy") cần đọc kỹ rồi làm theo.
    else setError((await res.json().catch(() => ({}))).error ?? 'Thao tác thất bại');
  }

  function toggle(c: AutomationConfigRow) {
    const next = c.status === 'active' ? 'paused' : 'active';
    // Bật một cấu hình đang ở chế độ ghi thật = cho phép tiêu tiền ngay lượt sau.
    if (next === 'active' && isLive(c)) {
      const ok = window.confirm(
        `Bật "${c.name}" ở chế độ GHI THẬT?\n\n`
        + `Bot sẽ ${liveConsequence(c.kind)} trong tài khoản ${c.accountName}, `
        + `mỗi ${c.intervalMinutes} phút một lượt.\n\n`
        + `Muốn chạy thử trước thì bấm Huỷ rồi đổi sang chế độ chạy thử.`,
      );
      if (!ok) return;
    }
    void send(c, { status: next });
  }

  function switchMode(c: AutomationConfigRow) {
    const toLive = !isLive(c);
    if (toLive) {
      const ok = window.confirm(
        `Chuyển "${c.name}" sang GHI THẬT?\n\n`
        + `Từ lượt chạy tiếp theo, bot sẽ ${liveConsequence(c.kind)} `
        + `trong tài khoản ${c.accountName}.\n\n`
        + `Mọi thay đổi vẫn được ghi vào Nhật ký và có thể xem lại.`,
      );
      if (!ok) return;
    }
    void send(c, { mode: toLive ? 'live' : 'dry_run' });
  }

  function remove(c: AutomationConfigRow) {
    const ok = window.confirm(
      `Xoá cấu hình "${c.name}"?\n\n`
      + `Không khôi phục được. Nhật ký thay đổi đã ghi vẫn giữ nguyên.`,
    );
    if (!ok) return;
    void send(c, {}, 'DELETE');
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

        {error && <div className="err" style={{ margin: '14px 18px 0' }}>{error}</div>}

        {/* Nháp KHÔNG chạy. Ghi chú trong modal nằm cuối một form dài nên người
            dùng tạo xong rồi ngồi đợi mãi không thấy gì xảy ra. */}
        {shown.some((c) => c.status === 'draft') && (
          <div style={{
            background: 'var(--amb-soft)', color: 'var(--amb)', fontSize: 12.5,
            padding: '11px 14px', borderRadius: 'var(--r)', margin: '14px 18px 0',
            lineHeight: 1.55,
          }}>
            <b>{shown.filter((c) => c.status === 'draft').length} cấu hình đang ở trạng
            thái Nháp và chưa chạy lần nào.</b>{' '}
            Bấm <b>Bật</b> ở cột Thao tác để bắt đầu. Cấu hình mới luôn tạo ra ở dạng
            nháp để bạn xem lại trước.
          </div>
        )}

        {shown.length === 0 ? (
          <div className="empty">
            {configs.length === 0 ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  Chưa có cấu hình nào. Cấu hình là thứ khiến Ads OS tự làm việc
                  thay bạn — không có cấu hình thì hệ thống chỉ hiển thị số liệu.
                </div>
                <button className="btn" onClick={() => setOpen(true)}>
                  Tạo cấu hình đầu tiên
                </button>
              </>
            ) : 'Không có cấu hình nào khớp bộ lọc.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tên cấu hình</th>
                <th>Loại</th>
                <th>Chi tiết</th>
                <th>Tần suất</th>
                <th>Chạy lần cuối</th>
                <th>Trạng thái</th>
                <th className="n">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const st = STATUS[c.status] ?? STATUS.draft!;
                const live = isLive(c);
                const stale = isStale(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-title">{c.name}</div>
                      <div className="cell-sub">{c.accountName}</div>
                    </td>
                    <td><span className="tag tag-mute">{KIND_LABEL[c.kind]}</span></td>
                    <td style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{detail(c)}</td>
                    <td className="mono" style={{ color: 'var(--dim)' }}>{c.intervalMinutes} phút</td>
                    <td style={{ fontSize: 12.5, color: stale ? 'var(--red)' : 'var(--ink-2)' }}>
                      {ago(c.lastRunAt)}
                      {stale && (
                        <div className="note" style={{ color: 'var(--red)', marginTop: 2 }}>
                          Đang bật nhưng chưa chạy — kiểm tra bộ hẹn giờ
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <span className={`tag ${st.cls}`}>{st.label}</span>
                        {/* Chế độ phải nổi bật ngang trạng thái: nó quyết định
                            tiền có bị tiêu hay không. */}
                        {HAS_MODE.includes(c.kind) && (
                          <span className={`tag ${live ? 'tag-over' : 'tag-mute'}`}>
                            {live ? 'GHI THẬT' : 'chạy thử'}
                          </span>
                        )}
                      </div>
                      {c.lastError && <div className="note" style={{ color: 'var(--red)' }}>{c.lastError}</div>}
                    </td>
                    <td className="n">
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '5px 11px' }}
                          disabled={busy === c.id}
                          onClick={() => toggle(c)}
                        >
                          {busy === c.id ? '…' : c.status === 'active' ? 'Tạm dừng' : 'Bật'}
                        </button>
                        {HAS_MODE.includes(c.kind) && (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '5px 11px' }}
                            disabled={busy === c.id}
                            onClick={() => switchMode(c)}
                            title={live ? 'Chuyển về chạy thử' : 'Chuyển sang ghi thật'}
                          >
                            {live ? '→ chạy thử' : '→ ghi thật'}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '5px 11px' }}
                          disabled={busy === c.id}
                          onClick={() => setEditing({
                            id: c.id, kind: c.kind, name: c.name,
                            adAccountId: c.adAccountId,
                            intervalMinutes: c.intervalMinutes, params: c.params,
                          })}
                        >
                          Sửa
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '5px 11px', color: 'var(--red)' }}
                          disabled={busy === c.id}
                          onClick={() => remove(c)}
                        >
                          Xoá
                        </button>
                      </div>
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

      {editing && (
        // key ép React dựng lại từ đầu khi đổi sang cấu hình khác — không có nó
        // thì state cũ còn nguyên và form hiện số của cấu hình vừa đóng.
        <NewConfigModal
          key={editing.id}
          accounts={accounts}
          campaigns={campaigns}
          currentAccountId={currentAccountId}
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}
