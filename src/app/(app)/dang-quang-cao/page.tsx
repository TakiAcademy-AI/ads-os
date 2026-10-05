import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { listActiveAccounts, getCurrentAccountId } from '@/lib/account';
import { listPages } from '@/lib/ads/pages';
import { listTemplates } from '@/lib/queries/templates';
import { QuickAd } from './quick-ad';
import { GoogleQuickAd } from './google-quick-ad';

export const dynamic = 'force-dynamic';

export default async function QuickAdPage({
  searchParams,
}: {
  searchParams: Promise<{ nen?: string }>;
}) {
  const user = await requireUser();
  const [accounts, pages, templates, current, sp] = await Promise.all([
    listActiveAccounts(user.id),
    listPages(user.id),
    listTemplates(user.id),
    getCurrentAccountId(user.id),
    searchParams,
  ]);

  const fb = accounts.filter((a) => a.platform === 'facebook');
  const gg = accounts.filter((a) => a.platform === 'google');
  // Không chỉ định thì mở theo nền tảng của tài khoản đang chọn ở thanh bên.
  const currentPlatform = accounts.find((a) => a.id === current)?.platform;
  const tab = sp.nen === 'google' || sp.nen === 'facebook'
    ? sp.nen
    : currentPlatform === 'google' ? 'google' : 'facebook';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Đăng quảng cáo nhanh</h1>
          <p>
            {tab === 'google'
              ? 'Tạo chiến dịch Google Ads Tìm kiếm, Hiển thị, Performance Max, Demand Gen — luôn ở trạng thái tạm dừng'
              : 'Đẩy một bài viết có sẵn trên Page thành chiến dịch — luôn ở trạng thái tạm dừng'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--side)', padding: 4,
                    borderRadius: 'var(--r-sm)', marginBottom: 16, width: 'fit-content' }}>
        {([['facebook', 'Facebook', fb.length], ['google', 'Google Ads', gg.length]] as const).map(([k, label, n]) => (
          <Link key={k} href={`/dang-quang-cao?nen=${k}`}
                style={{
                  padding: '7px 15px', fontSize: 13, fontWeight: 500, borderRadius: 6,
                  background: tab === k ? 'var(--card)' : 'transparent',
                  color: tab === k ? 'var(--ink)' : 'var(--dim)',
                }}>
            {label} <span style={{ fontSize: 11, color: 'var(--dim)' }}>{n}</span>
          </Link>
        ))}
      </div>

      {tab === 'google' ? (
        <GoogleQuickAd
          accounts={gg.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          defaultAccountId={current}
        />
      ) : (
        <QuickAd
          accounts={fb.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          pages={pages}
          templates={templates}
          defaultAccountId={fb.some((a) => a.id === current) ? current : fb[0]?.id ?? null}
        />
      )}
    </>
  );
}
