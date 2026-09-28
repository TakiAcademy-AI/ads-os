import { requireUser } from '@/lib/session';
import { getCurrentAccountId } from '@/lib/account';
import { db } from '@/lib/db';
import { vnd, OBJECTIVE_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PauseRulesPage() {
  const user = await requireUser();
  const accountId = await getCurrentAccountId(user.id);
  const { rows } = accountId
    ? await db.query(
        `SELECT objective, target_cpa_micros, attribution_days, min_conversions,
                min_clicks, auto_pause
         FROM cpa_target WHERE ad_account_id = $1 ORDER BY objective`,
        [accountId],
      )
    : { rows: [] };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tắt ads tự động</h1>
          <p>Ngưỡng CPA theo loại chiến dịch, và các guard chặn tắt oan</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <b>Ngưỡng CPA</b>
          <span>đặt riêng cho từng loại — CPA tin nhắn và CPA lead không cùng thang</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">Chưa cấu hình ngưỡng nào.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Loại chiến dịch</th>
                <th className="n">Ngưỡng CPA</th>
                <th className="n">Cửa sổ attribution</th>
                <th className="n">Tối thiểu</th>
                <th>Tự động tắt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.objective}>
                  <td className="cell-title">{OBJECTIVE_LABEL[r.objective] ?? r.objective}</td>
                  <td className="n mono">{vnd(Number(r.target_cpa_micros))}</td>
                  <td className="n mono">{r.attribution_days} ngày</td>
                  <td className="n mono" style={{ color: 'var(--dim)' }}>
                    {r.min_conversions} chuyển đổi · {r.min_clicks} click
                  </td>
                  <td>
                    <span className={`tag ${r.auto_pause ? 'tag-over' : 'tag-mute'}`}>
                      {r.auto_pause ? 'Đang bật' : 'Tắt — chỉ cảnh báo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-head"><b>Guard đang áp dụng</b></div>
        <table>
          <tbody>
            <tr>
              <td>
                <div className="cell-title">Cửa sổ attribution</div>
                <div className="note">
                  Chỉ kết luận trên dữ liệu đã qua cửa sổ. Chênh lệch giữa CPA thô và CPA đã
                  chín chính là số chiến dịch lẽ ra bị tắt oan.
                </div>
              </td>
              <td className="n"><span className="tag tag-ok">Bật</span></td>
            </tr>
            <tr>
              <td>
                <div className="cell-title">Sàn dữ liệu tối thiểu</div>
                <div className="note">Không đủ chuyển đổi hoặc click thì không đánh giá.</div>
              </td>
              <td className="n"><span className="tag tag-ok">Bật</span></td>
            </tr>
            <tr>
              <td>
                <div className="cell-title">Whitelist chiến dịch</div>
                <div className="note">Chiến dịch được bảo vệ vẫn nhận cảnh báo nhưng không bị tắt.</div>
              </td>
              <td className="n"><span className="tag tag-ok">Bật</span></td>
            </tr>
            <tr>
              <td>
                <div className="cell-title">Trần thiệt hại mỗi lần chạy</div>
                <div className="note">Giới hạn số chiến dịch một lượt được phép tắt.</div>
              </td>
              <td className="n"><span className="tag tag-mute">Chưa có</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
