// Hội thoại mẫu cho trang MCP.
//
// Trước đây trang này chỉ liệt kê tên hàm — `ads_list_campaigns` không nói lên
// điều gì với người chạy quảng cáo. Cho xem một đoạn trò chuyện thật thì tính
// năng mới thành thứ hiểu được ngay.
//
// Mọi câu trả lời dưới đây phải là thứ 4 công cụ HIỆN CÓ thật sự làm được.
// Viết ví dụ đẹp hơn khả năng thật là kiểu nói quá đã gây rắc rối một lần ở
// phần mô tả quyền OAuth.

interface Turn {
  ask: string;
  answer: React.ReactNode;
  tool: string;
}

const TURNS: Turn[] = [
  {
    ask: 'Chiến dịch nào đang thật sự lỗ?',
    tool: 'ads_list_campaigns',
    answer: (
      <>
        Trong 30 ngày, <b>3 chiến dịch vượt ngưỡng cả khi đã tính cửa sổ chờ</b>:
        <br />• Tin nhắn — Sách A: CPA chín <b>186.000đ</b> / ngưỡng 120.000đ
        <br />• Lead — Khoá B: CPA chín <b>131.000đ</b> / ngưỡng 80.000đ
        <br />
        <br />Và <b>2 chiến dịch trông như đang lỗ nhưng không phải</b> — CPA thô
        vượt ngưỡng, nhưng phần dữ liệu đã chín thì nằm trong ngưỡng. Công cụ tắt
        theo CPA thô sẽ tắt oan hai cái này.
      </>
    ),
  },
  {
    ask: 'Tuần này bot đã làm gì, có tắt nhầm gì không?',
    tool: 'ads_list_mutations',
    answer: (
      <>
        <b>7 lần xét, 2 lần tác động thật, 5 lần bị chặn.</b>
        <br />• Đã tắt: &ldquo;Tin nhắn — Sách A&rdquo;, CPA chín 186.000đ vượt ngưỡng
        <br />• Bị chặn (3): số chưa chốt, còn trong cửa sổ chờ
        <br />• Bị chặn (1): chiến dịch được bảo vệ
        <br />• Bị chặn (1): không đo được chuyển đổi
        <br />
        <br />Năm lần bị chặn đều là những lần bot <i>định</i> tắt nhưng guard
        không cho.
      </>
    ),
  },
  {
    ask: 'Nên chờ bao nhiêu ngày rồi hãy kết luận CPA?',
    tool: 'ads_attribution_curve',
    answer: (
      <>
        Đo từ chính lịch sử số liệu tài khoản này:
        <br />• sau 1 ngày mới thấy <b>61%</b> chuyển đổi cuối cùng
        <br />• sau 3 ngày: <b>88%</b>
        <br />• sau <b>6 ngày: 96%</b>
        <br />
        <br />Đề xuất đặt <b>cửa sổ chờ 6 ngày</b>. Đây là số đo được, không phải
        con số mặc định đoán sẵn.
      </>
    ),
  },
];

export function McpExamples() {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <b>Hỏi được những gì</b>
        <span>hỏi bằng tiếng Việt, AI tự chọn công cụ</span>
      </div>
      <div style={{ padding: '16px 18px' }}>
        {TURNS.map((t, i) => (
          <div key={i} style={{ marginBottom: i === TURNS.length - 1 ? 0 : 20 }}>
            <div style={{
              fontSize: 9.5, letterSpacing: .8, textTransform: 'uppercase',
              color: 'var(--dim)', textAlign: 'right', marginBottom: 3,
            }}>Bạn</div>
            <div style={{
              background: 'var(--acc)', color: 'var(--on-acc)',
              padding: '9px 13px', borderRadius: 'var(--r-sm)',
              borderBottomRightRadius: 4, fontSize: 13, lineHeight: 1.55,
              maxWidth: '82%', marginLeft: 'auto',
            }}>{t.ask}</div>

            <div style={{
              fontSize: 9.5, letterSpacing: .8, textTransform: 'uppercase',
              color: 'var(--dim)', marginTop: 9, marginBottom: 3,
            }}>Ads OS</div>
            <div style={{
              background: 'var(--side)', border: '1px solid var(--line)',
              color: 'var(--ink-2)', padding: '9px 13px',
              borderRadius: 'var(--r-sm)', borderBottomLeftRadius: 4,
              fontSize: 13, lineHeight: 1.6, maxWidth: '82%',
            }}>
              {t.answer}
              <div className="mono" style={{
                fontSize: 10.5, color: 'var(--dim)', marginTop: 7,
                paddingTop: 6, borderTop: '1px solid var(--line)',
              }}>dùng {t.tool}</div>
            </div>
          </div>
        ))}

        {/* Điểm khác biệt có chủ đích so với các sản phẩm cùng loại — nói rõ
            thay vì để người dùng tưởng là thiếu tính năng. */}
        <div className="note" style={{ maxWidth: 'none', marginTop: 18 }}>
          <b>AI chỉ đọc được, không sửa được tài khoản quảng cáo của bạn.</b> Không
          có công cụ nào cho phép tắt chiến dịch hay đổi ngân sách qua câu lệnh —
          một câu gõ vội hoặc AI hiểu nhầm không được phép tiêu tiền của bạn. Mọi
          hành động đều phải đi qua tab <b>Cấu hình</b>, nơi có trần thiệt hại,
          danh sách chiến dịch được bảo vệ và chế độ chạy thử.
        </div>
      </div>
    </div>
  );
}
