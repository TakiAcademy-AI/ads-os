import { requireUser } from '@/lib/session';
import { getCurrentAccountId, todayVn } from '@/lib/account';
import { getKpis, listCampaigns, getAttributionCurve, getTrend } from '@/lib/queries/ads';
import { TrendChart } from '@/components/trend-chart';
import { vnd, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const accountId = await getCurrentAccountId(user.id);

  if (!accountId) {
    return (
      <>
        <div className="page-head"><div><h1>Bảng điều khiển</h1></div></div>
        <div className="card">
          <div className="empty">
            Chưa kết nối tài khoản quảng cáo nào. Vào Kết nối để thêm tài khoản Facebook Ads.
          </div>
        </div>
      </>
    );
  }

  const [kpis, campaigns, curve, trend] = await Promise.all([
    getKpis(accountId, 30),
    listCampaigns(accountId, 30, todayVn()),
    getAttributionCurve(accountId),
    getTrend(accountId, 30),
  ]);

  const saved = campaigns.filter((c) => c.assessment.verdict === 'saved');
  const over = campaigns.filter((c) => c.assessment.verdict === 'over');
  const holding = campaigns.filter((c) => c.assessment.verdict === 'holding');
  const savedSpend = saved.reduce((s, c) => s + c.spendMicros, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bảng điều khiển</h1>
          <p>Facebook Ads · 30 ngày gần nhất</p>
        </div>
        <button className="btn">Đồng bộ ngay</button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Chi tiêu 30 ngày</div>
          <div className="v num">{vnd(kpis.spendMicros)}</div>
        </div>
        <div className="kpi">
          <div className="k">CPA trung bình</div>
          <div className="v num">{vnd(kpis.cpaMicros)}</div>
          <div className="s">{num(kpis.conversions)} kết quả</div>
        </div>
        <div className="kpi">
          <div className="k">Bot đã tác động</div>
          <div className="v num">
            {kpis.mutationsApplied}
            <span style={{ fontSize: 15, color: 'var(--dim)' }}> / {kpis.mutationsApplied + kpis.mutationsBlocked}</span>
          </div>
          <div className="s">{kpis.mutationsBlocked} bị guard chặn lại</div>
        </div>
        <div className="kpi accent">
          <div className="k">Giữ lại khỏi tắt oan</div>
          <div className="v num">{saved.length}</div>
          <div className="s">{saved.length > 0 ? `${vnd(savedSpend)} chi tiêu` : 'chưa có trường hợp nào'}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <b>Chi tiêu và CPA theo ngày</b>
          <span>cột: chi tiêu · đường: CPA</span>
        </div>
        <TrendChart data={trend} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <b>Trạng thái chiến dịch</b>
            <span>{campaigns.length} chiến dịch</span>
          </div>
          <table>
            <tbody>
              <tr>
                <td>Vượt ngưỡng — tắt được</td>
                <td className="n"><span className="tag tag-over">{over.length}</span></td>
              </tr>
              <tr>
                <td>
                  Giữ lại — CPA thô vượt nhưng đã chín thì không
                  <div className="note">Đây là số chiến dịch tool khác sẽ tắt oan.</div>
                </td>
                <td className="n"><span className="tag tag-keep">{saved.length}</span></td>
              </tr>
              <tr>
                <td>Chưa đủ dữ liệu chín để kết luận</td>
                <td className="n"><span className="tag tag-hold">{holding.length}</span></td>
              </tr>
              <tr>
                <td>Trong ngưỡng</td>
                <td className="n">
                  <span className="tag tag-ok">
                    {campaigns.length - over.length - saved.length - holding.length}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <b>Cửa sổ attribution đo được</b>
            <span>từ lịch sử số liệu</span>
          </div>
          {curve.points.length === 0 ? (
            <div className="empty" style={{ padding: '28px 20px' }}>
              Chưa đủ lịch sử. Cần vài tuần đồng bộ để đo.
            </div>
          ) : (
            <div style={{ padding: '14px 18px 18px' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14 }}>
                Kéo số sau N ngày thì đã thấy bao nhiêu phần trăm chuyển đổi cuối cùng
              </div>
              {curve.points.filter((p) => p.dayOffset <= 9).map((p) => (
                <div key={p.dayOffset} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--dim)', width: 44 }}>
                    +{p.dayOffset}n
                  </span>
                  <div style={{ flex: 1, height: 7, background: '#eeeef6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.round(p.reportedRatio * 100)}%`,
                      height: '100%',
                      background: p.reportedRatio >= 0.95 ? 'var(--grn)' : 'var(--acc)',
                    }} />
                  </div>
                  <span className="mono" style={{ fontSize: 12, width: 44, textAlign: 'right' }}>
                    {Math.round(p.reportedRatio * 100)}%
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 12.5, color: 'var(--ink-2)' }}>
                {curve.suggestedDays !== null ? (
                  <>Đề xuất <b>attributionDays = {curve.suggestedDays}</b> (ngưỡng 95%)</>
                ) : (
                  <>Chưa đủ mẫu để đề xuất con số.</>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
