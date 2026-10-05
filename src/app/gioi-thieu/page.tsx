// Trang giới thiệu CÔNG KHAI — cũng là trang chủ cho người chưa đăng nhập
// (proxy.ts rewrite "/" về đây).
//
// Google duyệt OAuth consent screen đòi trang chủ: (1) xem được khi chưa đăng
// nhập, (2) nói rõ app làm gì, (3) hiện ĐÚNG tên app khai trên consent screen.
// Đổi tên app ở một bên thì phải đổi cả bên kia, không thì bị trả hồ sơ.

import Link from 'next/link';
import { LegalLinks, COMPANY, TAX_ID, CONTACT } from '../_legal/shell';

export const metadata = {
  title: 'Ads OS — Vận hành quảng cáo Facebook, Google Ads và TikTok',
  description:
    'Ads OS kéo số liệu từ tài khoản quảng cáo Facebook, Google Ads và TikTok, báo cáo hiệu quả, '
    + 'và tự động tạm dừng chiến dịch hoặc đổi ngân sách theo ngưỡng do bạn đặt.',
};

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Báo cáo hợp nhất',
    body: 'Kéo chi tiêu, hiển thị, lượt nhấp, chuyển đổi theo ngày từ Facebook Ads và '
      + 'Google Ads, TikTok về một bảng điều khiển, theo dõi từng chiến dịch và xu hướng theo ngày.',
  },
  {
    title: 'Tự động hóa có kiểm soát',
    body: 'Đặt ngưỡng CPA hay ngân sách; khi chiến dịch vượt ngưỡng, Ads OS tạm dừng hoặc '
      + 'đổi ngân sách. Mặc định chỉ chạy thử và ghi lại việc sẽ làm, không đụng tài khoản.',
  },
  {
    title: 'Tạo quảng cáo từ bài viết',
    body: 'Chọn một bài trên Trang Facebook và mẫu quảng cáo có sẵn để tạo chiến dịch '
      + 'nhanh, hoặc để Ads OS tạo khi có bài mới chứa từ khóa bạn chọn.',
  },
  {
    title: 'Nhật ký mọi thay đổi',
    body: 'Mỗi lần tạm dừng, đổi ngân sách hay tạo quảng cáo đều được ghi lại kèm thời '
      + 'điểm, lý do và người hoặc cấu hình đã thực hiện.',
  },
];

export default function AboutPage() {
  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 72px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                       marginBottom: 56, gap: 12 }}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo">A</div>
          <b>Ads OS</b>
        </div>
        <Link href="/login" className="btn btn-ghost">Đăng nhập</Link>
      </header>

      <section style={{ marginBottom: 56 }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 650, lineHeight: 1.15,
                     letterSpacing: '-0.6px', margin: '0 0 16px' }}>
          Ads OS
          <span style={{ display: 'block', color: 'var(--ink-2)', fontWeight: 500,
                         fontSize: 'clamp(18px, 3vw, 24px)', letterSpacing: '-0.2px', marginTop: 8 }}>
            Vận hành quảng cáo Facebook, Google Ads và TikTok trên một màn hình
          </span>
        </h1>
        <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.7, maxWidth: 640, margin: '0 0 24px' }}>
          Ads OS là công cụ nội bộ giúp đội ngũ marketing theo dõi hiệu quả quảng cáo và tự
          động xử lý chiến dịch đang tiêu tiền kém hiệu quả. Bạn kết nối tài khoản quảng cáo
          của mình, Ads OS kéo số liệu về, báo cáo, và chỉ thay đổi chiến dịch khi bạn cho phép.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/login" className="btn" style={{ padding: '11px 20px', fontSize: 14 }}>
            Đăng nhập vào Ads OS
          </Link>
          <Link href="/privacy" className="btn btn-ghost" style={{ padding: '11px 20px', fontSize: 14 }}>
            Chính sách bảo mật
          </Link>
        </div>
      </section>

      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Ads OS làm được gì</h2>
        <div style={{ display: 'grid', gap: 12,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ padding: '18px 18px 16px' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.title}</div>
              <div style={{ color: 'var(--ink-2)', lineHeight: 1.65, fontSize: 13.5 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: '22px 22px 18px', marginBottom: 56 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
          Ads OS dùng dữ liệu Google như thế nào
        </h2>
        <p style={{ color: 'var(--ink-2)', lineHeight: 1.7, margin: '0 0 10px' }}>
          Khi bạn bấm <b>Đăng nhập bằng Google</b> trong mục Kết nối, Ads OS xin đúng một quyền:{' '}
          <span className="mono" style={{ fontSize: 12.5 }}>https://www.googleapis.com/auth/adwords</span>.
          Quyền này dùng để:
        </p>
        <ul style={{ color: 'var(--ink-2)', lineHeight: 1.75, paddingLeft: 20, margin: '0 0 10px' }}>
          <li>liệt kê các tài khoản Google Ads bạn có quyền truy cập để bạn chọn tài khoản cần dùng;</li>
          <li>đọc chiến dịch, ngân sách và số liệu hiệu quả theo ngày để hiển thị báo cáo;</li>
          <li>tạm dừng chiến dịch hoặc đổi ngân sách, chỉ khi bạn tự bấm hoặc tự bật chế độ ghi thật.</li>
        </ul>
        <p style={{ color: 'var(--ink-2)', lineHeight: 1.7, margin: 0 }}>
          Dữ liệu Google không được bán, không chia sẻ cho bên thứ ba, không dùng để quảng cáo
          hay huấn luyện AI. Token được mã hóa và bạn ngắt kết nối được bất cứ lúc nào. Chi
          tiết tại <Link href="/privacy#google" style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>
          Chính sách bảo mật</Link>.
        </p>
      </section>

      <section lang="en" style={{ marginBottom: 48, color: 'var(--ink-2)', lineHeight: 1.7, fontSize: 13.5 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>
          About Ads OS
        </h2>
        <p style={{ margin: 0 }}>
          Ads OS is an advertising operations tool built by {COMPANY}. It connects to the
          Facebook Ads, Google Ads and TikTok Ads accounts that a user authorizes, imports campaign
          structure and daily performance metrics for reporting, and lets the user pause
          campaigns or change budgets, either manually or through rules the user configures.
          Ads OS requests the Google Ads API scope only to provide these features; the data is
          not sold, shared with third parties, or used for advertising or AI training.
        </p>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', paddingTop: 18, fontSize: 13,
                       color: 'var(--dim)', lineHeight: 1.7 }}>
        <div>Ads OS · {COMPANY} · MST {TAX_ID}</div>
        <div style={{ marginBottom: 10 }}>Liên hệ: <span className="mono">{CONTACT}</span></div>
        <LegalLinks />
      </footer>
    </div>
  );
}
