import { requireUser } from '@/lib/session';
import { getCurrentAccountId } from '@/lib/account';
import { listMutations } from '@/lib/queries/ads';
import { vnd, dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { cls: string; label: string }> = {
  applied: { cls: 'tag-ok', label: 'Đã áp dụng' },
  blocked: { cls: 'tag-keep', label: 'Chốt an toàn chặn' },
  proposed: { cls: 'tag-mute', label: 'Đề xuất' },
  failed: { cls: 'tag-over', label: 'Lỗi' },
  rolled_back: { cls: 'tag-hold', label: 'Đã hoàn tác' },
};

const OP: Record<string, string> = {
  pause: 'Tắt',
  resume: 'Bật lại',
  budget_change: 'Đổi ngân sách',
  campaign_create: 'Tạo chiến dịch',
};

// Phải khớp đúng các hằng ở auto-pause.ts. Thiếu một khoá thì người dùng thấy
// chuỗi snake_case tiếng Anh giữa giao diện tiếng Việt, đúng vào lúc họ cần
// hiểu vì sao chiến dịch này KHÔNG bị tắt.
const BLOCKED_BY: Record<string, string> = {
  attribution_window: 'số chưa chốt, còn trong cửa sổ chờ',
  protected_campaign: 'chiến dịch được bảo vệ',
  not_measurable: 'không đo được chuyển đổi',
  blast_radius: 'trần thiệt hại mỗi lượt',
  // Tên cũ, giữ lại để dòng nhật ký ghi trước migration 003 vẫn đọc được.
  whitelist: 'chiến dịch được bảo vệ',
};

export default async function LogPage() {
  const user = await requireUser();
  const accountId = await getCurrentAccountId(user.id);
  const rows = accountId ? await listMutations(accountId) : [];

  const applied = rows.filter((r) => r.status === 'applied').length;
  const blocked = rows.filter((r) => r.status === 'blocked').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Nhật ký thay đổi</h1>
          <p>
            Mọi thay đổi bot định làm hoặc đã làm — gồm cả lần chạy thử và lần bị chốt an toàn chặn
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Đã áp dụng</div>
          <div className="v num">{applied}</div>
          <div className="s">tác động thật lên tài khoản</div>
        </div>
        <div className="kpi accent">
          <div className="k">Chốt an toàn chặn lại</div>
          <div className="v num">{blocked}</div>
          <div className="s">ngăn tắt oan hoặc thiếu dữ liệu</div>
        </div>
        <div className="kpi">
          <div className="k">Tổng bản ghi</div>
          <div className="v num">{rows.length}</div>
          <div className="s">100 dòng gần nhất</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <b>Lịch sử</b>
          <span>ghi đủ cả lần không áp dụng — nhật ký thiếu thì không ai dám bật tự động</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">Chưa có thay đổi nào được ghi lại.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Đối tượng</th>
                <th>Thay đổi</th>
                <th className="n">CPA thô → chín</th>
                <th>Chế độ</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? STATUS.proposed!;
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--dim)' }}>{dateTime(r.createdAt)}</td>
                    <td>
                      <div className="cell-title">{r.targetName}</div>
                      <div className="cell-sub">{r.targetExternalId}</div>
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: 12.5 }}>
                        {OP[r.operation] ?? r.operation}: {r.beforeValue} → {r.afterValue}
                      </div>
                      <div className="note">{r.reason}</div>
                      {r.blockedBy && (
                        <div className="note" style={{ color: 'var(--acc-ink)' }}>
                          Chặn bởi: {BLOCKED_BY[r.blockedBy] ?? r.blockedBy}
                        </div>
                      )}
                    </td>
                    <td className="n mono" style={{ whiteSpace: 'nowrap' }}>
                      {r.cpaRawMicros !== null ? (
                        <>
                          <span className="bad">{vnd(r.cpaRawMicros)}</span>
                          <span style={{ color: 'var(--dim)' }}> → </span>
                          <span className="good">
                            {r.cpaSettledMicros ? vnd(r.cpaSettledMicros) : '—'}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--dim)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`tag ${r.mode === 'live' ? 'tag-over' : 'tag-mute'}`}>
                        {r.mode === 'live' ? 'Thật' : 'Chạy thử'}
                      </span>
                    </td>
                    <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
