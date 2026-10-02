#!/usr/bin/env bash
# Deploy Ads OS lên VPS 152.53.2.174 (testads.taki.vn).
#
#   ./deploy.sh          # xem sẽ làm gì, không thực thi
#   ./deploy.sh --go     # thực thi
#
# VPS KHÔNG có rsync → đóng gói tar rồi scp.
# .env trên server KHÔNG bị ghi đè — secret production khác bản dev.

set -euo pipefail

HOST=root@152.53.2.174
KEY=${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}
REMOTE=/opt/ads-os
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY=1
[[ "${1:-}" == "--go" ]] && DRY=0

say() { printf '  %s\n' "$*"; }

if [[ $DRY -eq 1 ]]; then
  echo "CHẠY THỬ — thêm --go để thực thi"
  echo
  say "1. tar nguồn (bỏ node_modules, .next, .git, .env)"
  say "2. scp lên $HOST:/tmp/"
  say "3. giải nén vào $REMOTE (giữ nguyên .env đang có)"
  say "4. npm ci"
  say "5. npm run db:migrate"
  say "6. npm run build"
  say "7. systemctl restart ads-os"
  say "8. kiểm tra HTTP"
  exit 0
fi

echo "==> đóng gói"
tar czf /tmp/ads-os-deploy.tgz -C "$SRC" \
  --exclude=node_modules --exclude=.next --exclude=.git \
  --exclude='.env' --exclude='*.tsbuildinfo' --exclude=deploy.sh .
say "$(du -h /tmp/ads-os-deploy.tgz | cut -f1)"

# Chặn sự cố ngớ ngẩn: .env lọt vào gói là đẩy secret dev đè lên production.
if tar tzf /tmp/ads-os-deploy.tgz | grep -qE '(^|/)\.env$'; then
  echo "DỪNG: .env lọt vào gói" >&2; exit 1
fi

echo "==> đẩy lên"
scp -i "$KEY" -q /tmp/ads-os-deploy.tgz "$HOST:/tmp/"

echo "==> triển khai"
# bash + pipefail, và mỗi bước phải thành công mới sang bước sau. Bản cũ nối
# `| tail` sau npm nên build hỏng vẫn báo thành công rồi restart — với deploy
# tự động từ CI thì đó là sập production mà không ai hay.
ssh -i "$KEY" "$HOST" bash -se <<'REMOTE'
set -euo pipefail
run() {
  if "$@" >/tmp/ads-os-step.log 2>&1; then tail -2 /tmp/ads-os-step.log
  else tail -40 /tmp/ads-os-step.log; echo "DỪNG: '$*' thất bại" >&2; exit 1; fi
}
cd /opt/ads-os
tar xzf /tmp/ads-os-deploy.tgz
rm -f /tmp/ads-os-deploy.tgz
run npm ci --no-audit --no-fund
run npm run db:migrate
run npm run build
systemctl restart ads-os
# Next khởi động mất vài giây — chờ tới 60s thay vì ngủ cứng rồi đoán.
for _ in $(seq 1 12); do
  sleep 5
  if curl -fs -o /dev/null http://127.0.0.1:3100/login; then
    echo "http nội bộ: 200 · $(systemctl is-active ads-os)"; exit 0
  fi
done
systemctl status ads-os --no-pager | tail -20
echo "DỪNG: app không trả 200 sau 60s" >&2
exit 1
REMOTE

rm -f /tmp/ads-os-deploy.tgz
echo "==> xong — https://testads.taki.vn"
