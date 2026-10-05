// Khung chung cho các trang pháp lý CÔNG KHAI (không cần đăng nhập).
//
// Facebook và Google đều bắt app phải có URL chính sách bảo mật và điều khoản
// truy cập được khi chưa đăng nhập — reviewer mở link từ màn hình duyệt app.
// Thư mục _legal có gạch dưới nên Next không biến nó thành route.

import Link from 'next/link';

/** Pháp nhân vận hành Ads OS — đúng tên trên giấy phép kinh doanh. */
export const COMPANY = 'Công ty TNHH Công nghệ và Giáo dục TAKI';
export const TAX_ID = '0107488157';
export const ADDRESS = 'Tầng 4, MAC Plaza, số 10 Trần Phú, Mộ Lao, Hà Đông, Hà Nội';
export const CONTACT = 'ai@taki.vn';
export const UPDATED = '05/10/2026';

export function LegalShell({ title, intro, children }: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div className="brand" style={{ padding: '0 0 28px' }}>
        <div className="brand-logo">A</div>
        <b>Ads OS</b>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 6px' }}>{title}</h1>
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 18 }}>
        Cập nhật lần cuối: {UPDATED}
      </div>
      <p style={{ color: 'var(--ink-2)', margin: '0 0 28px', lineHeight: 1.7 }}>{intro}</p>
      {children}
      <LegalFooter />
    </div>
  );
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} style={{ fontSize: 16, fontWeight: 600, margin: '30px 0 10px' }}>{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: 'var(--ink-2)', lineHeight: 1.75, margin: '0 0 12px' }}>{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ color: 'var(--ink-2)', lineHeight: 1.75, paddingLeft: 20, margin: '0 0 12px' }}>
      {children}
    </ul>
  );
}

export const linkStyle: React.CSSProperties = { color: 'var(--acc-ink)', textDecoration: 'underline' };

/** Dùng cả ở trang đăng nhập — Google yêu cầu trang chủ của app dẫn tới chính sách. */
export function LegalLinks({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, ...style }}>
      <Link href="/privacy" style={{ color: 'var(--dim)' }}>Chính sách bảo mật</Link>
      <Link href="/terms" style={{ color: 'var(--dim)' }}>Điều khoản dịch vụ</Link>
      <Link href="/xoa-du-lieu" style={{ color: 'var(--dim)' }}>Xóa dữ liệu</Link>
    </div>
  );
}

function LegalFooter() {
  return (
    <div style={{
      fontSize: 13, color: 'var(--dim)', borderTop: '1px solid var(--line)',
      paddingTop: 16, marginTop: 36, lineHeight: 1.7,
    }}>
      <div>{COMPANY} · MST {TAX_ID}</div>
      <div>{ADDRESS}</div>
      <div style={{ marginBottom: 12 }}>Liên hệ: <span className="mono">{CONTACT}</span></div>
      <LegalLinks />
    </div>
  );
}
