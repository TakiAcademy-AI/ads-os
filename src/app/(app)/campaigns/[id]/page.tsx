import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { campaignRef, loadCampaignDetail } from '@/lib/ads/campaign-detail';
import type { CampaignDetail } from '@/lib/ads/campaign-detail-types';
import { money, num, dateTime } from '@/lib/format';
import { CampaignEditor } from './campaign-editor';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, string> = { facebook: 'Facebook', google: 'Google Ads', tiktok: 'TikTok' };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ref = await campaignRef(id, user.id);
  if (!ref) notFound();

  // Đọc trực tiếp từ nền tảng: trạng thái duyệt, lý do không chạy… không có
  // trong database, và số trong database có thể đã cũ từ lượt đồng bộ trước.
  let detail: CampaignDetail | null = null;
  let loadError = '';
  try {
    detail = await loadCampaignDetail(ref);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const [{ rows: daily }, { rows: log }] = await Promise.all([
    db.query(
      `SELECT to_char(date,'YYYY-MM-DD') d, spend_micros, impressions, clicks, conversions
       FROM ad_metric_daily
       WHERE campaign_id = $1 AND date > CURRENT_DATE - 30
       ORDER BY date DESC`,
      [ref.id],
    ),
    db.query(
      `SELECT operation, status, mode, target_name, before_value, after_value, reason,
              error_message, created_at
       FROM ad_mutation
       WHERE ad_account_id = $1 AND (campaign_id = $2 OR target_external_id = $3)
       ORDER BY created_at DESC LIMIT 30`,
      [ref.adAccountId, ref.id, ref.externalId],
    ),
  ]);

  const total = daily.reduce((s, r) => ({
    spend: s.spend + Number(r.spend_micros), impressions: s.impressions + Number(r.impressions ?? 0),
    clicks: s.clicks + Number(r.clicks ?? 0), conversions: s.conversions + Number(r.conversions ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

  return (
    <>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 12.5, marginBottom: 4 }}>
            <Link href="/campaigns" style={{ color: 'var(--dim)' }}>← Chiến dịch</Link>
          </div>
          <h1>{detail?.campaign.name ?? ref.name}</h1>
          <p>
            {PLATFORM[ref.platform] ?? ref.platform} · ID <span className="mono">{ref.externalId}</span>
            {detail?.campaign.nativeUrl && (
              <> · <a href={detail.campaign.nativeUrl} target="_blank" rel="noreferrer"
                      style={{ color: 'var(--acc-ink)' }}>
                mở trên {ref.platform === 'google' ? 'Google Ads' : ref.platform === 'tiktok' ? 'TikTok Ads Manager' : 'Trình quản lý quảng cáo'} ↗
              </a></>
            )}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="err" style={{ marginBottom: 16 }}>
          Không đọc được chi tiết từ {PLATFORM[ref.platform]}: {loadError}
        </div>
      )}

      {detail && (
        <CampaignEditor
          campaignId={ref.id}
          adAccountId={ref.adAccountId}
          detail={detail}
          canWrite={user.role !== 'viewer'}
        />
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <b>Số liệu 30 ngày</b>
          <span>
            {money(total.spend, ref.currency)} · {num(total.impressions)} hiển thị · {num(total.clicks)} nhấp
            · {num(total.conversions)} kết quả
          </span>
        </div>
        {daily.length === 0 ? (
          <div className="empty">Chưa có số liệu. Chiến dịch chưa chạy, hoặc chưa đồng bộ từ khi nó chạy.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Ngày</th><th className="n">Chi tiêu</th><th className="n">Hiển thị</th>
                <th className="n">Nhấp</th><th className="n">CTR</th><th className="n">Kết quả</th><th className="n">Chi phí/kết quả</th></tr>
            </thead>
            <tbody>
              {daily.map((r) => {
                const sp = Number(r.spend_micros), im = Number(r.impressions ?? 0);
                const cl = Number(r.clicks ?? 0), cv = Number(r.conversions ?? 0);
                return (
                  <tr key={r.d}>
                    <td className="mono">{r.d}</td>
                    <td className="n mono">{money(sp, ref.currency)}</td>
                    <td className="n mono">{num(im)}</td>
                    <td className="n mono">{num(cl)}</td>
                    <td className="n mono">{im > 0 ? `${((cl / im) * 100).toFixed(2)}%` : '—'}</td>
                    <td className="n mono">{num(cv)}</td>
                    <td className="n mono">{cv > 0 ? money(sp / cv, ref.currency) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><b>Nhật ký thay đổi</b><span>30 lần gần nhất</span></div>
        {log.length === 0 ? (
          <div className="empty">Chưa có thay đổi nào qua Ads OS.</div>
        ) : (
          <table>
            <tbody>
              {log.map((m, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--dim)', whiteSpace: 'nowrap', width: 130 }}>
                    {dateTime(new Date(m.created_at).toISOString())}
                  </td>
                  <td>
                    <div className="cell-title">{m.target_name}</div>
                    <div className="cell-sub">
                      {m.before_value ? `${m.before_value} → ` : ''}{m.after_value}
                      {m.mode === 'dry_run' && ' · chạy thử'}
                    </div>
                    {m.error_message && <div className="cell-sub" style={{ color: 'var(--red)' }}>{m.error_message}</div>}
                  </td>
                  <td className="n">
                    <span className={`tag ${m.status === 'applied' ? 'tag-ok' : m.status === 'failed' ? 'tag-over' : 'tag-mute'}`}>
                      {m.status === 'applied' ? 'Đã áp dụng' : m.status === 'failed' ? 'Lỗi' : m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
