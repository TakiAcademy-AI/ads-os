// Trang CÔNG KHAI — URL này khai trong Facebook App (Privacy Policy URL) và
// Google OAuth consent screen. Nội dung phải khớp với những gì code thật sự
// lưu: thêm bảng hay luồng dữ liệu mới thì cập nhật trang này.

import {
  LegalShell, H2, P, UL, linkStyle, COMPANY, CONTACT,
} from '../_legal/shell';

export const metadata = {
  title: 'Chính sách bảo mật — Ads OS',
  description: 'Ads OS thu thập, sử dụng, lưu trữ và xóa dữ liệu của bạn như thế nào',
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Chính sách bảo mật"
      intro={<>
        Ads OS là công cụ vận hành quảng cáo do <b>{COMPANY}</b> (&ldquo;chúng tôi&rdquo;)
        phát triển và vận hành tại <span className="mono">testads.taki.vn</span>. Ads OS
        đọc số liệu từ tài khoản quảng cáo Facebook và Google Ads mà bạn chủ động kết
        nối, hiển thị báo cáo, và chỉ thay đổi quảng cáo khi bạn tự bật chế độ đó.
        Chính sách này giải thích chúng tôi lấy dữ liệu gì, dùng vào việc gì, lưu ở
        đâu và bạn xóa nó bằng cách nào.
      </>}
    >
      <H2>1. Dữ liệu chúng tôi thu thập</H2>
      <P><b>Thông tin tài khoản Ads OS.</b></P>
      <UL>
        <li>Họ tên, email và vai trò (quản trị, biên tập, chỉ xem) do quản trị viên tạo.</li>
        <li>Mật khẩu, lưu dưới dạng băm bcrypt. Chúng tôi không đọc được mật khẩu gốc.</li>
        <li>
          Nhật ký đăng nhập gồm email đã nhập, địa chỉ IP, thời điểm và kết quả. Nhật ký
          này dùng để chặn dò mật khẩu.
        </li>
      </UL>

      <P><b>Dữ liệu từ Facebook (Meta)</b>, chỉ khi bạn kết nối:</P>
      <UL>
        <li>Mã, tên, tiền tệ và múi giờ của tài khoản quảng cáo bạn chọn.</li>
        <li>Access token do Facebook cấp, được mã hóa trước khi lưu.</li>
        <li>
          Tên và trạng thái chiến dịch, nhóm quảng cáo, quảng cáo; số liệu theo ngày như
          chi tiêu, lượt hiển thị, lượt nhấp, chuyển đổi.
        </li>
        <li>
          Mã, tên và page token (được mã hóa) của các Trang bạn quản lý. Nội dung bài viết
          trên Trang được đọc khi bạn chọn bài để chạy quảng cáo và không được lưu lại,
          ngoại trừ mã bài viết đã dùng để tạo quảng cáo.
        </li>
      </UL>

      <P><b>Dữ liệu từ Google Ads</b>, chỉ khi bạn kết nối:</P>
      <UL>
        <li>Mã khách hàng (customer ID), tên, tiền tệ, múi giờ của tài khoản quảng cáo.</li>
        <li>Refresh token do Google cấp, được mã hóa trước khi lưu.</li>
        <li>Tên, loại, trạng thái, ngân sách chiến dịch và số liệu hiệu quả theo ngày.</li>
      </UL>

      <P>
        Chúng tôi <b>không</b> thu thập danh sách khách hàng, thông tin cá nhân của người
        xem quảng cáo, tin nhắn, danh bạ hay dữ liệu thanh toán của bạn. Ads OS không dùng
        cookie quảng cáo hay công cụ theo dõi của bên thứ ba. Cookie duy nhất là cookie
        phiên đăng nhập, cần thiết để ứng dụng hoạt động.
      </P>

      <H2>2. Chúng tôi dùng dữ liệu vào việc gì</H2>
      <UL>
        <li>Hiển thị báo cáo hiệu quả quảng cáo cho bạn và người được bạn cấp quyền.</li>
        <li>Chạy các cấu hình tự động hóa do bạn tạo, ví dụ cảnh báo khi chi phí vượt ngưỡng.</li>
        <li>
          Tạm dừng chiến dịch, đổi ngân sách hoặc tạo quảng cáo <b>chỉ khi</b> bạn tự bật chế
          độ ghi thật trên từng cấu hình hoặc tự bấm thao tác đó. Mọi thay đổi được ghi vào
          nhật ký kèm thời điểm và lý do.
        </li>
        <li>Bảo vệ tài khoản: phát hiện đăng nhập bất thường, chặn dò mật khẩu.</li>
      </UL>
      <P>
        Chúng tôi không bán, cho thuê hay trao đổi dữ liệu của bạn. Chúng tôi không dùng
        dữ liệu của bạn để quảng cáo, để lập hồ sơ người dùng, hay để huấn luyện mô hình
        trí tuệ nhân tạo.
      </P>

      <H2 id="google">3. Dữ liệu người dùng Google</H2>
      <P>
        Ads OS xin đúng một quyền của Google:{' '}
        <span className="mono">https://www.googleapis.com/auth/adwords</span>, dùng để đọc
        cấu trúc và số liệu tài khoản Google Ads, và để tạm dừng chiến dịch hoặc đổi ngân
        sách theo đúng các thao tác bạn yêu cầu. Dữ liệu nhận từ Google chỉ được dùng để
        cung cấp các tính năng bạn thấy trong Ads OS, không chuyển cho bên thứ ba, và
        không được con người đọc trừ khi bạn yêu cầu hỗ trợ, khi cần cho bảo mật, hoặc khi
        pháp luật bắt buộc.
      </P>
      <P>
        Việc Ads OS sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy"
           style={linkStyle}>Chính sách dữ liệu người dùng của Google API Services</a>,
        bao gồm các yêu cầu về Sử dụng giới hạn (Limited Use).
      </P>
      <P>
        <i>
          Ads OS&apos;s use and transfer to any other app of information received from Google
          APIs will adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
             style={linkStyle}>Google API Services User Data Policy</a>, including the
          Limited Use requirements.
        </i>
      </P>

      <H2>4. Chia sẻ dữ liệu</H2>
      <P>Dữ liệu của bạn chỉ đi tới những nơi sau:</P>
      <UL>
        <li>
          <b>Meta và Google</b>: Ads OS gửi yêu cầu tới API của họ bằng token bạn cấp để đọc
          số liệu và thực hiện thao tác bạn yêu cầu.
        </li>
        <li>
          <b>Người dùng khác trong cùng tổ chức</b> do quản trị viên của bạn cấp quyền.
        </li>
        <li>
          <b>Ứng dụng bạn tự kết nối qua API key</b> (ví dụ trợ lý AI dùng giao thức MCP).
          Key do bạn tạo, mặc định chỉ đọc, và bạn thu hồi được bất cứ lúc nào.
        </li>
        <li><b>Cơ quan nhà nước có thẩm quyền</b> khi pháp luật Việt Nam yêu cầu.</li>
      </UL>

      <H2>5. Lưu trữ và bảo mật</H2>
      <UL>
        <li>
          Dữ liệu lưu trên máy chủ do chúng tôi quản lý, mọi kết nối tới Ads OS đều qua
          HTTPS.
        </li>
        <li>
          Access token, refresh token và page token được mã hóa bằng khóa riêng trước khi
          ghi vào cơ sở dữ liệu, và không bao giờ hiển thị lại trên giao diện.
        </li>
        <li>API key chỉ lưu dạng băm SHA-256; bạn chỉ thấy key một lần lúc tạo.</li>
        <li>Đăng nhập sai nhiều lần bị khóa tạm thời; tài khoản bị vô hiệu hóa mất quyền ngay.</li>
      </UL>
      <P>
        Không hệ thống nào an toàn tuyệt đối. Nếu xảy ra sự cố ảnh hưởng tới dữ liệu của
        bạn, chúng tôi sẽ thông báo qua email trong thời gian sớm nhất.
      </P>

      <H2>6. Thời gian lưu giữ</H2>
      <UL>
        <li>Token được xóa ngay khi bạn bấm <b>Ngắt</b> một tài khoản trong mục Kết nối.</li>
        <li>
          Số liệu quảng cáo đã kéo về được giữ để bạn xem lại lịch sử, cho tới khi bạn yêu
          cầu xóa hoặc tài khoản Ads OS bị xóa.
        </li>
        <li>
          Khi bạn yêu cầu xóa, chúng tôi chỉ giữ lại bản ghi yêu cầu (mã tra cứu và thời
          điểm) để chứng minh đã xử lý; bản ghi này không chứa dữ liệu quảng cáo.
        </li>
      </UL>

      <H2>7. Quyền của bạn</H2>
      <P>Bạn có quyền:</P>
      <UL>
        <li>Xem dữ liệu Ads OS đang lưu về tài khoản quảng cáo của bạn ngay trong ứng dụng.</li>
        <li>Ngắt kết nối và xóa token bất cứ lúc nào tại mục <b>Kết nối</b>.</li>
        <li>
          Yêu cầu xóa toàn bộ dữ liệu theo hướng dẫn tại{' '}
          <a href="/xoa-du-lieu" style={linkStyle}>trang Xóa dữ liệu</a>.
        </li>
        <li>
          Thu hồi quyền trực tiếp từ nền tảng:{' '}
          <a href="https://www.facebook.com/settings?tab=applications" style={linkStyle}>
            Facebook → Ứng dụng và trang web</a>{' '}
          hoặc{' '}
          <a href="https://myaccount.google.com/permissions" style={linkStyle}>
            Google → Ứng dụng bên thứ ba có quyền truy cập</a>.
        </li>
        <li>Yêu cầu chỉnh sửa thông tin tài khoản hoặc khiếu nại về việc xử lý dữ liệu.</li>
      </UL>
      <P>
        Chúng tôi xử lý dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá
        nhân và các quy định pháp luật Việt Nam có liên quan. Yêu cầu gửi tới{' '}
        <span className="mono">{CONTACT}</span> được phản hồi trong vòng 7 ngày làm việc.
      </P>

      <H2>8. Trẻ em</H2>
      <P>
        Ads OS là công cụ dành cho doanh nghiệp, không hướng tới người dưới 18 tuổi và
        không cố ý thu thập dữ liệu của trẻ em.
      </P>

      <H2>9. Thay đổi chính sách</H2>
      <P>
        Khi thay đổi cách thu thập hoặc sử dụng dữ liệu, chúng tôi cập nhật trang này và
        ngày &ldquo;Cập nhật lần cuối&rdquo; ở đầu trang. Thay đổi quan trọng sẽ được thông
        báo trong ứng dụng hoặc qua email.
      </P>
    </LegalShell>
  );
}
