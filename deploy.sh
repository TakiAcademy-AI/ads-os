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
KEY=~/.ssh/id_ed25519
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
ssh -i "$KEY" "$HOST" 'set -e
  cd /opt/ads-os
  tar xzf /tmp/ads-os-deploy.tgz
  rm -f /tmp/ads-os-deploy.tgz
  npm ci --no-audit --no-fund 2>&1 | tail -2
  npm run db:migrate 2>&1 | tail -1
  npm run build 2>&1 | tail -3
  systemctl restart ads-os
  sleep 5
  systemctl is-active ads-os
  curl -s -o /dev/null -w "http nội bộ: %{http_code}\n" http://127.0.0.1:3100/login'

rm -f /tmp/ads-os-deploy.tgz
echo "==> xong — https://testads.taki.vn"
