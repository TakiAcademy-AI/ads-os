'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdTemplate } from '@/lib/queries/templates';
import { TargetingFields, ReachEstimate, ObjectiveFields, type TargetingDraft } from './targeting-fields';
import { OBJECTIVE, type AdObjective } from '@/lib/ads/objectives';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

const COUNTRIES = [
  { code: 'VN', label: 'Việt Nam' },
  { code: 'US', label: 'Mỹ' },
  { code: 'TH', label: 'Thái Lan' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'PH', label: 'Philippines' },
  { code: 'MY', label: 'Malaysia' },
];

interface Draft extends TargetingDraft {
  id?: string;
  name: string;
  objective: AdObjective;
  pixelId: string | null;
  conversionEvent: string | null;
  countries: string[];
  ageMin: number;
  ageMax: number;
  budget: number;   // đồng, không phải micros — người dùng gõ số thật
}

const BLANK: Draft = {
  name: '', countries: ['VN'], ageMin: 18, ageMax: 65, budget: 50_000,
  genders: [], interests: [], locations: [],
  placements: { automatic: true }, advantageAudience: false,
  objective: 'engagement', pixelId: null, conversionEvent: null,
};

function toDraft(t: AdTemplate): Draft {
  return {
    id: t.id, name: t.name, countries: t.countries,
    ageMin: t.ageMin, ageMax: t.ageMax,
    budget: Math.round(t.dailyBudgetMicros / 1_000_000),
    genders: t.genders, interests: t.interests, locations: t.locations,
    placements: t.placements, advantageAudience: t.advantageAudience,
    objective: t.objective, pixelId: t.pixelId, conversionEvent: t.conversionEvent,
  };
}

/** Mô tả nhắm đối tượng gọn một dòng cho bảng danh sách. */
function summarize(t: AdTemplate): string {
  const parts: string[] = [];
  parts.push(t.locations.length
    ? t.locations.map((l) => l.name).join(', ')
    : t.countries.map((c) => COUNTRIES.find((x) => x.code === c)?.label ?? c).join(', '));
  if (t.genders.length === 1) parts.push(t.genders[0] === 1 ? 'nam' : 'nữ');
  if (t.interests.length) parts.push(`${t.interests.length} sở thích`);
  if (!t.placements.automatic) parts.push('vị trí tự chọn');
  if (t.advantageAudience) parts.push('mở rộng');
  return parts.join(' · ');
}

export function TemplateBrowser({ templates }: { templates: AdTemplate[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    const body = {
      name: draft.name.trim(),
      countries: draft.countries,
      ageMin: draft.ageMin,
      ageMax: draft.ageMax,
      dailyBudgetMicros: Math.round(draft.budget * 1_000_000),
      genders: draft.genders,
      interests: draft.interests,
      locations: draft.locations,
      placements: draft.placements,
      advantageAudience: draft.advantageAudience,
      objective: draft.objective,
      pixelId: draft.pixelId,
      conversionEvent: draft.conversionEvent,
    };
    const res = await fetch(draft.id ? `/api/templates/${draft.id}` : '/api/templates', {
      method: draft.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) { setDraft(null); router.refresh(); }
    else setError((await res.json().catch(() => ({}))).error ?? 'Không lưu được');
  }

  async function remove(t: AdTemplate) {
    if (!window.confirm(`Xoá mẫu "${t.name}"?`)) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? 'Không xoá được');
  }

  function toggleCountry(code: string) {
    if (!draft) return;
    const has = draft.countries.includes(code);
    // Ít nhất một quốc gia — nhắm đối tượng rỗng thì Facebook từ chối cả chuỗi.
    if (has && draft.countries.length === 1) return;
    setDraft({
      ...draft,
      countries: has ? draft.countries.filter((c) => c !== code) : [...draft.countries, code],
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <b>Mẫu quảng cáo</b>
        <button className="btn" onClick={() => setDraft({ ...BLANK })}>+ Thêm mẫu</button>
      </div>

      {error && <div className="err" style={{ margin: '14px 18px 0' }}>{error}</div>}

      {draft && (
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)', background: 'var(--side)' }}>
          <div style={{ display: 'grid', gap: 11 }}>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tên mẫu</div>
              <input style={inputStyle} value={draft.name} autoFocus
                     placeholder="VD: Nữ 25-45 toàn quốc, 100k/ngày"
                     onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <ObjectiveFields objective={draft.objective} pixelId={draft.pixelId}
                             conversionEvent={draft.conversionEvent}
                             onChange={(v) => setDraft({ ...draft, ...v })} />

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 6 }}>Quốc gia</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap',
                            opacity: draft.locations.length ? 0.45 : 1 }}>
                {COUNTRIES.map((c) => (
                  <button key={c.code} type="button" onClick={() => toggleCountry(c.code)}
                          className={draft.countries.includes(c.code) ? 'btn' : 'btn btn-ghost'}
                          style={{ fontSize: 12.5 }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {draft.locations.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 6 }}>
                  Đang bỏ qua vì bạn đã chọn tỉnh/thành bên dưới. Bỏ hết tỉnh/thành
                  thì quay lại nhắm theo quốc gia.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 9 }}>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tuổi từ</div>
                <input type="number" min={13} max={65} style={inputStyle} value={draft.ageMin}
                       onChange={(e) => setDraft({ ...draft, ageMin: Number(e.target.value) })} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>đến</div>
                <input type="number" min={13} max={65} style={inputStyle} value={draft.ageMax}
                       onChange={(e) => setDraft({ ...draft, ageMax: Number(e.target.value) })} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Ngân sách/ngày (đ)</div>
                <input type="number" min={1000} step={1000} style={inputStyle} value={draft.budget}
                       onChange={(e) => setDraft({ ...draft, budget: Number(e.target.value) })} />
              </div>
            </div>

            <TargetingFields value={draft} onChange={(v) => setDraft({ ...draft, ...v })} />

            <ReachEstimate spec={{
              countries: draft.countries, locations: draft.locations,
              ageMin: draft.ageMin, ageMax: draft.ageMax, genders: draft.genders,
              interests: draft.interests, placements: draft.placements,
              advantageAudience: draft.advantageAudience,
            }} objective={draft.objective} />

            <div style={{ display: 'flex', gap: 9 }}>
              <button className="btn" onClick={save}
                      disabled={busy || !draft.name.trim() || draft.ageMax < draft.ageMin
                                || (!draft.placements.automatic
                                    && (draft.placements.publisherPlatforms?.length ?? 0) === 0)
                                || (draft.objective === 'sales'
                                    && (!draft.pixelId || !draft.conversionEvent))}>
                {busy ? 'Đang lưu…' : draft.id ? 'Lưu thay đổi' : 'Tạo mẫu'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setDraft(null); setError(''); }}>
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}

      {templates.length === 0 && !draft ? (
        <div className="empty">
          <div style={{ marginBottom: 12 }}>
            Chưa có mẫu nào. Mẫu là phần nhắm đối tượng và ngân sách dùng chung —
            đặt một lần rồi dùng cho cả đăng quảng cáo tay lẫn Tự động chạy ads.
          </div>
          <button className="btn" onClick={() => setDraft({ ...BLANK })}>Tạo mẫu đầu tiên</button>
        </div>
      ) : templates.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Tên mẫu</th>
              <th>Mục tiêu</th>
              <th>Nhắm đối tượng</th>
              <th>Tuổi</th>
              <th className="n">Ngân sách/ngày</th>
              <th className="n">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td><div className="cell-title">{t.name}</div></td>
                <td style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
                  {OBJECTIVE[t.objective].label}
                </td>
                <td style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{summarize(t)}</td>
                <td className="mono" style={{ color: 'var(--ink-2)' }}>{t.ageMin}–{t.ageMax}</td>
                <td className="n mono">{t.dailyBudgetMicros / 1_000_000 >= 1
                  ? `${Math.round(t.dailyBudgetMicros / 1_000_000).toLocaleString('vi-VN')}đ` : '—'}</td>
                <td className="n">
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" disabled={busy}
                            style={{ fontSize: 12, padding: '5px 11px' }}
                            onClick={() => setDraft(toDraft(t))}>
                      Sửa
                    </button>
                    <button className="btn btn-ghost" disabled={busy}
                            style={{ fontSize: 12, padding: '5px 11px', color: 'var(--red)' }}
                            onClick={() => remove(t)}>
                      Xoá
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
