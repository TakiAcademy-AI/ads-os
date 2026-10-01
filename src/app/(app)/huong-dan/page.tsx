import Link from 'next/link';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Tài liệu trong ứng dụng. Trước đây Ads OS không có một trang trợ giúp nào —
// người dùng mới đăng nhập thấy sáu tab rỗng và tự đoán.
//
// Nội dung ở đây phải khớp hành vi THẬT của hệ thống. Tài liệu hứa nhiều hơn
// code làm được còn tệ hơn không có tài liệu.

function Section({ id, title, children }: {
  id: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 20, marginBottom: 18 }}>
      <div className="card">
        <div className="card-head"><b>{title}</b></div>
        <div style={{ padding: '16px 20px', fontSize: 13.5, lineHeight: 1.75, color: 'var(--ink-2)' }}>
          {children}
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 13, marginBottom: 14 }}>
      <div style={{
        width: 25, height: 25, flex: 'none', borderRadius: '50%',
        background: 'var(--acc-soft)', color: 'var(--acc-ink)',
        display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 600,
      }}>{n}</div>
      <div>
        <div style={{ fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{title}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <div style={{ fontWeight: 500, color: 'var(--ink)', marginBottom: 3 }}>{q}</div>
      <div>{children}</div>
    </div>
  );
}

const NAV = [
  { id: 'bat-dau', label: 'Ba bước bắt đầu' },
  { id: 'attribution', label: 'Vì sao tắt theo CPA là tắt oan' },
  { id: 'bon-loai', label: 'Bốn loại tự động hoá' },
  { id: 'chay-thu', label: 'Chạy thử trước khi ghi thật' },
  { id: 'bao-ve', label: 'Những lớp chặn an toàn' },
  { id: 'google', label: 'Google Ads — khác gì Facebook' },
  { id: 'quyen', label: 'Quyền Facebook — làm được gì' },
  { id: 'faq', label: 'Câu hỏi thường gặp' },
];

export default async function GuidePage() {
  await requireUser();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hướng dẫn</h1>
          <p>Cách dùng Ads OS, và vì sao nó quyết định khác các công cụ tắt ads khác</p>
        </div>
      </div>

      <div className="split" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'start' }}>
        <nav className="card" style={{ position: 'sticky', top: 16, padding: '10px 8px' }}>
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`}
               style={{
                 display: 'block', padding: '7px 11px', borderRadius: 'var(--r-sm)',
                 fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4,
               }}>
              {n.label}
            </a>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          <Section id="bat-dau" title="Ba bước bắt đầu">
            <Step n={1} title="Kết nối tài khoản Facebook Ads">
              Vào <Link href="/connections" style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>Kết nối</Link> và
              đăng nhập bằng Facebook. Bạn cần quyền quản trị tài khoản quảng cáo.
              Tài khoản kết nối về ở trạng thái <b>chờ</b> — tự chọn cái nào muốn dùng
              thay vì bật hết.
            </Step>
            <Step n={2} title="Kéo số liệu về">
              Bấm <b>Đồng bộ ngay</b>. Lần đầu kéo 30 ngày gần nhất nên hơi lâu.
              Sau đó tạo cấu hình <b>Kéo chỉ số</b> để nó tự chạy.
            </Step>
            <Step n={3} title="Tạo cấu hình tự động hoá — để chế độ chạy thử">
              Vào <Link href="/configs" style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>Cấu hình</Link>.
              Mọi cấu hình mới đều mặc định <b>chạy thử</b>: bot ghi đề xuất vào Nhật
              ký nhưng không đụng vào tài khoản. Xem vài tuần, thấy nó quyết định
              đúng thì mới chuyển sang ghi thật.
            </Step>
          </Section>

          <Section id="attribution" title="Vì sao tắt theo CPA là tắt oan">
            <p style={{ margin: '0 0 12px' }}>
              Facebook <b>ghi nhận chuyển đổi muộn</b>. Một người xem quảng cáo hôm
              nay có thể nhắn tin ba ngày sau, và Facebook sẽ tính đơn đó về đúng
              ngày họ xem quảng cáo — tức là <b>sửa lại số của quá khứ</b>.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              Hệ quả: số của mấy ngày gần nhất <b>luôn trông tệ hơn thực tế</b>. Công
              cụ nào tắt chiến dịch dựa trên CPA thô sẽ tắt đúng những chiến dịch mà
              đơn hàng chỉ chưa kịp về.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              Ads OS tách làm hai con số:
            </p>
            <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
              <li><b>CPA thô</b> — tính trên toàn kỳ, gồm cả những ngày số chưa chốt.</li>
              <li><b>CPA đã chín</b> — chỉ tính phần dữ liệu đã qua cửa sổ chờ.</li>
            </ul>
            <p style={{ margin: '0 0 12px' }}>
              Bot <b>chỉ kết luận trên CPA đã chín</b>. Chiến dịch có CPA thô vượt
              ngưỡng nhưng CPA đã chín thì không sẽ được đánh dấu <b>Giữ lại</b> — đó
              chính là những chiến dịch công cụ khác tắt oan.
            </p>
            <div className="note" style={{ maxWidth: 'none' }}>
              Cửa sổ chờ nên <b>đo</b> chứ đừng đoán. Bảng điều khiển có ô &ldquo;Cửa sổ
              attribution đo được&rdquo; tính từ chính lịch sử số liệu tài khoản bạn.
              Cần vài tuần đồng bộ mới đủ mẫu.
            </div>
          </Section>

          <Section id="bon-loai" title="Bốn loại tự động hoá — khi nào dùng cái nào">
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ width: 150 }}><b>Kéo chỉ số</b></td>
                  <td>Nền móng của mọi thứ. Không có nó thì ba loại kia không có số
                      để quyết định. Nên đặt 30–60 phút một lần.</td>
                </tr>
                <tr>
                  <td><b>Tắt ads tự động</b></td>
                  <td>Tắt chiến dịch khi CPA <i>đã chín</i> vượt ngưỡng. Mỗi tài khoản
                      chỉ được một cấu hình loại này đang chạy.</td>
                </tr>
                <tr>
                  <td><b>Ngân sách theo giờ</b></td>
                  <td>Tăng giảm ngân sách theo khung giờ — ví dụ 19–23h chạy 150%,
                      22h–6h còn 50%. Chỉ áp dụng cho chiến dịch đặt ngân sách ở cấp
                      chiến dịch (CBO).</td>
                </tr>
                <tr>
                  <td><b>Tự động chạy ads</b></td>
                  <td>Page đăng bài khớp từ khoá thì tự tạo chiến dịch đẩy bài đó.
                      Chiến dịch sinh ra <b>luôn ở trạng thái tạm dừng</b> để bạn duyệt
                      trước.</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section id="chay-thu" title="Chạy thử trước khi ghi thật">
            <p style={{ margin: '0 0 12px' }}>
              Ba loại có thể ghi lên tài khoản đều có hai chế độ:
            </p>
            <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
              <li><b>Chạy thử</b> — bot xét đủ mọi điều kiện và ghi đề xuất vào Nhật
                  ký, nhưng <b>không gọi Facebook</b>. Đây là mặc định.</li>
              <li><b>Ghi thật</b> — bot thực sự tắt chiến dịch, đổi ngân sách, tạo
                  chiến dịch. Thẻ <span className="tag tag-over">GHI THẬT</span> hiện
                  đỏ ở danh sách cấu hình.</li>
            </ul>
            <p style={{ margin: 0 }}>
              Đổi qua lại bất cứ lúc nào bằng nút <b>→ ghi thật</b> / <b>→ chạy thử</b> ở
              cột Thao tác. Chuyển sang ghi thật luôn hỏi xác nhận và nói rõ bot sẽ
              làm gì với tài khoản nào.
            </p>
          </Section>

          <Section id="bao-ve" title="Những lớp chặn an toàn">
            <p style={{ margin: '0 0 12px' }}>
              Kể cả ở chế độ ghi thật, bot vẫn bị chặn bởi bốn lớp — xem được ở
              cột &ldquo;Chặn bởi&rdquo; trong <Link href="/log" style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>Nhật ký</Link>:
            </p>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ width: 210 }}>Không đo được chuyển đổi</td>
                  <td>Chiến dịch mà hệ thống không biết đếm kết quả kiểu gì thì CPA
                      vô nghĩa — không bao giờ bị tắt.</td>
                </tr>
                <tr>
                  <td>Chiến dịch được bảo vệ</td>
                  <td>Danh sách bạn tự chọn. Chỉ cảnh báo, không tắt.</td>
                </tr>
                <tr>
                  <td>Trần thiệt hại mỗi lượt</td>
                  <td>Một lượt chạy tắt tối đa N chiến dịch. Vượt thì dừng và ghi
                      cảnh báo.</td>
                </tr>
                <tr>
                  <td>Số chưa chốt, còn trong cửa sổ chờ</td>
                  <td>Chưa đủ dữ liệu đã chín để kết luận — chờ thêm.</td>
                </tr>
              </tbody>
            </table>
            <div className="note" style={{ maxWidth: 'none', marginTop: 12 }}>
              Danh sách &ldquo;chiến dịch được bảo vệ&rdquo; <b>cố ý ngược với whitelist</b> của
              các công cụ khác: ở đó thứ không nằm trong danh sách thì bị tắt, nên
              quên một mục là mất chiến dịch. Ở đây danh sách chỉ <i>thêm</i> an toàn —
              bỏ sót không bao giờ dẫn tới tắt nhầm.
            </div>
          </Section>

          <Section id="google" title="Google Ads — khác gì Facebook">
            <p style={{ margin: '0 0 12px' }}>
              Kéo chỉ số, tắt ads tự động và ngân sách theo giờ đều chạy được với
              Google Ads. Riêng <b>Tự động chạy ads</b> chỉ có ở Facebook vì nó bám
              vào bài viết trên Fanpage.
            </p>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ width: 175 }}>Kết nối hết hạn</td>
                  <td><b>Google không hết hạn.</b> Facebook cấp token 60 ngày phải nối
                      lại; Google cấp refresh token sống vĩnh viễn, chỉ mất khi bạn tự
                      thu hồi quyền.</td>
                </tr>
                <tr>
                  <td>Tài khoản quản lý</td>
                  <td>Tài khoản <b>MCC bị bỏ qua</b> khi kết nối — chúng không chạy
                      quảng cáo trực tiếp nên không có số liệu để đồng bộ. Tài khoản con
                      bên dưới vẫn được lấy đủ.</td>
                </tr>
                <tr>
                  <td>Ngân sách dùng chung</td>
                  <td>Google cho nhiều chiến dịch <b>dùng chung một ngân sách</b>. Đổi
                      nó là đổi cho tất cả, nên hệ thống <b>từ chối không đụng vào</b> và
                      ghi lý do vào Nhật ký. Muốn tự động điều chỉnh thì tách ngân sách
                      riêng cho chiến dịch đó.</td>
                </tr>
                <tr>
                  <td>Chuyển đổi</td>
                  <td>Google trả <b>số thập phân</b> (0.5 chuyển đổi là bình thường với
                      mô hình phân bổ chia phần) và gộp mọi loại vào một chỉ số. Facebook
                      trả số nguyên nhưng tách thành nhiều loại hành động chồng chéo.</td>
                </tr>
                <tr>
                  <td>Trạng thái chiến dịch</td>
                  <td>Google gọi là <span className="mono">ENABLED</span>, Facebook gọi là{' '}
                      <span className="mono">ACTIVE</span>. Hệ thống hiểu cả hai.</td>
                </tr>
              </tbody>
            </table>
            <div className="note" style={{ maxWidth: 'none', marginTop: 12 }}>
              Google Ads API cần một <b>developer token</b> xin ở tài khoản quản lý,
              mục API Center. Token mới chỉ có quyền <b>Test</b> — chỉ gọi được tài
              khoản thử nghiệm. Muốn chạy tài khoản thật phải nộp đơn xin <b>Basic
              access</b> và chờ Google duyệt. Đây là rào của Google, không phải của
              Ads OS.
            </div>
          </Section>

          <Section id="quyen" title="Quyền Facebook — làm được gì, không làm được gì">
            <p style={{ margin: '0 0 12px' }}>
              Khi kết nối, Ads OS xin 6 quyền:{' '}
              <span className="mono">ads_read</span>,{' '}
              <span className="mono">ads_management</span>,{' '}
              <span className="mono">business_management</span>,{' '}
              <span className="mono">pages_show_list</span>,{' '}
              <span className="mono">pages_read_engagement</span>,{' '}
              <span className="mono">pages_manage_ads</span>.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              Trong đó <span className="mono">ads_management</span> cho phép tạm dừng
              chiến dịch và đổi ngân sách. Quyền này <b>chỉ được dùng khi bạn tự bật
              chế độ ghi thật</b> trên từng cấu hình.
            </p>
            <p style={{ margin: '0 0 12px' }}><b>Hệ thống cố ý không làm được:</b></p>
            <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
              <li>Xoá hoặc lưu trữ chiến dịch — lớp ghi chỉ nhận <span className="mono">ACTIVE</span> và{' '}
                  <span className="mono">PAUSED</span>. Ngoại lệ duy nhất là dọn chiến dịch
                  tạo dở của chính nó vài giây trước.</li>
              <li>Thử lại một lệnh ghi đã thất bại — lệnh có thể đã tới Facebook mà
                  phản hồi mất trên đường về; thử lại là tắt hai lần.</li>
              <li>Tự bật chiến dịch mới — mọi chiến dịch bot tạo đều tạm dừng.</li>
              <li>Hành động qua MCP — AI chỉ đọc được số liệu.</li>
            </ul>
            <p style={{ margin: 0 }}>
              Token lưu trong cơ sở dữ liệu ở dạng <b>mã hoá</b>. Muốn xoá dữ liệu,
              vào <Link href="/connections" style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>Kết nối</Link> ngắt
              tài khoản, hoặc dùng trang{' '}
              <Link href="/xoa-du-lieu" style={{ color: 'var(--acc-ink)', textDecoration: 'underline' }}>Xoá dữ liệu</Link>.
            </p>
          </Section>

          <Section id="faq" title="Câu hỏi thường gặp">
            <Q q="Bật cấu hình rồi mà cột “Chạy lần cuối” vẫn ghi chưa chạy?">
              Bộ hẹn giờ phía máy chủ có vấn đề. Danh sách cấu hình sẽ hiện cảnh báo
              đỏ khi một cấu hình đang bật mà quá hai chu kỳ vẫn chưa chạy.
            </Q>
            <Q q="Vì sao chiến dịch của tôi hiện “không đo được chuyển đổi”?">
              Mục tiêu của chiến dịch không khớp loại hành động nào hệ thống biết
              đếm. CPA hiển thị cho nó là vô nghĩa, và bot sẽ không bao giờ tắt nó.
            </Q>
            <Q q="Tôi sửa ngưỡng CPA thì có mất nhật ký cũ không?">
              Không. Sửa cấu hình chỉ đổi tham số; nhật ký đã ghi giữ nguyên, và
              tham số mới có hiệu lực từ lượt chạy tiếp theo.
            </Q>
            <Q q="Khung giờ ngân sách có đặt vắt qua nửa đêm được không?">
              Được. Viết bình thường: <span className="mono">22 → 6</span>. Các khung
              không được chồng lên nhau. Ngoài mọi khung, ngân sách tự trở về 100%
              mức gốc.
            </Q>
            <Q q="Ngân sách có bị nhân dồn qua mỗi lượt chạy không?">
              Không. Phần trăm luôn tính từ <b>ngân sách gốc</b> được chốt ở lần đầu
              bot đụng tới, không tính từ giá trị hiện tại.
            </Q>
            <Q q="Xoá cấu hình rồi tạo lại có giống hệt không?">
              Gần giống, trừ <b>Tự động chạy ads</b>: loại này chỉ xét bài đăng sau
              thời điểm cấu hình được tạo, nên tạo lại là đặt lại mốc thời gian. Nếu
              chỉ muốn đổi tham số thì dùng nút <b>Sửa</b>.
            </Q>
          </Section>
        </div>
      </div>
    </>
  );
}
