// Địa chỉ CÔNG KHAI của ứng dụng, nhìn từ phía trình duyệt.
//
// VÌ SAO KHÔNG DÙNG `new URL(req.url).origin`:
//
// Sau nginx, req.url là địa chỉ NỘI BỘ — `https://localhost:3100/...`. Suy
// origin từ đó rồi ghép thành redirect_uri sẽ gửi lên Google chuỗi
// `https://localhost:3100/api/connections/google/callback`, và Google từ chối
// với redirect_uri_mismatch. Đổi bao nhiêu OAuth client cũng vô ích vì lỗi
// không nằm ở client.
//
// Lỗi này đã ẩn từ đầu dự án: luồng Facebook chạy được chỉ nhờ FB_REDIRECT_URI
// được khai cứng trong .env, che mất đường suy ra tự động vốn đã hỏng.
//
// AN TOÀN: các header x-forwarded-* do client giả được, nhưng ứng dụng chỉ
// nghe trên 127.0.0.1 nên chỉ nginx gọi tới được, và nginx LUÔN ghi đè chúng
// (proxy_set_header). Ai bỏ dòng proxy_set_header đó hoặc mở cổng 3100 ra
// ngoài là phá vỡ giả định này.

export function publicOrigin(req: Request): string {
  const h = req.headers;

  // Chuẩn chung của mọi reverse proxy. Lấy phần tử đầu — phần sau là chuỗi proxy.
  const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0]?.trim();
  // Host phải lấy từ header, không phải từ req.url.
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0]?.trim();

  if (host) {
    // Chạy local không có proxy thì không có x-forwarded-proto; đoán theo host.
    const scheme = proto || (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? 'http' : 'https');
    return `${scheme}://${host}`;
  }

  // Không có header nào dùng được — quay về req.url. Tới đây thì gần như chắc
  // chắn sai, nhưng trả chuỗi rỗng còn tệ hơn.
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}
