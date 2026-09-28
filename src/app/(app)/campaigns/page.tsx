import { requireUser } from '@/lib/session';
import { getCurrentAccountId, todayVn } from '@/lib/account';
import { listCampaigns, type CampaignRow } from '@/lib/queries/ads';
import { vnd, num, OBJECTIVE_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

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
          {OBJECTIVE_LABEL[c.objective] ?? c.objective} · {c.status} · {num(c.conversions)} kết quả
          {c.isWhitelisted && <> · <span className="tag tag-mute">được bảo vệ</span></>}
        </div>
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
        <div className="card"><div className="empty">Chưa kết nối tài khoản quảng cáo nào.</div></div>
      </>
    );
  }

  const campaigns = await listCampaigns(accountId, 30, todayVn());
  const saved = campaigns.filter((c) => c.assessment.verdict === 'saved');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chiến dịch</h1>
          <p>Facebook Ads · 30 ngày · {campaigns.length} chiến dịch</p>
        </div>
        <button className="btn">Đồng bộ ngay</button>
      </div>

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
