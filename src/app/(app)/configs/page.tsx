import { requireUser } from '@/lib/session';
import { listConfigs, countByKind } from '@/lib/queries/configs';
import { listAccounts } from '@/lib/queries/ads';
import { KINDS, KIND_LABEL } from '@/lib/configs/schema';
import { ConfigBrowser } from './config-browser';

export const dynamic = 'force-dynamic';

export default async function ConfigsPage() {
  const user = await requireUser();
  const [configs, counts, accounts] = await Promise.all([
    listConfigs(user.id),
    countByKind(user.id),
    listAccounts(user.id),
  ]);

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
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      />
    </>
  );
}
