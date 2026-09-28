'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
      { href: '/automation/pause', label: 'Tắt ads tự động' },
      { href: '/automation/sync', label: 'Kéo chỉ số', soon: true },
      { href: '/automation/budget', label: 'Ngân sách theo giờ', soon: true },
      { href: '/automation/triggers', label: 'Auto chạy ads', soon: true },
    ],
  },
  {
    group: 'Hệ thống',
    items: [
      { href: '/log', label: 'Nhật ký thay đổi' },
      { href: '/connections', label: 'Kết nối', soon: true },
      { href: '/mcp', label: 'MCP Server', soon: true },
    ],
  },
];

export function Sidebar({ userName }: { userName: string }) {
  const path = usePathname();

  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-logo">A</div>
        <b>Ads OS</b>
      </div>

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

      <div className="side-foot">{userName}</div>
    </aside>
  );
}
