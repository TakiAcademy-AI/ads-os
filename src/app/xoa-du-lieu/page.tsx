// Trang CÔNG KHAI — không đăng nhập. Facebook bắt buộc app phải có nơi giải
// thích cách xoá dữ liệu, và là nơi người dùng tra cứu mã xác nhận.

import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Xóa dữ liệu người dùng — Ads OS',
  description: 'Cách yêu cầu xóa dữ liệu của bạn khỏi Ads OS',
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Đã tiếp nhận, đang xử lý',
  completed: 'Đã xóa xong',
  failed: 'Xử lý thất bại — vui lòng liên hệ',
};

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string }>;
}) {
  const { ma } = await searchParams;

  let request: { status: string; accounts: number; created: string; completed: string | null } | null = null;
  if (ma) {
    const { rows } = await db.query(
      `SELECT status, accounts_deleted, created_at, completed_at
       FROM deletion_request WHERE confirmation_code = $1`,
      [ma],
    );
    const r = rows[0];
    if (r) {
      request = {
        status: r.status,
        accounts: r.accounts_deleted,
        created: new Date(r.created_at).toLocaleString('vi-VN'),
        completed: r.completed_at ? new Date(r.completed_at).toLocaleString('vi-VN') : null,
      };
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div className="brand" style={{ padding: '0 0 28px' }}>
        <div className="brand-logo">A</div>
        <b>Ads OS</b>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Xóa dữ liệu người dùng</h1>
      <p style={{ color: 'var(--ink-2)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Ads OS đọc số liệu quảng cáo từ tài khoản Facebook mà bạn cấp quyền. Trang này
        giải thích dữ liệu nào được lưu và cách yêu cầu xóa.
      </p>

      {ma && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            Tra cứu mã <span className="mono">{ma}</span>
          </div>
          {request ? (
            <table style={{ fontSize: 13.5 }}>
              <tbody>
                <tr><td style={{ paddingLeft: 0 }}>Trạng thái</td>
                    <td className="n" style={{ paddingRight: 0 }}>
                      <span className={`tag ${request.status === 'completed' ? 'tag-ok'
                        : request.status === 'failed' ? 'tag-over' : 'tag-hold'}`}>
                        {STATUS_LABEL[request.status] ?? request.status}
                      </span>
                    </td></tr>
                <tr><td style={{ paddingLeft: 0 }}>Kết nối đã xóa</td>
                    <td className="n mono" style={{ paddingRight: 0 }}>{request.accounts}</td></tr>
                <tr><td style={{ paddingLeft: 0 }}>Tiếp nhận</td>
                    <td className="n" style={{ paddingRight: 0, color: 'var(--dim)' }}>{request.created}</td></tr>
                {request.completed && (
                  <tr><td style={{ paddingLeft: 0 }}>Hoàn tất</td>
                      <td className="n" style={{ paddingRight: 0, color: 'var(--dim)' }}>{request.completed}</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 13.5, color: 'var(--amb)' }}>
              Không tìm thấy yêu cầu nào với mã này.
            </div>
          )}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>Chúng tôi lưu gì</h2>
      <ul style={{ color: 'var(--ink-2)', lineHeight: 1.75, paddingLeft: 20, margin: '0 0 28px' }}>
        <li>Mã và tên tài khoản quảng cáo bạn chọn kết nối</li>
        <li>Access token (đã mã hóa) để đọc số liệu</li>
        <li>Số liệu quảng cáo theo ngày: chi tiêu, hiển thị, nhấp, chuyển đổi</li>
        <li>Tên và trạng thái chiến dịch</li>
      </ul>
      <p style={{ color: 'var(--ink-2)', margin: '-18px 0 28px', lineHeight: 1.6, fontSize: 13.5 }}>
        Chúng tôi <b>không</b> lưu thông tin cá nhân người dùng Facebook, không lưu danh
        sách khách hàng, không lưu nội dung tin nhắn.
      </p>
      <p style={{ color: 'var(--ink-2)', margin: '-18px 0 28px', lineHeight: 1.6, fontSize: 13.5 }}>
        Quyền được cấp gồm <span className="mono">ads_read</span>,{' '}
        <span className="mono">ads_management</span>,{' '}
        <span className="mono">business_management</span>,{' '}
        <span className="mono">pages_show_list</span>,{' '}
        <span className="mono">pages_read_engagement</span> và{' '}
        <span className="mono">pages_manage_ads</span>. Trong đó{' '}
        <span className="mono">ads_management</span> cho phép tạm dừng chiến dịch và đổi
        ngân sách — chỉ được dùng khi bạn tự bật chế độ ghi thật trên từng cấu hình tự
        động hoá, và mọi thay đổi đều ghi vào nhật ký.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>Cách yêu cầu xóa</h2>
      <div style={{ color: 'var(--ink-2)', lineHeight: 1.75, marginBottom: 12 }}>
        <b>Cách 1 — qua Facebook.</b> Vào{' '}
        <a href="https://www.facebook.com/settings?tab=applications"
           style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>
          Cài đặt → Ứng dụng và trang web
        </a>
        , tìm Ads OS và chọn <b>Xóa</b>. Facebook sẽ tự gửi yêu cầu xóa sang chúng tôi và
        trả về mã xác nhận để bạn tra cứu tại trang này.
      </div>
      <div style={{ color: 'var(--ink-2)', lineHeight: 1.75, marginBottom: 28 }}>
        <b>Cách 2 — trong ứng dụng.</b> Đăng nhập, vào <b>Kết nối</b> và bấm <b>Ngắt</b> ở
        tài khoản muốn gỡ. Token bị xóa ngay lập tức.
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>Điều gì xảy ra</h2>
      <p style={{ color: 'var(--ink-2)', lineHeight: 1.75, margin: '0 0 28px' }}>
        Toàn bộ kết nối do bạn cấp quyền bị xóa, kèm theo token, số liệu quảng cáo,
        lịch sử đồng bộ và cấu hình tự động hóa gắn với chúng. Chúng tôi chỉ giữ lại
        bản ghi yêu cầu xóa (mã tra cứu và thời điểm) để chứng minh đã xử lý — bản ghi
        này không chứa dữ liệu quảng cáo.
      </p>

      <div style={{ fontSize: 13, color: 'var(--dim)', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        Cần hỗ trợ? Liên hệ <span className="mono">ai@taki.vn</span>
      </div>
    </div>
  );
}
