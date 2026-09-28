'use client';

import { useMemo, useState } from 'react';
import { KINDS, KIND_LABEL, KIND_DESC, PLATFORMS, type AutomationKind, type Platform } from '@/lib/configs/schema';
import { fieldsFor, REQUIRED_KEYS } from '@/lib/ads/metric-catalog';
import { MultiSelect, type Option } from '@/components/multi-select';

const IMPLEMENTED: AutomationKind[] = ['metric_sync', 'auto_pause'];
const READY_PLATFORMS: Platform[] = ['facebook'];

const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: 'Facebook', tiktok: 'TikTok', google: 'Google',
};

const OBJECTIVES = [
  { value: 'messages', label: 'Tin nhắn', defaultCpa: 120_000 },
  { value: 'leads', label: 'Lead form', defaultCpa: 80_000 },
  { value: 'sales', label: 'Chuyển đổi mua hàng', defaultCpa: 250_000 },
] as const;

const INTERVALS = [
  { v: 15, l: '15 phút' }, { v: 30, l: '30 phút' }, { v: 60, l: '1 giờ' },
  { v: 180, l: '3 giờ' }, { v: 360, l: '6 giờ' }, { v: 1440, l: '24 giờ' },
];

export interface Campaign { id: string; name: string; objective: string }
export interface Account { id: string; name: string; platform: string }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: hint ? 2 : 7 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 7 }}>{hint}</div>}
      {children}
    </div>
  );
}

export function NewConfigModal({
  accounts, campaigns, onClose, onCreated,
}: {
  accounts: Account[];
  campaigns: Record<string, Campaign[]>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<AutomationKind>('metric_sync');
  const [platform, setPlatform] = useState<Platform>('facebook');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [interval, setIntervalMin] = useState(30);

  // metric_sync
  const [lookbackDays, setLookbackDays] = useState(30);
  const [level, setLevel] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [extraFields, setExtraFields] = useState<string[]>([]);

  // auto_pause
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ messages: true, leads: true, sales: false });
  const [cpa, setCpa] = useState<Record<string, number>>({ messages: 120_000, leads: 80_000, sales: 250_000 });
  const [attributionDays, setAttributionDays] = useState(7);
  const [minConversions, setMinConversions] = useState(10);
  const [minClicks, setMinClicks] = useState(100);
  const [protectedIds, setProtectedIds] = useState<string[]>([]);
  const [maxPauses, setMaxPauses] = useState(3);
  const [liveMode, setLiveMode] = useState(false);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const catalog = useMemo(() => fieldsFor(platform), [platform]);
  const metricOptions: Option[] = catalog.map((m) => ({
    value: m.key, label: `${m.label} · ${m.key}`, group: m.group, locked: m.required,
  }));
  const campaignOptions: Option[] = (campaigns[accountId] ?? []).map((c) => ({
    value: c.id, label: c.name,
  }));

  async function submit() {
    setBusy(true);
    setError('');

    const params = kind === 'metric_sync'
      ? { platform, lookbackDays, level, extraFields }
      : {
          platform,
          mode: liveMode ? 'live' : 'dry_run',
          targets: OBJECTIVES.filter((o) => enabled[o.value]).map((o) => ({
            objective: o.value,
            targetCpaMicros: Math.round((cpa[o.value] ?? o.defaultCpa) * 1_000_000),
            attributionDays, minConversions, minClicks,
          })),
          protectedCampaignIds: protectedIds,
          maxPausesPerRun: maxPauses,
          notifyOnly: false,
        };

    const res = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, adAccountId: accountId, intervalMinutes: interval, params }),
    });
    setBusy(false);
    if (res.ok) onCreated();
    else setError((await res.json().catch(() => ({}))).error ?? 'Không tạo được cấu hình');
  }

  const usable = IMPLEMENTED.includes(kind) && READY_PLATFORMS.includes(platform);

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,40,.32)',
               display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 900, height: 'min(700px, 90vh)',
                 display: 'flex', flexDirection: 'column' }}
      >
        <div className="card-head">
          <b style={{ fontSize: 16 }}>Thêm cấu hình mới</b>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', flex: 1, minHeight: 0 }}>
          {/* ── cột trái: chọn loại ── */}
          <div style={{ borderRight: '1px solid var(--line)', padding: 12,
                        overflowY: 'auto', background: 'var(--side)' }}>
            {KINDS.map((k) => {
              const ready = IMPLEMENTED.includes(k);
              const on = kind === k;
              return (
                <button
                  key={k} onClick={() => setKind(k)} disabled={!ready}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    border: on ? '1px solid var(--line-strong)' : '1px solid transparent',
                    background: on ? 'var(--card)' : 'transparent',
                    borderRadius: 'var(--r-sm)', padding: '11px 12px', marginBottom: 5,
                    cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.45,
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 500,
                                color: on ? 'var(--acc-ink)' : 'var(--ink)' }}>
                    {KIND_LABEL[k]}
                    {!ready && <span style={{ fontSize: 9.5, marginLeft: 6, letterSpacing: .4,
                                              color: 'var(--dim)' }}>SẮP CÓ</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 3, lineHeight: 1.4 }}>
                    {KIND_DESC[k]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── cột phải: form ── */}
          <div style={{ padding: '20px 22px', overflowY: 'auto' }}>
            {error && <div className="err" style={{ marginBottom: 14 }}>{error}</div>}

            <Section title="Nền tảng">
              <div style={{ display: 'inline-flex', gap: 4, background: 'var(--side)',
                            padding: 4, borderRadius: 'var(--r-sm)' }}>
                {PLATFORMS.map((p) => {
                  const ready = READY_PLATFORMS.includes(p);
                  const on = platform === p;
                  return (
                    <button
                      key={p} onClick={() => ready && setPlatform(p)} disabled={!ready}
                      style={{
                        padding: '7px 15px', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                        border: 0, borderRadius: 6, cursor: ready ? 'pointer' : 'not-allowed',
                        background: on ? 'var(--card)' : 'transparent',
                        color: on ? 'var(--ink)' : 'var(--dim)',
                        boxShadow: on ? '0 1px 2px rgba(20,20,60,.08)' : 'none',
                        opacity: ready ? 1 : .5,
                      }}
                    >
                      {PLATFORM_LABEL[p]}
                      {!ready && <span style={{ fontSize: 9, marginLeft: 5 }}>SẮP CÓ</span>}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Tên cấu hình">
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)}
                     placeholder={kind === 'auto_pause' ? 'VD: Tắt ads tin nhắn Q4' : 'VD: Đồng bộ Facebook hằng ngày'} />
            </Section>

            <Section title="Tài khoản quảng cáo">
              <select style={inputStyle} value={accountId}
                      onChange={(e) => { setAccountId(e.target.value); setProtectedIds([]); }}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Section>

            <Section title="Tần suất chạy">
              <select style={inputStyle} value={interval}
                      onChange={(e) => setIntervalMin(Number(e.target.value))}>
                {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.l}</option>)}
              </select>
            </Section>

            {kind === 'metric_sync' && (
              <>
                <Section title="Khoảng dữ liệu"
                         hint="Mỗi lần chạy kéo lại cả khoảng này. Số chỉ ghi thêm vào lịch sử khi có thay đổi, nên kéo lại nhiều lần không làm phình dữ liệu.">
                  <select style={inputStyle} value={lookbackDays}
                          onChange={(e) => setLookbackDays(Number(e.target.value))}>
                    {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} ngày gần nhất</option>)}
                  </select>
                </Section>

                <Section title="Cấp dữ liệu" hint="Càng sâu càng tốn quota API của nền tảng.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['campaign', 'adset', 'ad'] as const).map((l) => (
                      <button key={l} onClick={() => setLevel(l)}
                              className={level === l ? 'btn' : 'btn btn-ghost'}
                              style={{ flex: 1, fontSize: 12.5 }}>
                        {l === 'campaign' ? 'Chiến dịch' : l === 'adset' ? 'Nhóm QC' : 'Quảng cáo'}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title={`Chỉ số bắt buộc (${REQUIRED_KEYS.length})`}
                         hint="Có cột riêng trong cơ sở dữ liệu. Mọi tính toán CPA dựa vào chúng nên không bỏ được.">
                  <div style={{ background: 'var(--side)', border: '1px solid var(--line)',
                                borderRadius: 'var(--r-sm)', padding: 11, display: 'flex',
                                flexWrap: 'wrap', gap: 6 }}>
                    {catalog.filter((m) => m.required).map((m) => (
                      <span key={m.key} className="mono" style={{
                        fontSize: 11.5, padding: '3px 8px', borderRadius: 5,
                        background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink-2)',
                      }}>{m.key}</span>
                    ))}
                  </div>
                </Section>

                <Section title="Chỉ số kéo thêm"
                         hint="Lưu vào cột extra_metrics, không đổi cấu trúc bảng. Chọn nhiều thì mỗi lượt gọi API chậm hơn.">
                  <MultiSelect options={metricOptions} selected={extraFields}
                               onChange={setExtraFields} placeholder="Chỉ kéo nhóm bắt buộc" />
                </Section>
              </>
            )}

            {kind === 'auto_pause' && (
              <>
                <Section title="Ngưỡng CPA theo loại chiến dịch"
                         hint="CPA tin nhắn và CPA lead không cùng thang — đặt riêng từng loại.">
                  {OBJECTIVES.map((o) => (
                    <div key={o.value} style={{
                      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
                      padding: '9px 12px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--line)',
                      background: enabled[o.value] ? 'var(--card)' : 'var(--side)',
                    }}>
                      <input type="checkbox" checked={!!enabled[o.value]}
                             onChange={(e) => setEnabled({ ...enabled, [o.value]: e.target.checked })}
                             style={{ width: 15, height: 15, accentColor: 'var(--acc)' }} />
                      <span style={{ flex: 1, fontSize: 13.5,
                                     color: enabled[o.value] ? 'var(--ink)' : 'var(--dim)' }}>
                        {o.label}
                      </span>
                      <input type="number" min={1000} step={1000}
                             disabled={!enabled[o.value]}
                             value={cpa[o.value] ?? o.defaultCpa}
                             onChange={(e) => setCpa({ ...cpa, [o.value]: Number(e.target.value) })}
                             style={{ ...inputStyle, width: 130, padding: '6px 10px', fontSize: 13 }} />
                      <span style={{ fontSize: 12, color: 'var(--dim)', width: 26 }}>đ</span>
                    </div>
                  ))}
                </Section>

                <Section title="Cửa sổ attribution"
                         hint="Chỉ dữ liệu cũ hơn ngần này ngày mới được dùng để kết luận. Xem số đo được của tài khoản ở Bảng điều khiển thay vì đoán.">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Số ngày</div>
                      <input type="number" min={0} max={30} value={attributionDays}
                             onChange={(e) => setAttributionDays(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tối thiểu chuyển đổi</div>
                      <input type="number" min={0} value={minConversions}
                             onChange={(e) => setMinConversions(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tối thiểu click</div>
                      <input type="number" min={0} value={minClicks}
                             onChange={(e) => setMinClicks(Number(e.target.value))} style={inputStyle} />
                    </div>
                  </div>
                </Section>

                <Section title="Chiến dịch được bảo vệ"
                         hint="Không bao giờ bị tắt, chỉ gửi cảnh báo. Bỏ sót một mục ở đây không gây hậu quả gì — danh sách này chỉ thêm an toàn.">
                  <MultiSelect options={campaignOptions} selected={protectedIds}
                               onChange={setProtectedIds}
                               placeholder="Không bảo vệ chiến dịch nào"
                               emptyText="Tài khoản này chưa có chiến dịch nào" />
                </Section>

                <Section title="Trần thiệt hại mỗi lượt"
                         hint="Một lượt chạy tắt tối đa bấy nhiêu chiến dịch. Vượt quá thì dừng và ghi cảnh báo.">
                  <input type="number" min={1} max={50} value={maxPauses}
                         onChange={(e) => setMaxPauses(Number(e.target.value))} style={inputStyle} />
                </Section>

                <div style={{
                  border: `1px solid ${liveMode ? 'var(--red)' : 'var(--line)'}`,
                  background: liveMode ? 'var(--red-soft)' : 'var(--side)',
                  borderRadius: 'var(--r-sm)', padding: '13px 15px', marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500,
                                    color: liveMode ? 'var(--red)' : 'var(--ink)' }}>
                        {liveMode ? 'Ghi thật lên tài khoản quảng cáo' : 'Chạy thử — chỉ ghi đề xuất'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 3, lineHeight: 1.45 }}>
                        {liveMode
                          ? 'Bot sẽ TẮT chiến dịch thật khi CPA đã chín vượt ngưỡng. Mọi thay đổi vẫn ghi vào nhật ký và hoàn tác được.'
                          : 'Bot chỉ ghi đề xuất vào nhật ký, không đụng vào tài khoản. Nên chạy vài tuần ở chế độ này trước.'}
                      </div>
                    </div>
                    <button type="button" onClick={() => setLiveMode((v) => !v)}
                            style={{
                              width: 42, height: 24, borderRadius: 999, border: 0, flex: 'none',
                              background: liveMode ? 'var(--red)' : 'var(--line-strong)',
                              position: 'relative', cursor: 'pointer',
                            }}>
                      <span style={{
                        position: 'absolute', top: 3, left: liveMode ? 21 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left .15s',
                      }} />
                    </button>
                  </div>
                </div>
              </>
            )}

            <div style={{
              background: 'var(--acc-soft)', borderRadius: 'var(--r-sm)',
              padding: '11px 13px', fontSize: 12.5, color: 'var(--acc-ink)', lineHeight: 1.5,
            }}>
              Cấu hình tạo ra ở trạng thái <b>nháp</b> — chưa chạy. Bật ở danh sách khi bạn sẵn sàng.
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 18px',
                      display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
