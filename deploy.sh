#!/usr/bin/env bash
# ============================================================
# 后端部署脚本 —— 仓库 web/backend/ = 唯一真相，下发到生产并重启
#
# 用法：
#   sh deploy.sh           同步 web/backend/ → 服务器 + 重启 mhxy-api
#   sh deploy.sh --check    只对比差异、不改动（检测漂移；有漂移则非零退出）
#
# 约定：⚠️ 只准改仓库 web/backend/，再跑本脚本下发。绝不手改服务器上的文件，
#       否则两处漂移且无人察觉。改完/发版前用 --check 自检。
#
# 服务器地址取 SSH 别名 mhxy（见 ~/.ssh/config）；换机器可 HOST=root@43.138.178.39 sh deploy.sh
# ============================================================
set -euo pipefail

HOST="${HOST:-mhxy}"
DEST="/opt/cbg-data/web-backend"
SRC="$(cd "$(dirname "$0")" && pwd)/web/backend"

# 需要保持一致的文件（运行时 + 种子脚本）
FILES=$(cd "$SRC" && ls *.py *.json 2>/dev/null)

if [ "${1:-}" = "--check" ]; then
  echo "对比 仓库 vs 服务器 $HOST:$DEST"
  drift=0
  for f in $FILES; do
    if ssh "$HOST" "cat $DEST/$f 2>/dev/null" | diff -q - "$SRC/$f" >/dev/null 2>&1; then
      echo "  ✅ $f"
    else
      echo "  ⚠️  漂移: $f"; drift=1
    fi
  done
  if [ "$drift" = 0 ]; then echo "✅ 两处一致，无漂移"; else echo "❌ 有漂移 → 跑 sh deploy.sh 下发（或先确认服务器改动是否要回填仓库）"; exit 1; fi
  exit 0
fi

echo "同步 $SRC/ → $HOST:$DEST/"
rsync -av --include='*.py' --include='*.json' --exclude='*' "$SRC/" "$HOST:$DEST/"
echo "重启 mhxy-api …"
ssh "$HOST" "systemctl restart mhxy-api && sleep 2 && echo 服务状态: \$(systemctl is-active mhxy-api)"
echo "✅ 部署完成，用 sh deploy.sh --check 复核"
