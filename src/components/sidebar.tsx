'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AccountOption } from '@/lib/account';
import { AccountSwitcher } from './account-switcher';

interface Item {
  href: string;
  label: string;
  soon?: boolean;
}

const GROUPS: { group: string; items: Item[] }[] = [
  {
    group: 'Tổng quan',
    items: [
      { href: '/', label: 'Bảng điều khiển' },
      { href: '/campaigns', label: 'Chiến dịch' },
    ],
  },
  {
    group: 'Tự động hóa',
    items: [
      { href: '/configs', label: 'Cấu hình' },
    ],
  },
  {
    group: 'Hệ thống',
    items: [
      { href: '/log', label: 'Nhật ký thay đổi' },
      { href: '/connections', label: 'Kết nối' },
      { href: '/mcp', label: 'MCP Server' },
      { href: '/huong-dan', label: 'Hướng dẫn' },
    ],
  },
];

export function Sidebar({
  userName, accounts, currentAccountId,
}: {
  userName: string;
  accounts: AccountOption[];
  currentAccountId: string | null;
}) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    // Cookie chỉ xoá được trong Route Handler — Server Component không sửa
    // được cookie (xem ghi chú ở src/lib/session.ts).
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-logo">A</div>
        <b>Ads OS</b>
      </div>

      <AccountSwitcher accounts={accounts} currentId={currentAccountId} />

      {GROUPS.map(({ group, items }) => (
        <div key={group}>
          <div className="nav-group">{group}</div>
          {items.map((it) => {
            const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
            if (it.soon) {
              return (
                <div key={it.href} className="nav-item soon">
                  {it.label}
                  <span className="badge">sắp có</span>
                </div>
              );
            }
            return (
              <Link key={it.href} href={it.href} className={`nav-item${active ? ' on' : ''}`}>
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="side-foot" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</span>
        <button onClick={logout} className="btn btn-ghost"
                style={{ fontSize: 11.5, padding: '4px 9px' }}>
          Thoát
        </button>
      </div>
    </aside>
  );
}
