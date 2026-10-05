import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { oauthConfig } from '@/lib/ads/facebook-oauth';
import { googleOauthConfig } from '@/lib/ads/google-oauth';
import { tiktokOauthConfig } from '@/lib/ads/tiktok-oauth';
import { ConnectPanel } from './connect-panel';
import { AccountActions } from './account-actions';
import { SyncButton } from './sync-button';
import { PagesCard } from './pages-card';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook', google: 'Google Ads', tiktok: 'TikTok',
};

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'tag-ok', label: 'Đang hoạt động' },
  error: { cls: 'tag-over', label: 'Lỗi' },
  pending: { cls: 'tag-hold', label: 'Chờ xác nhận' },
  disconnected: { cls: 'tag-mute', label: 'Đã ngắt' },
};

export default async function ConnectionsPage() {
  const user = await requireUser();

  const { rows: accounts } = await db.query(
    `SELECT id, platform, external_id, name, currency, timezone, status, token_source,
            last_synced_at, last_error, (encrypted_token IS NOT NULL) AS has_token
     FROM ad_account WHERE owner_id = $1 ORDER BY created_at`,
    [user.id],
  );

  const { rows: logs } = await db.query(
    `SELECT l.job, l.ok, l.rows_written, l.duration_ms, l.message, l.created_at, a.name
     FROM sync_log l LEFT JOIN ad_account a ON a.id = l.ad_account_id
     WHERE a.owner_id = $1 OR l.ad_account_id IS NULL
     ORDER BY l.created_at DESC LIMIT 15`,
    [user.id],
  );

  // Kèm số cấu hình đang lấy bài từ từng Page — gỡ Page đó thì cấu hình dừng.
  const { rows: pages } = await db.query(
    `SELECT p.page_id, p.name, p.encrypted_token IS NOT NULL AS has_token,
            (SELECT COUNT(*)::int FROM automation_config c
             WHERE c.owner_id = p.owner_id AND c.kind = 'post_trigger'
               AND c.params->>'pageId' = p.page_id) AS configs
     FROM fb_page p WHERE p.owner_id = $1 ORDER BY p.name`,
    [user.id],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kết nối</h1>
          <p>Tài khoản quảng cáo và lịch sử đồng bộ</p>
        </div>
      </div>

      <ConnectPanel
        oauthReady={oauthConfig('http://x') !== null}
        googleReady={googleOauthConfig('http://x') !== null}
        tiktokReady={tiktokOauthConfig('http://x') !== null}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <b>Tài khoản đã kết nối</b>
          <span>{accounts.length} tài khoản</span>
        </div>
        {accounts.length === 0 ? (
          <div className="empty">Chưa kết nối tài khoản nào.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Token</th>
                <th>Đồng bộ lần cuối</th>
                <th>Trạng thái</th>
                <th className="n">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const st = STATUS[a.status] ?? STATUS.pending!;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="cell-title">
                        {a.name}
                        {' '}
                        <span className="tag tag-mute" style={{ fontSize: 10 }}>
                          {PLATFORM_LABEL[a.platform] ?? a.platform}
                        </span>
                      </div>
                      <div className="cell-sub mono">
                        {a.external_id} · {a.currency}{a.timezone ? ` · ${a.timezone}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className={`tag ${a.has_token ? 'tag-ok' : 'tag-over'}`}>
                        {a.has_token ? 'đã lưu' : 'chưa có'}
                      </span>
                      {a.has_token && a.token_source === 'manual' && (
                        <div className="note" style={{ margin: '4px 0 0' }}>dán tay · token chính</div>
                      )}
                      {a.has_token && a.token_source === 'service_account' && (
                        <div className="note" style={{ margin: '4px 0 0' }}>service account</div>
                      )}
                    </td>
                    <td style={{ color: 'var(--dim)' }}>
                      {a.last_synced_at ? dateTime(new Date(a.last_synced_at).toISOString()) : 'chưa bao giờ'}
                    </td>
                    <td>
                      <span className={`tag ${st.cls}`}>{st.label}</span>
                      {a.last_error && (
                        <div className="note" style={{ color: 'var(--red)' }}>{a.last_error}</div>
                      )}
                    </td>
                    <td className="n">
                      {a.status === 'pending' ? (
                        <AccountActions id={a.id} pending />
                      ) : a.has_token ? (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <SyncButton accountId={a.id} />
                          <AccountActions id={a.id} />
                        </div>
                      ) : (
                        <span className="note" style={{ margin: 0 }}>cần token</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(pages.length > 0 || accounts.some((a) => a.platform === 'facebook')) && (
        <PagesCard pages={pages.map((p) => ({
          pageId: p.page_id, name: p.name, hasToken: p.has_token, configs: p.configs,
        }))} />
      )}

      {logs.length > 0 && (
        <div className="card">
          <div className="card-head"><b>Lịch sử đồng bộ</b><span>15 lần gần nhất</span></div>
          <table>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--dim)', whiteSpace: 'nowrap', width: 130 }}>
                    {dateTime(new Date(l.created_at).toISOString())}
                  </td>
                  <td>{l.name ?? '—'}</td>
                  <td style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{l.message}</td>
                  <td className="n mono" style={{ color: 'var(--dim)' }}>{l.rows_written} dòng</td>
                  <td className="n mono" style={{ color: 'var(--dim)' }}>
                    {l.duration_ms ? `${Math.round(l.duration_ms / 100) / 10}s` : '—'}
                  </td>
                  <td className="n">
                    <span className={`tag ${l.ok ? 'tag-ok' : 'tag-over'}`}>{l.ok ? 'OK' : 'Lỗi'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
