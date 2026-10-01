'use client';

// Các ô nhắm đối tượng của mẫu quảng cáo: giới tính, sở thích, tỉnh/thành, vị trí.
//
// Tách khỏi template-browser vì phần này dài gần gấp đôi phần còn lại và có
// trạng thái riêng (ô tìm kiếm, kết quả đang tải).

import { useEffect, useRef, useState } from 'react';
import type { Interest, GeoLocation, Placements, TargetingSpec } from '@/lib/ads/targeting';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5, color: 'var(--dim)', marginBottom: 6,
};

/** Thẻ đã chọn, bấm chữ × để bỏ. */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
      padding: '4px 8px', borderRadius: 'var(--r-sm)',
      background: 'var(--card)', border: '1px solid var(--line-strong)',
    }}>
      {label}
      <button type="button" onClick={onRemove} aria-label={`Bỏ ${label}`}
              style={{
                border: 0, background: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--dim)', fontSize: 14, lineHeight: 1,
              }}>
        ×
      </button>
    </span>
  );
}

interface Row { id: string; label: string; hint?: string }

/**
 * Ô tìm kiếm có gợi ý, chọn được nhiều.
 *
 * Gõ xong đợi 350ms mới gọi API. Facebook tính mỗi lượt tra cứu vào hạn mức
 * gọi API của ứng dụng, mà hạn mức đó cũng là thứ quyết định khi nào được lên
 * Full Access — gọi mỗi phím bấm là đốt hạn mức vô ích.
 */
function SearchPicker<T>({
  label, hint, placeholder, kind, selected, toRow, onAdd, onRemove,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  kind: 'interest' | 'location';
  selected: T[];
  toRow: (t: T) => Row;
  onAdd: (raw: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); setErr(''); return; }
    const mine = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/targeting/search?kind=${kind}&q=${encodeURIComponent(q.trim())}`,
        );
        const json = await res.json().catch(() => ({}));
        // Kết quả của lượt gõ cũ về sau lượt mới thì bỏ, nếu không danh sách
        // sẽ nhảy về chữ người dùng đã gõ xong từ lâu.
        if (mine !== seq.current) return;
        if (!res.ok) { setErr(json.error ?? 'Không tìm được'); setRows([]); }
        else { setErr(''); setRows(json.results ?? []); }
      } catch {
        if (mine === seq.current) { setErr('Không gọi được Facebook'); setRows([]); }
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q, kind]);

  const chosen = selected.map(toRow);
  const chosenIds = new Set(chosen.map((c) => c.id));

  return (
    <div>
      <div style={labelStyle}>
        {label}
        {hint && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {hint}</span>}
      </div>

      {chosen.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
          {chosen.map((c) => (
            <Chip key={c.id} label={c.label} onRemove={() => onRemove(c.id)} />
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <input style={inputStyle} value={q} placeholder={placeholder}
               onChange={(e) => setQ(e.target.value)} />
        {busy && (
          <span style={{
            position: 'absolute', right: 11, top: 10, fontSize: 11.5, color: 'var(--dim)',
          }}>
            đang tìm…
          </span>
        )}
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5 }}>{err}</div>}

      {rows.length > 0 && (
        <div style={{
          marginTop: 5, maxHeight: 190, overflowY: 'auto',
          border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--card)',
        }}>
          {rows.map((r, i) => {
            const id = (r.id ?? r.key) as string;
            const already = chosenIds.has(id);
            const audience = typeof r.audience === 'number' ? r.audience : null;
            return (
              <button key={`${id}-${i}`} type="button" disabled={already}
                      onClick={() => { onAdd(r); setQ(''); setRows([]); }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%',
                        textAlign: 'left', padding: '7px 11px', fontSize: 13,
                        fontFamily: 'inherit', border: 0, borderTop: i ? '1px solid var(--line)' : 0,
                        background: 'none', cursor: already ? 'default' : 'pointer',
                        color: already ? 'var(--dim)' : 'var(--ink)',
                      }}>
                <span>{r.name as string}</span>
                <span style={{ fontSize: 11.5, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                  {already ? 'đã chọn'
                    : audience !== null ? `~${audience.toLocaleString('vi-VN')} người` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const GENDER_CHOICES: { label: string; value: number[] }[] = [
  // Rỗng = không gửi trường genders = mọi giới. Xem buildTargeting.
  { label: 'Mọi giới', value: [] },
  { label: 'Nam', value: [1] },
  { label: 'Nữ', value: [2] },
];

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'audience_network', label: 'Audience Network' },
];

const FB_POSITIONS = [
  { id: 'feed', label: 'Bảng tin' },
  { id: 'facebook_reels', label: 'Reels' },
  { id: 'story', label: 'Tin' },
  { id: 'video_feeds', label: 'Bảng tin video' },
  { id: 'marketplace', label: 'Marketplace' },
];

const IG_POSITIONS = [
  { id: 'stream', label: 'Bảng tin' },
  { id: 'reels', label: 'Reels' },
  { id: 'story', label: 'Tin' },
  { id: 'explore', label: 'Khám phá' },
];

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={on ? 'btn' : 'btn btn-ghost'}
            style={{ fontSize: 12.5 }}>
      {label}
    </button>
  );
}

export interface TargetingDraft {
  genders: number[];
  interests: Interest[];
  locations: GeoLocation[];
  placements: Placements;
  advantageAudience: boolean;
}

export function TargetingFields({
  value, onChange,
}: { value: TargetingDraft; onChange: (v: TargetingDraft) => void }) {
  const p = value.placements;

  function setPlacements(next: Placements) { onChange({ ...value, placements: next }); }

  function toggleIn(list: string[] | undefined, id: string): string[] {
    const cur = list ?? [];
    return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  }

  return (
    <>
      <div>
        <div style={labelStyle}>Giới tính</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {GENDER_CHOICES.map((g) => (
            <Toggle key={g.label} label={g.label}
                    on={value.genders.length === g.value.length
                        && value.genders[0] === g.value[0]}
                    onClick={() => onChange({ ...value, genders: g.value })} />
          ))}
        </div>
      </div>

      <SearchPicker<Interest>
        label="Sở thích" kind="interest"
        hint="để trống là không lọc theo sở thích"
        placeholder="Gõ để tìm — VD: làm đẹp, mẹ và bé, bóng đá"
        selected={value.interests}
        toRow={(i) => ({ id: i.id, label: i.name })}
        onAdd={(r) => onChange({
          ...value,
          interests: [...value.interests, { id: r.id as string, name: r.name as string }],
        })}
        onRemove={(id) => onChange({
          ...value, interests: value.interests.filter((i) => i.id !== id),
        })}
      />

      <SearchPicker<GeoLocation>
        label="Tỉnh / thành phố" kind="location"
        hint="chọn rồi thì KHÔNG nhắm theo quốc gia nữa"
        placeholder="Gõ để tìm — VD: Hà Nội, Đà Nẵng, Bình Dương"
        selected={value.locations}
        toRow={(l) => ({ id: l.key, label: l.name })}
        onAdd={(r) => onChange({
          ...value,
          locations: [...value.locations, {
            type: r.type as 'city' | 'region', key: r.key as string, name: r.name as string,
          }],
        })}
        onRemove={(key) => onChange({
          ...value, locations: value.locations.filter((l) => l.key !== key),
        })}
      />

      <div>
        <div style={labelStyle}>Vị trí hiển thị</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: p.automatic ? 0 : 9 }}>
          <Toggle label="Tự động" on={p.automatic}
                  onClick={() => setPlacements({ automatic: true })} />
          <Toggle label="Tự chọn" on={!p.automatic}
                  onClick={() => setPlacements({
                    automatic: false, publisherPlatforms: ['facebook', 'instagram'],
                  })} />
        </div>

        {p.automatic ? (
          <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 5 }}>
            Facebook tự phân phối sang nơi rẻ nhất. Thường tốt hơn tự chọn tay —
            chỉ nên tự chọn khi bạn có lý do cụ thể.
          </div>
        ) : (
          <div style={{
            display: 'grid', gap: 9, padding: '11px 12px',
            border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--card)',
          }}>
            <div>
              <div style={labelStyle}>Nền tảng</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PLATFORMS.map((x) => (
                  <Toggle key={x.id} label={x.label}
                          on={(p.publisherPlatforms ?? []).includes(x.id)}
                          onClick={() => setPlacements({
                            ...p, publisherPlatforms: toggleIn(p.publisherPlatforms, x.id),
                          })} />
                ))}
              </div>
              {(p.publisherPlatforms?.length ?? 0) === 0 && (
                <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>
                  Phải chọn ít nhất một nền tảng, nếu không quảng cáo không hiển thị ở đâu cả.
                </div>
              )}
            </div>

            {(p.publisherPlatforms ?? []).includes('facebook') && (
              <div>
                <div style={labelStyle}>Vị trí trên Facebook · để trống là tất cả</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {FB_POSITIONS.map((x) => (
                    <Toggle key={x.id} label={x.label}
                            on={(p.facebookPositions ?? []).includes(x.id)}
                            onClick={() => setPlacements({
                              ...p, facebookPositions: toggleIn(p.facebookPositions, x.id),
                            })} />
                  ))}
                </div>
              </div>
            )}

            {(p.publisherPlatforms ?? []).includes('instagram') && (
              <div>
                <div style={labelStyle}>Vị trí trên Instagram · để trống là tất cả</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {IG_POSITIONS.map((x) => (
                    <Toggle key={x.id} label={x.label}
                            on={(p.instagramPositions ?? []).includes(x.id)}
                            onClick={() => setPlacements({
                              ...p, instagramPositions: toggleIn(p.instagramPositions, x.id),
                            })} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={value.advantageAudience} style={{ marginTop: 3 }}
               onChange={(e) => onChange({ ...value, advantageAudience: e.target.checked })} />
        <span style={{ fontSize: 13 }}>
          Mở rộng đối tượng (Advantage+ Audience)
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--dim)', marginTop: 2 }}>
            Bật lên thì <b>tuổi và giới tính thành gợi ý, không còn là giới hạn</b> —
            Facebook được phép phân phối ra ngoài khoảng bạn chọn nếu thấy nhóm
            khác rẻ hơn. Đây là quy định của Facebook, không phải lựa chọn của
            Ads OS: nó từ chối thẳng nhóm quảng cáo nào vừa bật mở rộng vừa chặn
            cứng tuổi. Tỉnh/thành thì vẫn được giữ nguyên.
          </span>
        </span>
      </label>
    </>
  );
}

/**
 * Ước tính số người tiếp cận được, cập nhật theo lựa chọn.
 *
 * Cố ý đợi 700ms — lâu hơn ô tìm kiếm — vì mỗi lần đổi một nút giới tính là
 * một lượt gọi Facebook, và người dùng thường bấm liền mấy nút.
 */
export function ReachEstimate({ spec }: { spec: TargetingSpec }) {
  const [state, setState] = useState<
    { kind: 'idle' | 'busy' } | { kind: 'ok'; lower: number; upper: number }
    | { kind: 'err'; message: string }
  >({ kind: 'idle' });
  const seq = useRef(0);

  // Chuỗi hoá để useEffect so sánh được theo giá trị — spec là object mới mỗi
  // lần render, so sánh theo tham chiếu sẽ gọi API vô tận.
  const key = JSON.stringify(spec);

  useEffect(() => {
    const mine = ++seq.current;
    setState({ kind: 'busy' });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/targeting/estimate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key,
        });
        const json = await res.json().catch(() => ({}));
        if (mine !== seq.current) return;
        if (!res.ok) setState({ kind: 'err', message: json.error ?? 'Không ước tính được' });
        else setState({ kind: 'ok', lower: json.lower, upper: json.upper });
      } catch {
        if (mine === seq.current) setState({ kind: 'err', message: 'Không gọi được Facebook' });
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [key]);

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--r-sm)',
      background: 'var(--card)', border: '1px solid var(--line)',
    }}>
      <div style={labelStyle}>Tiếp cận ước tính mỗi tháng</div>
      {state.kind === 'ok' ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {state.lower.toLocaleString('vi-VN')} – {state.upper.toLocaleString('vi-VN')} người
          </div>
          {state.upper < 10_000 && (
            <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>
              Nhóm này rất hẹp. Facebook cần vài nghìn người mới phân phối ổn định —
              hẹp quá thì quảng cáo tiêu không hết ngân sách và giá mỗi kết quả đắt lên.
            </div>
          )}
        </>
      ) : state.kind === 'err' ? (
        <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{state.message}</div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>đang tính…</div>
      )}
      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>
        Số của Facebook, chỉ để so sánh rộng/hẹp — không phải số người sẽ thấy quảng cáo.
      </div>
    </div>
  );
}
