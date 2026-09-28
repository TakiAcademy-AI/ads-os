# Ads OS

Vận hành quảng cáo tự động cho Facebook, Google, TikTok.

Tách từ module ads của `marketing-os`, chỉ giữ phần quảng cáo.

## Điểm khác các tool cùng loại

Tắt ads theo CPA thô là **tắt oan**: Facebook/Google sửa số hồi tố, conversion
của mấy ngày gần nhất chưa về đủ nên CPA luôn nhìn tệ hơn thực tế.

Ads OS chỉ kết luận trên phần dữ liệu **đã qua cửa sổ attribution**, và đo cửa
sổ đó từ lịch sử số liệu thật của chính tài khoản thay vì đoán một con số.

Mọi thay đổi — gồm cả lần chạy thử và lần bị guard chặn — đều vào `ad_mutation`.
Nhật ký thiếu thì không ai dám bật auto.

## Chạy local

```bash
# Postgres (dùng chung container với marketing-os, database ads_os)
docker compose -f ../soida/marketing-os/docker-compose.dev.yml up -d
createdb ads_os   # hoặc: psql -c 'CREATE DATABASE ads_os'

cp .env.example .env     # điền SESSION_PASSWORD + ENCRYPTION_KEY
npm install
npm run db:migrate
npm run db:seed          # dữ liệu demo — admin@taki.vn / Admin@123456
npm run dev
```

## Trạng thái

| Xong | Chưa |
|---|---|
| Schema, migration, seed | Kéo số thật từ Facebook API |
| Đăng nhập, phân quyền cơ bản | Lớp ghi (tắt/bật, đổi ngân sách) |
| Bảng điều khiển, Chiến dịch, Nhật ký | Ngân sách theo giờ, Auto chạy ads |
| Guard attribution + đo cửa sổ | Adapter Google, TikTok |

Toàn bộ hiện **read-only** — chưa có lệnh nào ghi lên tài khoản quảng cáo.
