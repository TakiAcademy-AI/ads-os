'use client';

import { useState } from 'react';
import { KINDS, KIND_LABEL, KIND_DESC, type AutomationKind } from '@/lib/configs/schema';

const IMPLEMENTED: AutomationKind[] = ['auto_pause', 'metric_sync'];

const OBJECTIVES = [
  { value: 'messages', label: 'Tin nhắn', defaultCpa: 120_000 },
  { value: 'leads', label: 'Lead form', defaultCpa: 80_000 },
] as const;

export function NewConfigModal({
  accounts,
  onClose,
  onCreated,
}: {
  accounts: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<AutomationKind>('auto_pause');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [interval, setInterval] = useState(30);
  const [cpa, setCpa] = useState<Record<string, number>>({ messages: 120_000, leads: 80_000 });
  const [attributionDays, setAttributionDays] = useState(7);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const usable = IMPLEMENTED.includes(kind);

  async function submit() {
    setBusy(true);
    setError('');
    const params =
      kind === 'auto_pause'
        ? {
            mode: 'dry_run',
            targets: OBJECTIVES.map((o) => ({
              objective: o.value,
              targetCpaMicros: Math.round((cpa[o.value] ?? o.defaultCpa) * 1_000_000),
              attributionDays,
              minConversions: 10,
              minClicks: 100,
            })),
            protectedCampaignIds: [],
            maxPausesPerRun: 3,
          }
        : { lookbackDays, level: 'campaign' };

    const res = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, adAccountId: accountId, intervalMinutes: interval, params }),
    });
    setBusy(false);
    if (res.ok) onCreated();
    else setError((await res.json().catch(() => ({}))).error ?? 'Không tạo được cấu hình');
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(20,20,40,.32)',
        display: 'grid', placeItems: 'center', padding: 24, zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 780, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="card-head">
          <b style={{ fontSize: 16 }}>Thêm cấu hình mới</b>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '236px 1fr', flex: 1, minHeight: 0 }}>
          <div style={{ borderRight: '1px solid var(--line)', padding: 12, overflowY: 'auto' }}>
            {KINDS.map((k) => {
              const ready = IMPLEMENTED.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  disabled={!ready}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 0,
                    background: kind === k ? 'var(--acc-soft)' : 'transparent',
                    color: kind === k ? 'var(--acc-ink)' : 'var(--ink-2)',
                    borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 4,
                    cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.45,
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {KIND_LABEL[k]}
                    {!ready && <span style={{ fontSize: 9.5, marginLeft: 6, letterSpacing: .4 }}>SẮP CÓ</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 2 }}>{KIND_DESC[k]}</div>
                </button>
              );
            })}
          </div>

          <div style={{ padding: 20, overflowY: 'auto' }}>
            {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="field">
              <label>Tên cấu hình</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                     placeholder={kind === 'auto_pause' ? 'VD: Tắt ads tin nhắn Q4' : 'VD: Đồng bộ hằng ngày'} />
            </div>

            <div className="field">
              <label>Tài khoản quảng cáo</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                      style={{ width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
                               border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
                               background: 'var(--card)', color: 'var(--ink)' }}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Tần suất chạy (phút)</label>
              <input type="number" min={5} max={1440} value={interval}
                     onChange={(e) => setInterval(Number(e.target.value))} />
            </div>

            {kind === 'auto_pause' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 500, margin: '18px 0 8px' }}>Ngưỡng CPA</div>
                {OBJECTIVES.map((o) => (
                  <div className="field" key={o.value}>
                    <label>{o.label} (đồng)</label>
                    <input type="number" min={1000} step={1000} value={cpa[o.value] ?? o.defaultCpa}
                           onChange={(e) => setCpa({ ...cpa, [o.value]: Number(e.target.value) })} />
                  </div>
                ))}
                <div className="field">
                  <label>Cửa sổ attribution (ngày)</label>
                  <input type="number" min={0} max={30} value={attributionDays}
                         onChange={(e) => setAttributionDays(Number(e.target.value))} />
                  <div className="note" style={{ maxWidth: 'none' }}>
                    Chỉ dữ liệu cũ hơn ngần này ngày mới được dùng để kết luận. Xem số đo được
                    của tài khoản ở Bảng điều khiển thay vì đoán.
                  </div>
                </div>
                <div style={{
                  background: 'var(--acc-soft)', borderRadius: 'var(--r-sm)',
                  padding: '11px 13px', fontSize: 12.5, color: 'var(--acc-ink)', marginTop: 4,
                }}>
                  Cấu hình tạo ra ở chế độ <b>chạy thử</b> và trạng thái <b>nháp</b> — chỉ ghi đề
                  xuất vào nhật ký, không tắt gì cả. Phải bật lên một cách có ý thức.
                </div>
              </>
            )}

            {kind === 'metric_sync' && (
              <div className="field">
                <label>Nhìn lại (ngày)</label>
                <input type="number" min={1} max={90} value={lookbackDays}
                       onChange={(e) => setLookbackDays(Number(e.target.value))} />
                <div className="note" style={{ maxWidth: 'none' }}>
                  Mỗi lần chạy kéo lại cả khoảng này. Số chỉ được ghi thêm vào lịch sử khi
                  có thay đổi, nên kéo lại nhiều lần không làm phình dữ liệu.
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--line)', padding: '14px 18px',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button className="btn" onClick={submit}
                  disabled={busy || !usable || !name.trim() || !accountId}>
            {busy ? 'Đang tạo…' : 'Tạo cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );
}
