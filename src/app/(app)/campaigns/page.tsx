import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getCurrentAccountId, todayVn } from '@/lib/account';
import { listCampaigns, type CampaignRow } from '@/lib/queries/ads';
import { getPauseConfig } from '@/lib/queries/configs';
import { vnd, num, OBJECTIVE_LABEL } from '@/lib/format';
import { SyncButton } from '../connections/sync-button';

export const dynamic = 'force-dynamic';

/** Facebook trả trạng thái bằng tiếng Anh viết hoa. */
const CAMPAIGN_STATUS: Record<string, string> = {
  ACTIVE: 'đang chạy',
  PAUSED: 'đã tắt',
  ARCHIVED: 'đã lưu trữ',
  DELETED: 'đã xoá',
};

const VERDICT: Record<string, { cls: string; label: string }> = {
  ok: { cls: 'tag-ok', label: 'Trong ngưỡng' },
  saved: { cls: 'tag-keep', label: 'Giữ lại' },
  holding: { cls: 'tag-hold', label: 'Chưa đủ dữ liệu chín' },
  over: { cls: 'tag-over', label: 'Vượt ngưỡng' },
};

function Row({ c }: { c: CampaignRow }) {
  const a = c.assessment;
  const v = VERDICT[a.verdict] ?? VERDICT.ok!;
  return (
    <tr>
      <td>
        <div className="cell-title">{c.name}</div>
        <div className="cell-sub">
          {OBJECTIVE_LABEL[c.objective] ?? c.objective} · {CAMPAIGN_STATUS[c.status.toUpperCase()] ?? c.status} · {num(c.conversions)} kết quả
          {c.isWhitelisted && <> · <span className="tag tag-mute">được bảo vệ</span></>}
        </div>
        {c.conversionAction
          ? <div className="cell-sub mono" style={{ opacity: .75 }}>đếm theo {c.conversionAction}</div>
          : c.spendMicros > 0 && (
              <div className="cell-sub" style={{ color: 'var(--amb)' }}>
                không đo được chuyển đổi
              </div>
            )}
      </td>
      <td className="n mono">{vnd(c.spendMicros)}</td>
      <td className={`n mono ${a.overRaw ? 'bad' : ''}`}>{vnd(a.cpaRawMicros)}</td>
      <td className="n mono">
        {a.hasSettledData
          ? <span className={a.overSettled ? 'bad' : 'good'}>{vnd(a.cpaSettledMicros)}</span>
          : <span style={{ color: 'var(--dim)' }}>—</span>}
      </td>
      <td className="n mono" style={{ color: 'var(--dim)' }}>
        {c.targetCpaMicros ? vnd(c.targetCpaMicros) : '—'}
      </td>
      <td>
        <span className={`tag ${v.cls}`}>{v.label}</span>
        {a.verdict === 'saved' && (
          <div className="note">
            CPA thô vượt ngưỡng nhưng dữ liệu đã chín thì không — tool tắt theo CPA thô
            sẽ tắt oan chiến dịch này.
          </div>
        )}
      </td>
    </tr>
  );
}

export default async function CampaignsPage() {
  const user = await requireUser();
  const accountId = await getCurrentAccountId(user.id);

  if (!accountId) {
    return (
      <>
        <div className="page-head"><div><h1>Chiến dịch</h1></div></div>
        <div className="card">
          <div className="empty">
            <div style={{ marginBottom: 12 }}>
              Chưa kết nối tài khoản quảng cáo nào — chưa có chiến dịch để hiển thị.
            </div>
            <Link href="/connections" className="btn">Kết nối tài khoản Facebook</Link>
          </div>
        </div>
      </>
    );
  }

  const [campaigns, pauseConfig] = await Promise.all([
    listCampaigns(accountId, 30, todayVn()),
    getPauseConfig(accountId),
  ]);
  const saved = campaigns.filter((c) => c.assessment.verdict === 'saved');
  // Có chi tiêu nhưng hệ thống không biết đếm chuyển đổi kiểu gì → CPA vô nghĩa,
  // guard không bao giờ đụng tới. Người dùng phải biết mình đang mù chỗ nào.
  const blind = campaigns.filter((c) => c.spendMicros > 0 && !c.conversionAction);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chiến dịch</h1>
          <p>Facebook Ads · 30 ngày · {campaigns.length} chiến dịch</p>
        </div>
        <SyncButton accountId={accountId} />
      </div>

      {blind.length > 0 && (
        <div style={{
          background: 'var(--amb-soft)', color: 'var(--amb)', fontSize: 12.5,
          padding: '11px 14px', borderRadius: 'var(--r)', marginBottom: 14, lineHeight: 1.5,
        }}>
          <b>{blind.length} chiến dịch có chi tiêu nhưng không đo được chuyển đổi.</b>{' '}
          Mục tiêu của chúng không khớp loại hành động nào hệ thống biết đếm, nên CPA
          hiển thị là vô nghĩa và guard sẽ không bao giờ tắt chúng. Kiểm tra lại mục tiêu
          chiến dịch, hoặc báo để bổ sung loại hành động.
        </div>
      )}

      {!pauseConfig && (
        <div style={{
          background: 'var(--amb-soft)', color: 'var(--amb)', fontSize: 12.5,
          padding: '11px 14px', borderRadius: 'var(--r)', marginBottom: 14, lineHeight: 1.5,
        }}>
          Tài khoản này chưa có cấu hình <b>Tắt ads tự động</b> nào đang bật, nên bảng dưới
          dùng ngưỡng mặc định (tin nhắn 120.000đ · lead 80.000đ · mua hàng 250.000đ). Vào Cấu hình để đặt
          ngưỡng riêng — cấu hình ở trạng thái nháp hoặc tạm dừng sẽ không có tác dụng.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <b>Đánh giá theo ngưỡng CPA</b>
          <span>
            {saved.length > 0
              ? `${saved.length} chiến dịch được giữ lại khỏi bị tắt oan`
              : 'so sánh CPA thô với CPA đã qua cửa sổ attribution'}
          </span>
        </div>
        {campaigns.length === 0 ? (
          <div className="empty">Chưa có dữ liệu. Chạy đồng bộ để kéo số về.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Chiến dịch</th>
                <th className="n">Chi tiêu</th>
                <th className="n">CPA thô</th>
                <th className="n">CPA đã chín</th>
                <th className="n">Ngưỡng</th>
                <th>Đánh giá</th>
              </tr>
            </thead>
            <tbody>{campaigns.map((c) => <Row key={c.id} c={c} />)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
