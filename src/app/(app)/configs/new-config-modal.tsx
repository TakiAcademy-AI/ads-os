'use client';

import { useEffect, useMemo, useState } from 'react';
import { KINDS, KIND_LABEL, KIND_DESC, PLATFORMS, type AutomationKind, type Platform } from '@/lib/configs/schema';
import { fieldsFor, REQUIRED_KEYS } from '@/lib/ads/metric-catalog';
import { MultiSelect, type Option } from '@/components/multi-select';

const IMPLEMENTED: AutomationKind[] = ['metric_sync', 'auto_pause', 'budget_schedule', 'post_trigger'];
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

/** Cấu hình đang sửa. Bỏ trống = đang tạo mới. */
export interface EditingConfig {
  id: string;
  kind: AutomationKind;
  name: string;
  adAccountId: string;
  intervalMinutes: number;
  params: unknown;
}

export function NewConfigModal({
  accounts, campaigns, currentAccountId, editing, onClose, onCreated,
}: {
  accounts: Account[];
  campaigns: Record<string, Campaign[]>;
  /** Tài khoản đang xem ở sidebar — mặc định tạo cấu hình cho chính nó. */
  currentAccountId: string | null;
  editing?: EditingConfig;
  onClose: () => void;
  onCreated: () => void;
}) {
  // Đọc params của cấu hình đang sửa. Dùng khoá có sẵn, thiếu thì lấy mặc định
  // giống hệt lúc tạo mới — cấu hình cũ có thể thiếu trường mới thêm về sau.
  const ep = (editing?.params ?? {}) as Record<string, any>;
  const pick = <T,>(v: T | undefined, fallback: T): T => (v === undefined || v === null ? fallback : v);

  const [kind, setKind] = useState<AutomationKind>(editing?.kind ?? 'metric_sync');
  const [platform, setPlatform] = useState<Platform>(pick(ep.platform, 'facebook'));
  const [name, setName] = useState(editing?.name ?? '');
  const [accountId, setAccountId] = useState(
    editing?.adAccountId ?? currentAccountId ?? accounts[0]?.id ?? '');
  const [interval, setIntervalMin] = useState(editing?.intervalMinutes ?? 30);

  // metric_sync
  const [lookbackDays, setLookbackDays] = useState<number>(pick(ep.lookbackDays, 30));
  const [level, setLevel] = useState<'campaign' | 'adset' | 'ad'>(pick(ep.level, 'campaign'));
  const [extraFields, setExtraFields] = useState<string[]>(pick(ep.extraFields, []));

  // auto_pause — dựng lại bảng bật/tắt và ngưỡng từ mảng targets
  const targets: { objective: string; targetCpaMicros: number }[] =
    Array.isArray(ep.targets) ? ep.targets : [];
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    editing
      ? Object.fromEntries(OBJECTIVES.map((o) => [o.value, targets.some((t) => t.objective === o.value)]))
      : { messages: true, leads: true, sales: false });
  const [cpa, setCpa] = useState<Record<string, number>>(
    Object.fromEntries(OBJECTIVES.map((o) => {
      const hit = targets.find((t) => t.objective === o.value);
      return [o.value, hit ? Math.round(hit.targetCpaMicros / 1_000_000) : o.defaultCpa];
    })));
  const [attributionDays, setAttributionDays] = useState<number>(pick(targets[0]?.['attributionDays' as never], 7));
  const [minConversions, setMinConversions] = useState<number>(pick(targets[0]?.['minConversions' as never], 10));
  const [minClicks, setMinClicks] = useState<number>(pick(targets[0]?.['minClicks' as never], 100));
  const [protectedIds, setProtectedIds] = useState<string[]>(pick(ep.protectedCampaignIds, []));
  const [maxPauses, setMaxPauses] = useState<number>(pick(ep.maxPausesPerRun, 3));
  const [liveMode, setLiveMode] = useState(ep.mode === 'live');

  // budget_schedule — mặc định một khung giờ vàng buổi tối
  const [slots, setSlots] = useState<{ startHour: number; endHour: number; percent: number }[]>(
    Array.isArray(ep.slots) && ep.slots.length ? ep.slots : [{ startHour: 19, endHour: 23, percent: 150 }]);

  // post_trigger
  const [pages, setPages] = useState<{ pageId: string; name: string; hasToken: boolean }[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState('');
  const [pageId, setPageId] = useState<string>(pick(ep.pageId, ''));
  const [keywordText, setKeywordText] = useState(
    Array.isArray(ep.keywords) ? ep.keywords.join('\n') : '');
  const [matchMode, setMatchMode] = useState<'any' | 'all'>(pick(ep.matchMode, 'any'));
  const [postBudget, setPostBudget] = useState<number>(
    typeof ep.dailyBudgetMicros === 'number' ? Math.round(ep.dailyBudgetMicros / 1_000_000) : 50_000);
  const [maxPostAgeHours, setMaxPostAgeHours] = useState<number>(pick(ep.maxPostAgeHours, 24));
  const [maxPerRun, setMaxPerRun] = useState<number>(pick(ep.maxPerRun, 2));
  const [ageMin, setAgeMin] = useState<number>(pick(ep.ageMin, 18));
  const [ageMax, setAgeMax] = useState<number>(pick(ep.ageMax, 65));

  // Mỗi từ khoá một dòng hoặc ngăn bằng dấu phẩy — người dùng gõ kiểu nào cũng được.
  const keywords = useMemo(
    () => keywordText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean),
    [keywordText],
  );

  useEffect(() => {
    if (kind !== 'post_trigger' || pages.length > 0 || pagesLoading) return;
    setPagesLoading(true);
    fetch('/api/pages')
      .then((r) => r.json())
      .then((d) => setPages(d.pages ?? []))
      .catch(() => setPagesError('Không tải được danh sách Page'))
      .finally(() => setPagesLoading(false));
  }, [kind, pages.length, pagesLoading]);

  async function reloadPages() {
    setPagesLoading(true);
    setPagesError('');
    const res = await fetch('/api/pages', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    setPagesLoading(false);
    if (res.ok) setPages(d.pages ?? []);
    else setPagesError(d.error ?? 'Không nạp lại được');
  }

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
      : kind === 'budget_schedule'
      ? { platform, mode: liveMode ? 'live' : 'dry_run', slots }
      : kind === 'post_trigger'
      ? {
          platform,
          mode: liveMode ? 'live' : 'dry_run',
          pageId,
          pageName: pages.find((p) => p.pageId === pageId)?.name ?? '',
          keywords, matchMode,
          dailyBudgetMicros: Math.round(postBudget * 1_000_000),
          countries: ['VN'],
          ageMin, ageMax,
          maxPostAgeHours, maxPerRun,
          createPaused: true,
        }
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
        };

    // Sửa thì PUT vào chính cấu hình đó; loại và tài khoản không đổi được.
    const res = editing
      ? await fetch(`/api/configs/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, intervalMinutes: interval, params }),
        })
      : await fetch('/api/configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, name, adAccountId: accountId, intervalMinutes: interval, params }),
        });
    setBusy(false);
    if (res.ok) onCreated();
    else setError((await res.json().catch(() => ({}))).error
      ?? (editing ? 'Không lưu được thay đổi' : 'Không tạo được cấu hình'));
  }

  const usable = IMPLEMENTED.includes(kind) && READY_PLATFORMS.includes(platform)
    // post_trigger thiếu Page hoặc thiếu từ khoá thì tạo ra một cấu hình không
    // bao giờ làm gì — chặn ngay ở nút bấm thay vì để người dùng chờ vô ích.
    && (kind !== 'post_trigger' || (!!pageId && keywords.length > 0));

  return (
    <div
      onClick={onClose}
      // fixed chứ không absolute: absolute neo theo khối cha đã cuộn, nên nếu
      // người dùng cuộn xuống rồi bấm "Thêm cấu hình" thì modal hiện tít trên
      // đầu trang, ngoài tầm nhìn — màn hình tối đi mà không thấy hộp thoại đâu.
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,40,.32)',
               display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 900, height: 'min(700px, 90vh)',
                 display: 'flex', flexDirection: 'column' }}
      >
        <div className="card-head">
          <b style={{ fontSize: 16 }}>{editing ? `Sửa: ${editing.name}` : 'Thêm cấu hình mới'}</b>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', flex: 1, minHeight: 0 }}>
          {/* ── cột trái: chọn loại ── */}
          <div style={{ borderRight: '1px solid var(--line)', padding: 12,
                        overflowY: 'auto', background: 'var(--side)' }}>
            {KINDS.map((k) => {
              // Sửa thì không cho đổi loại: params của loại này không dùng được
              // cho loại kia, và nhật ký đã gắn với loại cũ.
              const ready = IMPLEMENTED.includes(k) && (!editing || editing.kind === k);
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
              <select style={inputStyle} value={accountId} disabled={!!editing}
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

                <Section title="Cấp dữ liệu"
                         hint="Hiện chỉ hỗ trợ cấp chiến dịch. Cấp sâu hơn cần đường ghi riêng — chọn được mà ghi sai thì còn tệ hơn không có.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['campaign', 'adset', 'ad'] as const).map((l) => {
                      const ready = l === 'campaign';
                      return (
                        <button key={l} onClick={() => ready && setLevel(l)} disabled={!ready}
                                className={level === l ? 'btn' : 'btn btn-ghost'}
                                style={{ flex: 1, fontSize: 12.5,
                                         cursor: ready ? 'pointer' : 'not-allowed',
                                         opacity: ready ? 1 : .45 }}>
                          {l === 'campaign' ? 'Chiến dịch' : l === 'adset' ? 'Nhóm QC' : 'Quảng cáo'}
                          {!ready && <span style={{ fontSize: 9, marginLeft: 5 }}>SẮP CÓ</span>}
                        </button>
                      );
                    })}
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

            {kind === 'budget_schedule' && (
              <>
                <Section title="Khung giờ"
                         hint="Phần trăm tính từ NGÂN SÁCH GỐC, không phải giá trị hiện tại — nếu không sẽ nhân dồn qua mỗi lượt. Ngoài mọi khung giờ thì tự trả về 100%.">
                  {slots.map((sl, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                      padding: '9px 12px', border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                    }}>
                      <input type="number" min={0} max={23} value={sl.startHour}
                             onChange={(e) => setSlots(slots.map((x, j) =>
                               j === i ? { ...x, startHour: Number(e.target.value) } : x))}
                             style={{ ...inputStyle, width: 64, padding: '6px 9px', fontSize: 13 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>giờ →</span>
                      <input type="number" min={1} max={24} value={sl.endHour}
                             onChange={(e) => setSlots(slots.map((x, j) =>
                               j === i ? { ...x, endHour: Number(e.target.value) } : x))}
                             style={{ ...inputStyle, width: 64, padding: '6px 9px', fontSize: 13 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--dim)', flex: 1 }}>giờ, chạy</span>
                      <input type="number" min={10} max={500} step={10} value={sl.percent}
                             onChange={(e) => setSlots(slots.map((x, j) =>
                               j === i ? { ...x, percent: Number(e.target.value) } : x))}
                             style={{ ...inputStyle, width: 84, padding: '6px 9px', fontSize: 13 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>%</span>
                      <button type="button" onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                              className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 9px' }}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }}
                          onClick={() => setSlots([...slots, { startHour: 0, endHour: 6, percent: 50 }])}>
                    + Thêm khung giờ
                  </button>
                  <div className="note" style={{ maxWidth: 'none', marginTop: 8 }}>
                    Khung giờ <b>không được chồng lên nhau</b> — nếu chồng thì kết quả phụ
                    thuộc thứ tự và không đoán được. Giờ tính theo múi giờ Việt Nam.
                    Khung <b>vắt qua nửa đêm</b> viết bình thường: <span className="mono">22 → 6</span>.
                  </div>
                </Section>

                <Section title="Chỉ áp dụng cho chiến dịch đặt ngân sách cấp chiến dịch"
                         hint="Chiến dịch đặt ngân sách ở cấp nhóm quảng cáo (ABO) chưa được hỗ trợ.">
                  <div />
                </Section>
              </>
            )}

            {kind === 'post_trigger' && (
              <>
                <Section title="Page nguồn"
                         hint="Bài viết đọc bằng token riêng của Page. Không thấy Page nào thì bấm Nạp lại — thường là do lúc kết nối chưa tick đủ Page.">
                  {pagesError && <div className="err" style={{ marginBottom: 8 }}>{pagesError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select style={{ ...inputStyle, flex: 1 }} value={pageId}
                            onChange={(e) => setPageId(e.target.value)}>
                      <option value="">
                        {pagesLoading ? 'Đang tải…' : pages.length ? '— Chọn Page —' : 'Chưa có Page nào'}
                      </option>
                      {pages.map((p) => (
                        <option key={p.pageId} value={p.pageId} disabled={!p.hasToken}>
                          {p.name}{p.hasToken ? '' : ' (thiếu token)'}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-ghost" onClick={reloadPages}
                            disabled={pagesLoading} style={{ fontSize: 12.5, flex: 'none' }}>
                      Nạp lại
                    </button>
                  </div>
                </Section>

                <Section title="Từ khoá kích hoạt"
                         hint="Mỗi dòng một từ khoá, hoặc ngăn bằng dấu phẩy. Không phân biệt hoa thường và không phân biệt dấu — gõ “khuyen mai” vẫn bắt được “khuyến mãi”.">
                  <textarea
                    value={keywordText} onChange={(e) => setKeywordText(e.target.value)}
                    rows={3} placeholder={'khuyến mãi\nsale\ngiảm giá'}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    {(['any', 'all'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMatchMode(m)}
                              className={matchMode === m ? 'btn' : 'btn btn-ghost'}
                              style={{ fontSize: 12.5 }}>
                        {m === 'any' ? 'Khớp bất kỳ từ khoá' : 'Phải khớp tất cả'}
                      </button>
                    ))}
                    <span style={{ fontSize: 11.5, color: 'var(--dim)', marginLeft: 'auto' }}>
                      {keywords.length} từ khoá
                    </span>
                  </div>
                </Section>

                <Section title="Chiến dịch sinh ra"
                         hint="Mục tiêu cố định là Tương tác bài viết — đây là loại duy nhất chạy được thẳng từ một bài đăng mà không cần pixel hay trang đích.">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Ngân sách/ngày (đ)</div>
                      <input type="number" min={1000} step={1000} value={postBudget}
                             onChange={(e) => setPostBudget(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tuổi từ</div>
                      <input type="number" min={13} max={65} value={ageMin}
                             onChange={(e) => setAgeMin(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>đến</div>
                      <input type="number" min={13} max={65} value={ageMax}
                             onChange={(e) => setAgeMax(Number(e.target.value))} style={inputStyle} />
                    </div>
                  </div>
                </Section>

                <Section title="Giới hạn an toàn"
                         hint="Bài cũ hơn mốc này bị bỏ qua, và mỗi lượt chạy tạo tối đa bấy nhiêu chiến dịch.">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Chỉ bài trong (giờ)</div>
                      <input type="number" min={1} max={168} value={maxPostAgeHours}
                             onChange={(e) => setMaxPostAgeHours(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tối đa mỗi lượt</div>
                      <input type="number" min={1} max={10} value={maxPerRun}
                             onChange={(e) => setMaxPerRun(Number(e.target.value))} style={inputStyle} />
                    </div>
                  </div>
                  <div className="note" style={{ maxWidth: 'none', marginTop: 8 }}>
                    Cấu hình <b>không bao giờ đào lại bài cũ hơn thời điểm nó được tạo</b>, kể cả
                    khi bạn đặt mốc 168 giờ. Bật lên không làm nổ một loạt chiến dịch từ quá khứ.
                  </div>
                </Section>
              </>
            )}

            {(kind === 'auto_pause' || kind === 'budget_schedule' || kind === 'post_trigger') && (
              <div style={{
                border: `1px solid ${liveMode ? 'var(--red)' : 'var(--line)'}`,
                background: liveMode ? 'var(--red-soft)' : 'var(--side)',
                borderRadius: 'var(--r-sm)', padding: '13px 15px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500,
                                  color: liveMode ? 'var(--red)' : 'var(--ink)' }}>
                      {liveMode ? 'Ghi thật lên tài khoản quảng cáo' : 'Chạy thử — chỉ ghi đề xuất'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 3, lineHeight: 1.45 }}>
                      {liveMode
                        ? (kind === 'auto_pause'
                            ? 'Bot sẽ TẮT chiến dịch thật. Mọi thay đổi vẫn ghi vào nhật ký.'
                            : kind === 'budget_schedule'
                            ? 'Bot sẽ ĐỔI NGÂN SÁCH thật. Mọi thay đổi vẫn ghi vào nhật ký.'
                            : 'Bot sẽ TẠO chiến dịch thật trong tài khoản — nhưng luôn ở trạng thái '
                              + 'TẠM DỪNG, bạn phải tự bật thì mới tiêu tiền.')
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

              </>
            )}

            <div style={{
              background: 'var(--acc-soft)', borderRadius: 'var(--r-sm)',
              padding: '11px 13px', fontSize: 12.5, color: 'var(--acc-ink)', lineHeight: 1.5,
            }}>
              {editing
                ? <>Thay đổi có hiệu lực từ <b>lượt chạy tiếp theo</b>. Trạng thái bật/tắt
                   và chế độ chạy thử/ghi thật giữ nguyên như hiện tại.</>
                : <>Cấu hình tạo ra ở trạng thái <b>nháp</b> — chưa chạy. Bật ở danh sách khi bạn sẵn sàng.</>}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 18px',
                      display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button className="btn" onClick={submit}
                  disabled={busy || !usable || !name.trim() || !accountId}>
            {busy ? (editing ? 'Đang lưu…' : 'Đang tạo…') : (editing ? 'Lưu thay đổi' : 'Tạo cấu hình')}
          </button>
        </div>
      </div>
    </div>
  );
}
