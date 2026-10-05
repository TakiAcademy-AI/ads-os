// Trang CÔNG KHAI — URL này khai trong Facebook App (Terms of Service URL) và
// Google OAuth consent screen.

import {
  LegalShell, H2, P, UL, linkStyle, COMPANY, CONTACT,
} from '../_legal/shell';

export const metadata = {
  title: 'Điều khoản dịch vụ — Ads OS',
  description: 'Điều khoản sử dụng công cụ vận hành quảng cáo Ads OS',
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Điều khoản dịch vụ"
      intro={<>
        Các điều khoản này áp dụng khi bạn sử dụng Ads OS, công cụ vận hành quảng cáo do{' '}
        <b>{COMPANY}</b> (&ldquo;chúng tôi&rdquo;) cung cấp. Bằng việc đăng nhập và sử dụng
        Ads OS, bạn đồng ý với các điều khoản dưới đây và với{' '}
        <a href="/privacy" style={linkStyle}>Chính sách bảo mật</a>.
      </>}
    >
      <H2>1. Dịch vụ</H2>
      <P>
        Ads OS kết nối với tài khoản quảng cáo Facebook và Google Ads của bạn để kéo số liệu,
        hiển thị báo cáo, chạy các cấu hình tự động hóa do bạn thiết lập (ví dụ tạm dừng
        chiến dịch khi chi phí vượt ngưỡng, đổi ngân sách, tạo quảng cáo từ bài viết), và
        cung cấp API để các ứng dụng bạn cho phép truy cập dữ liệu đó.
      </P>
      <P>
        Ads OS không phải là sản phẩm của Meta hay Google, và không được Meta hay Google
        bảo trợ hay xác nhận.
      </P>

      <H2>2. Tài khoản</H2>
      <UL>
        <li>Tài khoản Ads OS do quản trị viên tổ chức của bạn hoặc do chúng tôi cấp.</li>
        <li>
          Bạn chịu trách nhiệm giữ bí mật mật khẩu và API key, và chịu trách nhiệm về mọi
          thao tác thực hiện bằng tài khoản của mình.
        </li>
        <li>
          Báo cho chúng tôi ngay qua <span className="mono">{CONTACT}</span> khi nghi ngờ tài
          khoản bị truy cập trái phép.
        </li>
      </UL>

      <H2>3. Kết nối tài khoản quảng cáo</H2>
      <UL>
        <li>
          Bạn chỉ được kết nối tài khoản quảng cáo, Trang và token mà bạn sở hữu hoặc được
          chủ sở hữu ủy quyền hợp lệ.
        </li>
        <li>
          Khi kết nối, bạn cho phép Ads OS thay mặt bạn gọi API của Meta và Google trong
          phạm vi quyền bạn đã cấp. Bạn có thể ngắt kết nối bất cứ lúc nào.
        </li>
        <li>
          Bạn vẫn phải tuân thủ{' '}
          <a href="https://www.facebook.com/policies/ads/" style={linkStyle}>Chính sách
          quảng cáo của Meta</a>,{' '}
          <a href="https://support.google.com/adspolicy/" style={linkStyle}>Chính sách
          Google Ads</a> và điều khoản của từng nền tảng. Ads OS không chịu trách nhiệm khi
          nền tảng từ chối quảng cáo hay hạn chế tài khoản của bạn.
        </li>
      </UL>

      <H2>4. Tự động hóa và thay đổi trên tài khoản quảng cáo</H2>
      <P>
        Đây là phần quan trọng nhất, vì thao tác tự động có thể ảnh hưởng tới chi tiêu quảng
        cáo thật của bạn.
      </P>
      <UL>
        <li>
          Mọi cấu hình mới được tạo ở chế độ thử: Ads OS chỉ ghi lại việc <i>sẽ làm</i>, không
          thay đổi gì trên tài khoản. Chỉ khi bạn tự bật <b>ghi thật</b> trên từng cấu hình
          thì Ads OS mới thực hiện thay đổi.
        </li>
        <li>
          Bạn chịu trách nhiệm về ngưỡng, ngân sách, đối tượng, nội dung quảng cáo và mọi
          thiết lập khác trong cấu hình của mình, cũng như kết quả chi tiêu phát sinh.
        </li>
        <li>
          Số liệu trên Ads OS được kéo từ API của nền tảng và có thể chậm, thiếu hoặc được
          nền tảng điều chỉnh lại sau đó. Số liệu trên trình quản lý quảng cáo của Meta và
          Google là số liệu gốc.
        </li>
        <li>
          Bạn nên theo dõi tài khoản quảng cáo thường xuyên và không nên dựa hoàn toàn vào
          tự động hóa cho các quyết định chi tiêu lớn.
        </li>
      </UL>

      <H2>5. Sử dụng được phép</H2>
      <P>Bạn không được:</P>
      <UL>
        <li>Dùng Ads OS cho quảng cáo vi phạm pháp luật Việt Nam hoặc chính sách nền tảng.</li>
        <li>Truy cập tài khoản, dữ liệu hay hệ thống không thuộc quyền của bạn.</li>
        <li>
          Dò quét, tấn công, gây quá tải, dịch ngược hoặc tìm cách vượt qua cơ chế bảo mật
          của Ads OS.
        </li>
        <li>Bán lại hoặc cho bên khác dùng tài khoản Ads OS mà không có sự đồng ý của chúng tôi.</li>
      </UL>
      <P>
        Chúng tôi có quyền tạm khóa hoặc chấm dứt tài khoản vi phạm các điều trên, và sẽ
        thông báo lý do khi pháp luật cho phép.
      </P>

      <H2>6. Dữ liệu và quyền sở hữu</H2>
      <UL>
        <li>
          Dữ liệu quảng cáo của bạn thuộc về bạn. Chúng tôi chỉ xử lý dữ liệu đó để cung cấp
          dịch vụ, như mô tả trong <a href="/privacy" style={linkStyle}>Chính sách bảo mật</a>.
        </li>
        <li>
          Phần mềm, giao diện và tài liệu của Ads OS thuộc quyền sở hữu của {COMPANY}.
        </li>
      </UL>

      <H2>7. Tính sẵn sàng của dịch vụ</H2>
      <P>
        Chúng tôi nỗ lực để Ads OS hoạt động ổn định nhưng không cam kết dịch vụ không bao
        giờ gián đoạn. Dịch vụ phụ thuộc vào API của Meta và Google; khi các nền tảng này
        thay đổi, giới hạn hoặc ngừng API, một số tính năng có thể tạm thời không hoạt động.
        Chúng tôi có thể bảo trì, thay đổi hoặc ngừng một tính năng và sẽ báo trước khi thay
        đổi đó ảnh hưởng lớn tới cách bạn sử dụng.
      </P>

      <H2>8. Giới hạn trách nhiệm</H2>
      <P>
        Trong phạm vi pháp luật cho phép, Ads OS được cung cấp theo hiện trạng. Chúng tôi
        không chịu trách nhiệm về thiệt hại gián tiếp, mất doanh thu, mất cơ hội kinh doanh,
        hay chi tiêu quảng cáo phát sinh từ thiết lập của bạn, từ số liệu chậm hoặc sai do
        nền tảng cung cấp, hoặc từ việc nền tảng hạn chế tài khoản của bạn.
      </P>

      <H2>9. Chấm dứt</H2>
      <P>
        Bạn có thể ngừng sử dụng bất cứ lúc nào bằng cách ngắt các kết nối và yêu cầu xóa
        dữ liệu theo hướng dẫn tại <a href="/xoa-du-lieu" style={linkStyle}>trang Xóa dữ
        liệu</a>. Khi tài khoản bị chấm dứt, token bị xóa và Ads OS ngừng mọi thao tác
        tự động trên tài khoản quảng cáo của bạn.
      </P>

      <H2>10. Thay đổi điều khoản</H2>
      <P>
        Chúng tôi có thể cập nhật các điều khoản này. Ngày &ldquo;Cập nhật lần cuối&rdquo; ở
        đầu trang cho biết phiên bản hiện hành. Tiếp tục sử dụng Ads OS sau khi điều khoản
        thay đổi nghĩa là bạn chấp nhận phiên bản mới.
      </P>

      <H2>11. Luật áp dụng</H2>
      <P>
        Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp được ưu tiên
        giải quyết bằng thương lượng; nếu không thành, sẽ được đưa ra tòa án có thẩm quyền
        tại Hà Nội.
      </P>

      <H2>12. Liên hệ</H2>
      <P>
        Mọi câu hỏi về điều khoản này, gửi tới <span className="mono">{CONTACT}</span>.
      </P>
    </LegalShell>
  );
}
