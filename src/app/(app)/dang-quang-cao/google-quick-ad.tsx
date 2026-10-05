'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LIMITS, checkSpec, type GoogleCampaignKind, type GoogleBidding, type KeywordMatch,
  type GoogleCreateSpec,
} from '@/lib/ads/google-create-spec';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: hint ? 2 : 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

const KINDS: { kind: GoogleCampaignKind; title: string; body: string }[] = [
  { kind: 'SEARCH', title: 'Tìm kiếm', body: 'Quảng cáo chữ khi khách gõ từ khoá trên Google. Chỉ cần chữ, không cần ảnh.' },
  { kind: 'PERFORMANCE_MAX', title: 'Performance Max', body: 'Google tự phân phối khắp Search, YouTube, Display, Gmail, Maps. Cần ảnh và logo.' },
  { kind: 'DISPLAY', title: 'Hiển thị', body: 'Banner trên hàng triệu website và app đối tác của Google. Cần ảnh ngang và vuông.' },
  { kind: 'DEMAND_GEN', title: 'Demand Gen', body: 'Quảng cáo hình ảnh trên YouTube, Discover, Gmail. Cần ảnh và logo; tối thiểu 125.000đ/ngày.' },
];

const BIDDING_LABEL: Record<GoogleBidding, string> = {
  MAXIMIZE_CLICKS: 'Tối đa lượt nhấp',
  MAXIMIZE_CONVERSIONS: 'Tối đa chuyển đổi',
};

const MATCH_LABEL: Record<KeywordMatch, string> = {
  BROAD: 'Đối sánh rộng', PHRASE: 'Đối sánh cụm từ', EXACT: 'Đối sánh chính xác',
};

const LANGUAGES = [
  { id: '1040', label: 'Tiếng Việt' },
  { id: '1000', label: 'Tiếng Anh' },
];

/** Kích thước xuất cho từng loại ảnh — đúng tỉ lệ Google đòi, đủ lớn để nét. */
const IMAGE_SPEC = {
  landscape: { w: 1200, h: 628, label: 'Ảnh ngang 1.91:1', mime: 'image/jpeg' },
  square: { w: 1200, h: 1200, label: 'Ảnh vuông 1:1', mime: 'image/jpeg' },
  logo: { w: 512, h: 512, label: 'Logo 1:1', mime: 'image/png' },
} as const;
type ImageKind = keyof typeof IMAGE_SPEC;

/**
 * Cắt giữa ảnh về ĐÚNG tỉ lệ rồi nén. Làm ở trình duyệt vì hai lẽ: Google từ
 * chối ảnh lệch tỉ lệ (ASPECT_RATIO_NOT_ALLOWED), và ảnh gốc từ điện thoại
 * 5–10MB sẽ vượt giới hạn request.
 */
async function cropToSpec(file: File, kind: ImageKind): Promise<string> {
  const spec = IMAGE_SPEC[kind];
  const bmp = await createImageBitmap(file);
  const target = spec.w / spec.h;
  let sw = bmp.width, sh = bmp.height;
  if (sw / sh > target) sw = Math.round(sh * target); else sh = Math.round(sw / target);
  const sx = Math.round((bmp.width - sw) / 2), sy = Math.round((bmp.height - sh) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = spec.w; canvas.height = spec.h;
  const ctx = canvas.getContext('2d')!;
  if (spec.mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, spec.w, spec.h); }
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, spec.w, spec.h);
  bmp.close();
  return canvas.toDataURL(spec.mime, 0.88);
}

/** Danh sách ô chữ có đếm ký tự — dùng cho tiêu đề, tiêu đề dài, mô tả. */
function TextList({ items, setItems, range, placeholder }: {
  items: string[]; setItems: (v: string[]) => void;
  range: [number, number, number]; placeholder: string;
}) {
  const [min, max, len] = range;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((v, i) => {
        const n = [...v].length;
        return (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input style={{ ...inputStyle, borderColor: n > len ? 'var(--red)' : undefined }}
                   value={v} placeholder={`${placeholder} ${i + 1}`}
                   onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <span className="mono" style={{ fontSize: 11, width: 44, textAlign: 'right',
                                            color: n > len ? 'var(--red)' : 'var(--dim)' }}>
              {n}/{len}
            </span>
            {items.length > min && (
              <button type="button" className="btn btn-ghost" style={{ padding: '6px 9px', fontSize: 12 }}
                      onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
            )}
          </div>
        );
      })}
      {items.length < max && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, justifySelf: 'start' }}
                onClick={() => setItems([...items, ''])}>+ Thêm</button>
      )}
    </div>
  );
}

interface Geo { id: string; name: string; canonical: string; type?: string }

function GeoPicker({ accountId, value, onChange }: {
  accountId: string; value: Geo[]; onChange: (v: Geo[]) => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<(Geo & { type: string })[]>([]);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seq = useRef(0);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setItems([]); return; }
    timer.current = setTimeout(async () => {
      // Gõ nhanh thì request cũ có thể về SAU request mới — chỉ nhận kết quả
      // của lần gõ gần nhất.
      const mine = ++seq.current;
      try {
        const res = await fetch(`/api/google/geo?account=${accountId}&q=${encodeURIComponent(q.trim())}`);
        const d = await res.json().catch(() => ({}));
        if (mine !== seq.current) return;
        if (res.ok) { setItems(d.items ?? []); setErr(''); } else { setItems([]); setErr(d.error ?? 'Không tìm được'); }
      } catch {
        if (mine === seq.current) { setItems([]); setErr('Không gọi được máy chủ'); }
      }
    }, 350);
  }, [q, accountId]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {value.map((g) => (
          <span key={g.id} className="tag tag-keep" title={g.canonical}
                style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {g.name}
            <button type="button" onClick={() => onChange(value.filter((x) => x.id !== g.id))}
                    style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <input style={inputStyle} value={q} onChange={(e) => setQ(e.target.value)}
             placeholder="Gõ tên tỉnh, thành phố… để thêm" />
      {err && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>{err}</div>}
      {items.length > 0 && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
          {items.map((g) => (
            <button key={g.id} type="button"
                    onClick={() => {
                      if (!value.some((x) => x.id === g.id)) {
                        // Google nhắm HỢP của các vị trí: giữ "Việt Nam" cạnh "Hà Nội"
                        // là vẫn chạy cả nước — đã xảy ra thật với chiến dịch đầu tiên.
                        // Thêm vị trí nhỏ hơn thì bỏ quốc gia; thêm quốc gia thì bỏ
                        // các vị trí nhỏ hơn.
                        const isCountry = g.type === 'Country';
                        const kept = value.filter((x) => (isCountry ? x.type === 'Country' : x.type !== 'Country'));
                        onChange([...kept, g]);
                      }
                      setQ(''); setItems([]);
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
  );
}

function ImagePicker({ kind, items, setItems, max }: {
  kind: ImageKind; items: string[];
  /** Nhận HÀM cập nhật: cắt ảnh mất vài giây, danh sách lúc bắt đầu có thể đã cũ. */
  setItems: (fn: (prev: string[]) => string[]) => void; max: number;
}) {
  const spec = IMAGE_SPEC[kind];
  const [busy, setBusy] = useState(false);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, max - items.length)) {
      try { out.push(await cropToSpec(f, kind)); } catch { /* bỏ file không đọc được */ }
    }
    setBusy(false);
    setItems((prev) => [...prev, ...out].slice(0, max));
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {items.map((src, i) => (
          <div key={i} style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" style={{ height: 64, borderRadius: 6, border: '1px solid var(--line)' }} />
            <button type="button" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
                             border: '1px solid var(--line-strong)', background: 'var(--card)', cursor: 'pointer',
                             fontSize: 12, lineHeight: '16px' }}>×</button>
          </div>
        ))}
        {items.length < max && (
          <label className="btn btn-ghost" style={{ fontSize: 12, cursor: 'pointer' }}>
            {busy ? 'Đang xử lý…' : `+ ${spec.label}`}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
        Tự cắt giữa về {spec.w}×{spec.h}. Nên chọn ảnh có chủ thể ở giữa.
      </div>
    </div>
  );
}

const dataPart = (src: string) => src.slice(src.indexOf(',') + 1);

export function GoogleQuickAd({ accounts, defaultAccountId }: {
  accounts: { id: string; name: string; currency: string }[];
  defaultAccountId: string | null;
}) {
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId! : accounts[0]?.id ?? '',
  );
  const [kind, setKind] = useState<GoogleCampaignKind>('SEARCH');
  const L = LIMITS[kind];
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('200000');
  const [bidding, setBidding] = useState<GoogleBidding>('MAXIMIZE_CLICKS');
  const [targetCpa, setTargetCpa] = useState('');
  const [geos, setGeos] = useState<Geo[]>([{ id: '2704', name: 'Việt Nam', canonical: 'Vietnam', type: 'Country' }]);
  const [langs, setLangs] = useState<string[]>(['1040']);
  const [finalUrl, setFinalUrl] = useState('https://');
  const [path1, setPath1] = useState('');
  const [path2, setPath2] = useState('');
  const [headlines, setHeadlines] = useState<string[]>(['', '', '']);
  const [longHeadlines, setLongHeadlines] = useState<string[]>(['']);
  const [descriptions, setDescriptions] = useState<string[]>(['', '']);
  const [businessName, setBusinessName] = useState('');
  const [keywordText, setKeywordText] = useState('');
  const [matchType, setMatchType] = useState<KeywordMatch>('PHRASE');
  const [images, setImages] = useState<Record<ImageKind, string[]>>({ landscape: [], square: [], logo: [] });

  const [busy, setBusy] = useState<'validate' | 'create' | null>(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [created, setCreated] = useState<{ campaignId: string } | null>(null);

  // Đổi loại: chiến lược giá thầu cũ có thể không còn hợp lệ (PMax chỉ nhận
  // tối đa chuyển đổi), và số ô tối thiểu khác nhau — kéo về cho đủ.
  useEffect(() => {
    if (!L.bidding.includes(bidding)) setBidding(L.bidding[0]!);
    const pad = (xs: string[], min: number, max: number) =>
      [...xs, ...Array(Math.max(0, min - xs.length)).fill('')].slice(0, Math.max(max, 1));
    setHeadlines((h) => pad(h, L.headlines[0], L.headlines[1]));
    setDescriptions((d) => pad(d, L.descriptions[0], L.descriptions[1]));
    if (L.longHeadlines) setLongHeadlines((h) => pad(h, L.longHeadlines![0], L.longHeadlines![1]));
    setError(''); setOkMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const keywords = useMemo(() => keywordText.split('\n').map((k) => k.trim()).filter(Boolean)
    .map((text) => ({ text, matchType })), [keywordText, matchType]);

  const spec: GoogleCreateSpec = {
    kind, name: name.trim(), dailyBudgetMicros: (Number(budget) || 0) * 1_000_000, bidding,
    targetCpaMicros: bidding === 'MAXIMIZE_CONVERSIONS' && Number(targetCpa) > 0 ? Number(targetCpa) * 1_000_000 : null,
    geoTargets: geos.map((g) => g.id), languages: langs, finalUrl: finalUrl.trim(),
    headlines, longHeadlines: L.longHeadlines ? longHeadlines : undefined, descriptions,
    businessName: L.businessName ? businessName : undefined,
    path1: kind === 'SEARCH' ? path1.trim() : undefined, path2: kind === 'SEARCH' ? path2.trim() : undefined,
    keywords: L.keywords ? keywords : undefined,
    images: L.images ? images : undefined,
  };
  const problems = [...checkSpec(spec), ...(name.trim() ? [] : ['Thiếu tên chiến dịch']),
    ...(Number(budget) > 0 ? [] : ['Ngân sách phải lớn hơn 0'])];
  const account = accounts.find((a) => a.id === accountId);
  // VND không có phần lẻ; USD… cho 2 chữ số. Lọc mọi ký tự không phải số sẽ
  // biến "7.50" thành "750".
  const amount = (raw: string) => {
    if ((account?.currency ?? 'VND') === 'VND') return raw.replace(/\D/g, '');
    const [int, ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.');
    return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int!;
  };

  async function send(validateOnly: boolean) {
    setBusy(validateOnly ? 'validate' : 'create'); setError(''); setOkMsg('');
    const res = await fetch('/api/ads/google-quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adAccountId: accountId, kind, name: name.trim(), dailyBudget: Number(budget), bidding,
        targetCpa: bidding === 'MAXIMIZE_CONVERSIONS' && Number(targetCpa) > 0 ? Number(targetCpa) : null,
        geoTargets: spec.geoTargets, languages: langs, finalUrl: spec.finalUrl,
        headlines: headlines.filter((x) => x.trim()),
        longHeadlines: L.longHeadlines ? longHeadlines.filter((x) => x.trim()) : undefined,
        descriptions: descriptions.filter((x) => x.trim()),
        businessName: L.businessName ? businessName.trim() : undefined,
        path1: spec.path1 || undefined, path2: spec.path2 || undefined,
        keywords: spec.keywords,
        images: L.images ? {
          landscape: images.landscape.map(dataPart),
          square: images.square.map(dataPart),
          // Display bỏ logo — xem google-create.ts.
          logo: kind === 'DISPLAY' ? [] : images.logo.map(dataPart),
        } : undefined,
        validateOnly,
      }),
    }).catch(() => null);
    if (!res) {
      setBusy(null);
      setError(validateOnly
        ? 'Không gửi được yêu cầu — kiểm tra kết nối mạng rồi thử lại.'
        : 'Không gửi được yêu cầu. Nếu yêu cầu đã tới máy chủ, chiến dịch có thể đã được tạo — xem Nhật ký thay đổi trước khi bấm lại.');
      return;
    }
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(d.error ?? 'Thao tác thất bại'); return; }
    if (validateOnly) setOkMsg('Google đã kiểm toàn bộ cấu hình và không thấy lỗi. Chưa có gì được tạo.');
    else setCreated({ campaignId: d.campaignId });
  }

  if (accounts.length === 0) {
    return (
      <div className="card"><div className="empty">
        <div style={{ marginBottom: 12 }}>Chưa có tài khoản Google Ads nào đang bật.</div>
        <Link href="/connections" className="btn">Kết nối Google Ads</Link>
      </div></div>
    );
  }

  if (created) {
    return (
      <div className="card">
        <div className="card-head"><b>Đã tạo xong</b></div>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ background: 'var(--grn-soft)', color: 'var(--grn)', padding: '13px 15px',
                        borderRadius: 'var(--r-sm)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
            <b>Chiến dịch đã tạo và đang TẠM DỪNG — chưa tiêu đồng nào.</b>
            <br />Vào Google Ads kiểm tra lại rồi tự bật khi bạn thấy ổn.
          </div>
          <div className="note" style={{ maxWidth: 'none', margin: '0 0 14px', lineHeight: 1.7 }}>
            <b>Google sẽ ghi nhóm quảng cáo và quảng cáo là &ldquo;Không đủ điều kiện&rdquo; — đó
            là bình thường</b>, vì hai lý do: chiến dịch đang tạm dừng, và quảng cáo đang chờ
            Google duyệt (thường trong 1 ngày làm việc). Bật chiến dịch xong và quảng cáo được
            duyệt thì trạng thái chuyển sang &ldquo;Đủ điều kiện&rdquo;. Nếu sau 2 ngày vẫn còn
            &ldquo;Đang xem xét&rdquo; hoặc bị &ldquo;Từ chối&rdquo;, vào cột Trạng thái của quảng
            cáo trong Google Ads để xem lý do.
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>chiến dịch {created.campaignId}</div>
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <button className="btn" onClick={() => { setCreated(null); setName(''); }}>Tạo chiến dịch khác</button>
            <Link href="/log" className="btn btn-ghost">Xem nhật ký</Link>
          </div>
        </div>
      </div>
    );
  }

  const currency = account?.currency === 'VND' ? 'đ' : ` ${account?.currency ?? ''}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }} className="split">
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card">
          <div className="card-head"><b>Loại chiến dịch</b></div>
          <div style={{ padding: 14, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {KINDS.map((k) => {
              const on = k.kind === kind;
              return (
                <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
                        style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                 fontFamily: 'inherit', border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                                 background: on ? 'var(--acc-soft)' : 'var(--card)', color: 'var(--ink)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: on ? 'var(--acc-ink)' : undefined }}>{k.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>{k.body}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><b>Cài đặt chiến dịch</b></div>
          <div style={{ padding: '16px 20px' }}>
            <Field label="Tài khoản Google Ads">
              <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
            <Field label="Tên chiến dịch">
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="vd: Search - Khoá học AI - 10/2026" />
            </Field>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <Field label={`Ngân sách/ngày (${account?.currency ?? ''})`}
                     hint={kind === 'DEMAND_GEN' ? 'Demand Gen tối thiểu 125.000đ/ngày' : undefined}>
                <input style={inputStyle} inputMode="numeric" value={budget}
                       onChange={(e) => setBudget(amount(e.target.value))} />
              </Field>
              <Field label="Chiến lược giá thầu">
                <select style={inputStyle} value={bidding} onChange={(e) => setBidding(e.target.value as GoogleBidding)}>
                  {L.bidding.map((b) => <option key={b} value={b}>{BIDDING_LABEL[b]}</option>)}
                </select>
              </Field>
              {bidding === 'MAXIMIZE_CONVERSIONS' && (
                <Field label="CPA mục tiêu (tuỳ chọn)">
                  <input style={inputStyle} inputMode="numeric" value={targetCpa} placeholder="để trống = Google tự tối ưu"
                         onChange={(e) => setTargetCpa(amount(e.target.value))} />
                </Field>
              )}
            </div>
            {bidding === 'MAXIMIZE_CONVERSIONS' && (
              <div className="note" style={{ maxWidth: 'none', margin: '-6px 0 14px' }}>
                Cần tài khoản đã có hành động chuyển đổi và đã cài thẻ lên website. Chưa có thì
                Google từ chối — chọn Tối đa lượt nhấp.
              </div>
            )}
            <Field label="Vị trí" hint="Mặc định cả Việt Nam. Thêm tỉnh/thành thì Việt Nam tự được bỏ, để quảng cáo chỉ chạy ở nơi bạn chọn.">
              <GeoPicker accountId={accountId} value={geos} onChange={setGeos} />
            </Field>
            <Field label="Ngôn ngữ">
              <div style={{ display: 'flex', gap: 14 }}>
                {LANGUAGES.map((l) => (
                  <label key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={langs.includes(l.id)}
                           onChange={(e) => setLangs(e.target.checked ? [...langs, l.id] : langs.filter((x) => x !== l.id))} />
                    {l.label}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><b>Nội dung quảng cáo</b></div>
          <div style={{ padding: '16px 20px' }}>
            <Field label="URL đích" hint="Trang khách đến khi bấm quảng cáo.">
              <input style={inputStyle} value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)} />
            </Field>
            {kind === 'SEARCH' && (
              <Field label="Đường dẫn hiển thị (tuỳ chọn)" hint="Hiện sau tên miền, vd taki.vn/khoa-hoc/ai. Tối đa 15 ký tự mỗi phần.">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={inputStyle} value={path1} maxLength={15} placeholder="khoa-hoc" onChange={(e) => setPath1(e.target.value)} />
                  <input style={inputStyle} value={path2} maxLength={15} placeholder="ai" onChange={(e) => setPath2(e.target.value)} />
                </div>
              </Field>
            )}
            {L.businessName && (
              <Field label="Tên doanh nghiệp">
                <input style={inputStyle} value={businessName} maxLength={25} onChange={(e) => setBusinessName(e.target.value)} />
              </Field>
            )}
            <Field label={`Tiêu đề (${L.headlines[0]}–${L.headlines[1]})`}
                   hint="Viết khác nhau hẳn — Google tự ghép thử các tổ hợp và giữ tổ hợp chạy tốt.">
              <TextList items={headlines} setItems={setHeadlines} range={L.headlines} placeholder="Tiêu đề" />
            </Field>
            {L.longHeadlines && (
              <Field label={`Tiêu đề dài (${L.longHeadlines[0] === L.longHeadlines[1] ? L.longHeadlines[0] : `${L.longHeadlines[0]}–${L.longHeadlines[1]}`})`}>
                <TextList items={longHeadlines} setItems={setLongHeadlines} range={L.longHeadlines} placeholder="Tiêu đề dài" />
              </Field>
            )}
            <Field label={`Mô tả (${L.descriptions[0]}–${L.descriptions[1]})`}>
              <TextList items={descriptions} setItems={setDescriptions} range={L.descriptions} placeholder="Mô tả" />
            </Field>
            {L.keywords && (
              <Field label="Từ khoá" hint="Mỗi dòng một từ khoá.">
                <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} value={keywordText}
                          onChange={(e) => setKeywordText(e.target.value)} placeholder={'khoá học ai\nhọc ai cho doanh nghiệp'} />
                <select style={{ ...inputStyle, marginTop: 6 }} value={matchType} onChange={(e) => setMatchType(e.target.value as KeywordMatch)}>
                  {(Object.keys(MATCH_LABEL) as KeywordMatch[]).map((m) => <option key={m} value={m}>{MATCH_LABEL[m]}</option>)}
                </select>
              </Field>
            )}
            {L.images && (
              <>
                <Field label="Ảnh ngang"><ImagePicker kind="landscape" items={images.landscape} max={5}
                  setItems={(fn) => setImages((prev) => ({ ...prev, landscape: fn(prev.landscape) }))} /></Field>
                <Field label="Ảnh vuông"><ImagePicker kind="square" items={images.square} max={5}
                  setItems={(fn) => setImages((prev) => ({ ...prev, square: fn(prev.square) }))} /></Field>
                {kind !== 'DISPLAY' && (
                  <Field label="Logo"><ImagePicker kind="logo" items={images.logo} max={5}
                    setItems={(fn) => setImages((prev) => ({ ...prev, logo: fn(prev.logo) }))} /></Field>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ position: 'sticky', top: 16 }}>
        <div className="card-head"><b>Sẽ tạo ra</b></div>
        <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.85 }}>
          {error && <div className="err" style={{ marginBottom: 10 }}>{error}</div>}
          {okMsg && (
            <div style={{ background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5, padding: '10px 12px',
                          borderRadius: 'var(--r-sm)', marginBottom: 10, lineHeight: 1.5 }}>{okMsg}</div>
          )}
          <div>Loại <b>{KINDS.find((k) => k.kind === kind)?.title}</b></div>
          <div>Ngân sách <b>{(Number(budget) || 0).toLocaleString('vi-VN')}{currency}/ngày</b></div>
          <div>Giá thầu <b>{BIDDING_LABEL[bidding]}</b></div>
          <div>Vị trí <b>{geos.map((g) => g.name).join(', ') || '—'}</b></div>
          {kind === 'SEARCH' && <div>Từ khoá <b>{keywords.length}</b></div>}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Trạng thái <span className="tag tag-hold">TẠM DỪNG</span>
          </div>

          {problems.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--amb)', fontSize: 12, lineHeight: 1.6 }}>
              {problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <button className="btn btn-ghost" disabled={problems.length > 0 || busy !== null} onClick={() => send(true)}>
              {busy === 'validate' ? 'Đang kiểm…' : 'Kiểm tra trước'}
            </button>
            <button className="btn" disabled={problems.length > 0 || busy !== null} onClick={() => send(false)}>
              {busy === 'create' ? 'Đang tạo…' : 'Tạo chiến dịch (tạm dừng)'}
            </button>
          </div>
          <div className="note" style={{ maxWidth: 'none', marginTop: 10 }}>
            <b>Kiểm tra trước</b> gửi toàn bộ cấu hình cho Google kiểm y như thật mà <b>không tạo
            gì</b>. Tạo thật cũng là một lệnh trọn gói: hỏng một chỗ thì Google không tạo gì cả.
          </div>
        </div>
      </div>
    </div>
  );
}
