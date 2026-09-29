import { requireUser } from '@/lib/session';
import { listActiveAccounts, getCurrentAccountId } from '@/lib/account';
import { listPages } from '@/lib/ads/pages';
import { listTemplates } from '@/lib/queries/templates';
import { QuickAd } from './quick-ad';

export const dynamic = 'force-dynamic';

export default async function QuickAdPage() {
  const user = await requireUser();
  const [accounts, pages, templates, current] = await Promise.all([
    listActiveAccounts(user.id),
    listPages(user.id),
    listTemplates(user.id),
    getCurrentAccountId(user.id),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Đăng quảng cáo nhanh</h1>
          <p>Đẩy một bài viết có sẵn trên Page thành chiến dịch — luôn ở trạng thái tạm dừng</p>
        </div>
      </div>

      <QuickAd
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        pages={pages}
        templates={templates}
        defaultAccountId={current}
      />
    </>
  );
}
