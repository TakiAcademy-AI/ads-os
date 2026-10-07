'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CampaignDetail, DetailIssue, DetailGroup, DetailAd,
} from '@/lib/ads/campaign-detail-types';

const inputStyle: React.CSSProperties = {
  padding: '8px 11px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

const LEVEL_COLOR = { ok: 'var(--grn)', warn: 'var(--amb)', error: 'var(--red)', off: 'var(--dim)' } as const;
const ISSUE_COLOR = { error: 'var(--red)', warn: 'var(--amb)', info: 'var(--ink-2)' } as const;

const MATCH_VI: Record<string, string> = { BROAD: 'Rộng', PHRASE: 'Cụm từ', EXACT: 'Chính xác' };

function Serving({ text, level }: { text: string; level: keyof typeof LEVEL_COLOR }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: LEVEL_COLOR[level] }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: LEVEL_COLOR[level] }} />
      {text}
    </span>
  );
}

function Issues({ items }: { items: DetailIssue[] }) {
  if (!items.length) return null;
  return (
    <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
      {items.map((i, k) => (
        <li key={k} style={{ color: ISSUE_COLOR[i.level] }} title={i.code}>{i.text}</li>
      ))}
    </ul>
  );
}

/** Công tắc bật/tắt. Bật = bắt đầu tiêu tiền nên luôn hỏi lại. */
function Toggle({ on, disabled, onChange, label }: {
  on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <button type="button" disabled={disabled} title={on ? `Tạm dừng ${label}` : `Bật ${label}`}
            onClick={() => onChange(!on)}
            style={{
              width: 38, height: 22, borderRadius: 11, border: 0, padding: 2, cursor: disabled ? 'default' : 'pointer',
              background: on ? 'var(--grn)' : 'var(--line-strong)', opacity: disabled ? 0.5 : 1,
              display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', flexShrink: 0,
            }}>
      <span style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', display: 'block' }} />
    </button>
  );
}

/** Ô sửa nhanh: hiện giá trị, bấm Sửa thì thành ô nhập + Lưu/Huỷ. */
/** VND không có phần lẻ; USD… có 2 chữ số. Lọc sai là "12.50" thành "1250". */
function cleanAmount(raw: string, decimals: boolean): string {
  if (!decimals) return raw.replace(/\D/g, '');
  const [int, ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int!;
}

function InlineEdit({ value, display, onSave, disabled, numeric, decimals = false, width = 220 }: {
  value: string; display?: React.ReactNode; onSave: (v: string) => Promise<boolean>;
  disabled?: boolean; numeric?: boolean; decimals?: boolean; width?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(value); }, [value]);
  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        {display ?? value}
        {!disabled && (
          <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11.5 }}
                  onClick={() => setEditing(true)}>Sửa</button>
        )}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input style={{ ...inputStyle, width }} value={v} autoFocus
             inputMode={numeric ? (decimals ? 'decimal' : 'numeric') : undefined}
             onChange={(e) => setV(numeric ? cleanAmount(e.target.value, decimals) : e.target.value)} />
      <button type="button" className="btn" style={{ padding: '6px 11px', fontSize: 12 }} disabled={busy || !v.trim()}
              onClick={async () => {
                setBusy(true);
                try { if (await onSave(v.trim())) setEditing(false); } finally { setBusy(false); }
              }}>
        {busy ? '…' : 'Lưu'}
      </button>
      <button type="button" className="btn btn-ghost" style={{ padding: '6px 11px', fontSize: 12 }}
              onClick={() => { setV(value); setEditing(false); }}>Huỷ</button>
    </span>
  );
}

export function CampaignEditor({ campaignId, adAccountId, detail, canWrite }: {
  campaignId: string; adAccountId: string; detail: CampaignDetail; canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const c = detail.campaign;
  const cur = detail.currency === 'VND' ? 'đ' : ` ${detail.currency}`;
  const dec = detail.currency !== 'VND';
  const fmt = (v: number) => v.toLocaleString('vi-VN', dec ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  const money = (micros: number | null) => (micros === null ? '—' : `${fmt(micros / 1_000_000)}${cur}`);
  /** Giá trị đưa vào ô sửa: không làm tròn, không dấu phân cách nghìn. */
  const raw = (micros: number) => String(dec ? Math.round(micros / 10_000) / 100 : Math.round(micros / 1_000_000));

  /** Gửi một chỉnh sửa. Thành công thì tải lại để đọc trạng thái mới từ nền tảng. */
  async function edit(body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true); setError(''); setOkMsg('');
    let res: Response, d: { error?: string };
    try {
      res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      d = await res.json().catch(() => ({}));
    } catch {
      // Mất mạng: không để mọi nút bị khoá vĩnh viễn ở trạng thái "đang chạy".
      setError('Không gửi được yêu cầu — kiểm tra kết nối mạng rồi thử lại. Nếu đã gửi đi, tải lại trang để xem trạng thái thật.');
      return false;
    } finally {
      setBusy(false);
    }
    if (!res.ok) { setError(d.error ?? 'Thao tác thất bại'); return false; }
    setOkMsg(done);
    router.refresh();
    return true;
  }

  const confirmOn = (what: string) =>
    confirm(`Bật ${what}?\n\nKhi bật, quảng cáo có thể bắt đầu chạy và tiêu tiền ngay.`);

  function setStatus(on: boolean) {
    if (on && !confirmOn('chiến dịch')) return;
    edit({ action: 'status', enabled: on }, on ? 'Đã bật chiến dịch.' : 'Đã tạm dừng chiến dịch.');
  }
  function setGroupStatus(g: DetailGroup, on: boolean) {
    if (on && !confirmOn(`"${g.name}"`)) return;
    edit({ action: 'group_status', groupId: g.id, groupKind: g.kind, groupName: g.name, enabled: on },
      on ? `Đã bật ${g.name}.` : `Đã tạm dừng ${g.name}.`);
  }
  function setAdStatus(a: DetailAd, on: boolean) {
    if (on && !confirmOn(`quảng cáo "${a.name}"`)) return;
    edit({ action: 'ad_status', adId: a.id, groupId: a.groupId, adName: a.name, enabled: on },
      on ? 'Đã bật quảng cáo.' : 'Đã tạm dừng quảng cáo.');
  }

  const groupLabel = detail.platform === 'facebook' ? 'Nhóm quảng cáo' : detail.groups[0]?.kind === 'asset_group' ? 'Nhóm tài sản' : 'Nhóm quảng cáo';
  const ro = !canWrite || busy;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {(error || okMsg) && (
        <div className={error ? 'err' : undefined} style={okMsg && !error ? {
          background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5, padding: '10px 13px', borderRadius: 'var(--r-sm)',
        } : undefined}>{error || okMsg}</div>
      )}
      {!canWrite && <div className="note" style={{ maxWidth: 'none' }}>Tài khoản của bạn chỉ có quyền xem.</div>}
      {detail.partialErrors.length > 0 && (
        <div className="note" style={{ maxWidth: 'none', color: 'var(--amb)' }}>
          Một số phần không đọc được: {detail.partialErrors.join(' · ')}
        </div>
      )}

      {/* ── Chiến dịch ── */}
      <div className="card">
        <div className="card-head"><b>Chiến dịch</b><span>{c.type}</span></div>
        <div style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <Toggle on={c.enabled} disabled={ro || !detail.can.status} onChange={setStatus} label="chiến dịch" />
            <div style={{ flex: 1 }}>
              <Serving text={c.serving} level={c.servingLevel} />
              <Issues items={c.issues} />
            </div>
          </div>
          <table style={{ fontSize: 13 }}>
            <tbody>
              <tr><td style={{ width: 160, color: 'var(--dim)' }}>Tên</td>
                <td><InlineEdit value={c.name} disabled={ro || !detail.can.rename} width={360}
                                onSave={(v) => edit({ action: 'rename', name: v }, 'Đã đổi tên chiến dịch.')} /></td></tr>
              <tr><td style={{ color: 'var(--dim)' }}>Ngân sách/ngày</td>
                <td>
                  {c.budgetLevel === 'campaign' && c.dailyBudgetMicros !== null ? (
                    <InlineEdit value={raw(c.dailyBudgetMicros)} numeric decimals={dec} width={140}
                                display={<b>{money(c.dailyBudgetMicros)}</b>} disabled={ro || !detail.can.budget}
                                onSave={(v) => {
                                  const n = Number(v);
                                  if (!confirm(`Đổi ngân sách/ngày từ ${money(c.dailyBudgetMicros)} thành ${fmt(n)}${cur}?`)) return Promise.resolve(false);
                                  return edit({ action: 'budget', dailyBudget: n }, 'Đã đổi ngân sách.');
                                }} />
                  ) : c.lifetimeBudgetMicros !== null ? (
                    <span>Ngân sách trọn đời <b>{money(c.lifetimeBudgetMicros)}</b> — sửa trên nền tảng</span>
                  ) : c.budgetLevel === 'group' ? (
                    <span style={{ color: 'var(--dim)' }}>Đặt ở từng nhóm quảng cáo — sửa ở bảng bên dưới</span>
                  ) : '—'}
                  {c.budgetShared && (
                    <div className="cell-sub" style={{ color: 'var(--amb)' }}>
                      Ngân sách dùng chung với chiến dịch khác — Ads OS không sửa để tránh ảnh hưởng chiến dịch kia.
                    </div>
                  )}
                </td></tr>
              <tr><td style={{ color: 'var(--dim)' }}>Giá thầu</td>
                <td>{c.bidding ?? (c.budgetLevel === 'group' ? <span style={{ color: 'var(--dim)' }}>Đặt ở từng nhóm quảng cáo</span> : '—')}</td></tr>
              <tr><td style={{ color: 'var(--dim)' }}>Thời gian</td>
                <td>{c.start ? `từ ${when(c.start)}` : '—'}{c.end ? ` đến ${when(c.end)}` : ' · không ngày kết thúc'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Vị trí & ngôn ngữ (Google) ── */}
      {detail.platform === 'google' && (
        <Locations detail={detail} adAccountId={adAccountId} ro={ro} edit={edit} />
      )}

      {/* ── Nhóm ── */}
      <div className="card">
        <div className="card-head"><b>{groupLabel}</b><span>{detail.groups.length}</span></div>
        {detail.groups.length === 0 ? <div className="empty">Không có nhóm nào.</div> : (
          <table>
            <tbody>
              {detail.groups.map((g) => (
                <tr key={g.id}>
                  <td style={{ width: 50 }}>
                    <Toggle on={g.enabled} disabled={ro || !detail.can.groupStatus} label={g.name}
                            onChange={(v) => setGroupStatus(g, v)} />
                  </td>
                  <td>
                    <div className="cell-title">{g.name}</div>
                    {g.summary && <div className="cell-sub">{g.summary}</div>}
                    <div style={{ marginTop: 4 }}><Serving text={g.serving} level={g.servingLevel} /></div>
                    <Issues items={g.issues} />
                  </td>
                  <td className="n" style={{ whiteSpace: 'nowrap' }}>
                    {g.dailyBudgetMicros !== null && (
                      <InlineEdit value={raw(g.dailyBudgetMicros)} numeric decimals={dec} width={120}
                                  display={<span className="mono">{money(g.dailyBudgetMicros)}/ngày</span>}
                                  disabled={ro || !detail.can.groupBudget}
                                  onSave={(v) => {
                                    const n = Number(v);
                                    const later = detail.platform === 'tiktok' && !c.smartPlus
                                      ? '\n\nTikTok áp dụng ngân sách ngày mới của nhóm từ 00:00 HÔM SAU (giờ tài khoản), không phải ngay.' : '';
                                    if (!confirm(`Đổi ngân sách/ngày của "${g.name}" thành ${fmt(n)}${cur}?${later}`)) return Promise.resolve(false);
                                    return edit({ action: 'group_budget', groupId: g.id, groupName: g.name, dailyBudget: n }, 'Đã đổi ngân sách nhóm.');
                                  }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Từ khoá (Google Search) ── */}
      {detail.can.keywords && <Keywords detail={detail} ro={ro} edit={edit} />}

      {/* ── Quảng cáo ── */}
      <div className="card">
        <div className="card-head"><b>Quảng cáo</b><span>{detail.ads.length}</span></div>
        {detail.ads.length === 0 ? <div className="empty">Không có quảng cáo nào.</div> : (
          <div style={{ display: 'grid', gap: 10, padding: 14 }}>
            {detail.ads.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '12px 14px',
                                       display: 'flex', gap: 14 }}>
                {detail.can.adStatus && (
                  <Toggle on={a.enabled} disabled={ro} label="quảng cáo" onChange={(v) => setAdStatus(a, v)} />
                )}
                {a.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnail} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b style={{ fontSize: 13.5 }}>{a.name}</b>
                    <span className="tag tag-mute" style={{ fontSize: 10.5 }}>{a.type}</span>
                    {a.review && (
                      <span className={`tag ${/từ chối/i.test(a.review) ? 'tag-over' : /xem xét|sơ bộ|giới hạn/i.test(a.review) ? 'tag-hold' : 'tag-ok'}`}
                            style={{ fontSize: 10.5 }}>{a.review}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 4 }}><Serving text={a.serving} level={a.servingLevel} /></div>
                  <Issues items={a.issues} />
                  {a.headlines.length > 0 && (
                    <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--acc-ink)', lineHeight: 1.6 }}>
                      {a.headlines.join(' | ')}
                    </div>
                  )}
                  {a.descriptions.length > 0 && <Clamp text={a.descriptions.join(' ')} />}
                  {a.finalUrl && (
                    <a href={a.finalUrl} target="_blank" rel="noreferrer" className="mono"
                       style={{ fontSize: 11.5, color: 'var(--grn)', wordBreak: 'break-all' }}>{a.finalUrl}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Thời điểm từ nền tảng: chuỗi có múi giờ (ISO …Z / +07:00) → giờ VN; chuỗi
 * không múi giờ (Google trả theo giờ tài khoản) → để nguyên.
 */
function when(v: string): string {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return v.slice(0, 16).replace('T', ' ');
}

/** Nội dung quảng cáo Facebook có thể dài cả trang — rút còn 3 dòng, bấm để mở. */
function Clamp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(!open)} title={open ? 'Thu gọn' : 'Xem hết'}
         style={{
           fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, cursor: 'pointer', whiteSpace: 'pre-line',
           ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
         }}>
      {text}
    </div>
  );
}

type EditFn = (body: Record<string, unknown>, done: string) => Promise<boolean>;

function Locations({ detail, adAccountId, ro, edit }: {
  detail: CampaignDetail; adAccountId: string; ro: boolean; edit: EditFn;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ id: string; name: string; type: string; canonical: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const can = detail.can.locations && !ro;
  const hasCountry = detail.locations.some((l) => l.geoId === '2704' && !l.negative);
  const hasSub = detail.locations.some((l) => l.geoId !== '2704' && !l.negative);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setItems([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/google/geo?account=${adAccountId}&q=${encodeURIComponent(q.trim())}`);
      const d = await res.json().catch(() => ({}));
      setItems(res.ok ? d.items ?? [] : []);
    }, 350);
  }, [q, adAccountId]);

  return (
    <div className="card">
      <div className="card-head"><b>Vị trí và ngôn ngữ</b>
        <span>{detail.languages.map((l) => l.name).join(', ') || 'mọi ngôn ngữ'}</span></div>
      <div style={{ padding: '14px 18px' }}>
        {hasCountry && hasSub && (
          <div style={{ fontSize: 12.5, color: 'var(--amb)', background: 'var(--amb-soft)', padding: '9px 12px',
                        borderRadius: 'var(--r-sm)', marginBottom: 10, lineHeight: 1.5 }}>
            Đang nhắm <b>cả Việt Nam lẫn tỉnh/thành</b> — Google lấy hợp nên quảng cáo vẫn chạy cả nước.
            Bỏ &ldquo;Vietnam&rdquo; nếu chỉ muốn chạy ở tỉnh/thành đã chọn.
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: can ? 10 : 0 }}>
          {detail.locations.length === 0 && <span style={{ color: 'var(--dim)', fontSize: 13 }}>Mọi vị trí</span>}
          {detail.locations.map((l) => (
            <span key={`${l.level}-${l.criterionId}`} className={`tag ${l.negative ? 'tag-over' : 'tag-keep'}`}
                  style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {l.negative ? 'loại trừ: ' : ''}{l.name}{l.level === 'group' ? ' (nhóm)' : ''}
              {can && l.level === 'campaign' && (
                <button type="button" title="Bỏ vị trí này"
                        onClick={() => confirm(`Bỏ vị trí "${l.name}" khỏi chiến dịch?`)
                          && edit({ action: 'location_remove', criterionId: l.criterionId, name: l.name }, `Đã bỏ ${l.name}.`)}
                        style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>×</button>
              )}
            </span>
          ))}
        </div>
        {!detail.can.locations && detail.locations.some((l) => l.level === 'group') && (
          <div className="note" style={{ maxWidth: 'none' }}>Demand Gen đặt vị trí ở từng nhóm quảng cáo — sửa trên Google Ads.</div>
        )}
        {can && (
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <input style={{ ...inputStyle, width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Thêm vị trí: gõ tên tỉnh, thành phố…" />
            {items.length > 0 && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginTop: 4,
                            maxHeight: 220, overflowY: 'auto', background: 'var(--card)' }}>
                {items.filter((g) => !detail.locations.some((l) => l.geoId === g.id)).map((g) => (
                  <button key={g.id} type="button"
                          onClick={async () => {
                            setQ(''); setItems([]);
                            await edit({ action: 'location_add', geoIds: [g.id], names: [g.name] }, `Đã thêm ${g.name}.`);
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 0,
                                   borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer',
                                   fontFamily: 'inherit', fontSize: 13, color: 'var(--ink-2)' }}>
                    {g.name} <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>· {g.type} · {g.canonical}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Keywords({ detail, ro, edit }: { detail: CampaignDetail; ro: boolean; edit: EditFn }) {
  const [text, setText] = useState('');
  const [match, setMatch] = useState<'BROAD' | 'PHRASE' | 'EXACT'>('PHRASE');
  const [groupId, setGroupId] = useState(detail.groups[0]?.id ?? '');
  const groupName = (id: string) => detail.groups.find((g) => g.id === id)?.name ?? id;

  return (
    <div className="card">
      <div className="card-head"><b>Từ khoá</b><span>{detail.keywords.length}</span></div>
      {detail.keywords.length > 0 && (
        <table>
          <tbody>
            {detail.keywords.map((k) => (
              <tr key={`${k.groupId}-${k.criterionId}`}>
                <td style={{ width: 50 }}>
                  <Toggle on={k.enabled} disabled={ro} label={`từ khoá "${k.text}"`}
                          onChange={(v) => (!v || confirm(`Bật từ khoá "${k.text}"?\n\nKhi bật, quảng cáo có thể hiển thị cho từ khoá này và tiêu tiền.`))
                            && edit({ action: 'keyword_status', groupId: k.groupId, criterionId: k.criterionId, text: k.text, enabled: v },
                            v ? `Đã bật "${k.text}".` : `Đã tạm dừng "${k.text}".`)} />
                </td>
                <td>
                  <span className="mono">{k.matchType === 'EXACT' ? `[${k.text}]` : k.matchType === 'PHRASE' ? `"${k.text}"` : k.text}</span>
                  <div className="cell-sub">
                    {MATCH_VI[k.matchType] ?? k.matchType}{detail.groups.length > 1 ? ` · ${groupName(k.groupId)}` : ''}
                    {k.review ? ` · ${k.review}` : ''}
                  </div>
                </td>
                <td className="n">
                  {!ro && (
                    <button type="button" className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }}
                            onClick={() => confirm(`Xoá từ khoá "${k.text}"?`)
                              && edit({ action: 'keyword_remove', groupId: k.groupId, criterionId: k.criterionId, text: k.text }, `Đã xoá "${k.text}".`)}>
                      Xoá
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!ro && (
        <div style={{ padding: '12px 18px', borderTop: detail.keywords.length ? '1px solid var(--line)' : undefined }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>Thêm từ khoá (mỗi dòng một từ)</div>
          <textarea style={{ ...inputStyle, width: '100%', minHeight: 70, resize: 'vertical' }} value={text}
                    onChange={(e) => setText(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <select style={inputStyle} value={match} onChange={(e) => setMatch(e.target.value as typeof match)}>
              <option value="BROAD">Đối sánh rộng</option>
              <option value="PHRASE">Đối sánh cụm từ</option>
              <option value="EXACT">Đối sánh chính xác</option>
            </select>
            {detail.groups.length > 1 && (
              <select style={inputStyle} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {detail.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <button type="button" className="btn" disabled={!text.trim() || !groupId}
                    onClick={async () => {
                      const keywords = text.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, matchType: match }));
                      if (await edit({ action: 'keyword_add', groupId, keywords }, `Đã thêm ${keywords.length} từ khoá.`)) setText('');
                    }}>Thêm</button>
          </div>
        </div>
      )}
    </div>
  );
}
