import { requireUser } from '@/lib/session';
import { listConfigs, countByKind } from '@/lib/queries/configs';
import { listActiveAccounts, getCurrentAccountId } from '@/lib/account';
import { db } from '@/lib/db';
import { KINDS, KIND_LABEL } from '@/lib/configs/schema';
import { ConfigBrowser } from './config-browser';

export const dynamic = 'force-dynamic';

export default async function ConfigsPage() {
  const user = await requireUser();
  // Theo tài khoản đang chọn ở sidebar, giống Bảng điều khiển / Chiến dịch /
  // Nhật ký. Trước đây trang này liệt kê cấu hình của MỌI tài khoản trong khi
  // các tab khác chỉ hiện một — đổi tài khoản thì 3 tab đổi, tab này không.
  const accountId = await getCurrentAccountId(user.id);
  const [configs, counts, accounts] = await Promise.all([
    listConfigs(user.id, accountId),
    countByKind(user.id, accountId),
    // Chỉ tài khoản ĐANG BẬT — tạo cấu hình cho tài khoản chưa bật thì nó
    // không bao giờ chạy được.
    listActiveAccounts(user.id),
  ]);

  // Chiến dịch theo tài khoản — để modal cho chọn "chiến dịch được bảo vệ"
  // từ danh sách thật thay vì bắt gõ ID.
  const { rows: campRows } = await db.query(
    `SELECT c.id, c.name, c.objective, c.ad_account_id
     FROM ad_campaign c JOIN ad_account a ON a.id = c.ad_account_id
     WHERE a.owner_id = $1 AND a.status = 'active' ORDER BY c.name`,
    [user.id],
  );
  const campaigns: Record<string, { id: string; name: string; objective: string }[]> = {};
  for (const r of campRows) {
    (campaigns[r.ad_account_id] ??= []).push({ id: r.id, name: r.name, objective: r.objective });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quản lý cấu hình</h1>
          <p>Kéo chỉ số, tắt ads, ngân sách, tự động chạy — mỗi luồng một bản ghi riêng</p>
        </div>
      </div>

      <div className="kpis">
        {KINDS.map((k) => (
          <div className="kpi" key={k}>
            <div className="k">{KIND_LABEL[k]}</div>
            <div className="v num">{counts[k]}</div>
          </div>
        ))}
      </div>

      <ConfigBrowser
        configs={configs}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, platform: 'facebook' }))}
        currentAccountId={accountId}
        campaigns={campaigns}
      />
    </>
  );
}
