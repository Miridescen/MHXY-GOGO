#!/usr/bin/env bash
# ============================================================
# 网页端发布脚本 —— 构建 web/frontend 并镜像到生产静态目录
#
# 用法：
#   sh deploy-web.sh          npm build + rsync dist/ → 服务器 /var/www/mhxy/
#   sh deploy-web.sh --nobuild 跳过构建，直接发布已有 dist/
#
# nginx 静态站，发布后刷新即生效，无需重启。唯一真相 = 仓库 web/frontend/src。
# 服务器地址取 SSH 别名 mhxy；换机器可 HOST=root@43.138.178.39 sh deploy-web.sh
# ============================================================
set -euo pipefail

HOST="${HOST:-mhxy}"
DEST="/var/www/mhxy"
DIR="$(cd "$(dirname "$0")" && pwd)/web/frontend"

if [ "${1:-}" != "--nobuild" ]; then
  echo "构建 web/frontend …"
  ( cd "$DIR" && npm run build )
fi

[ -f "$DIR/dist/index.html" ] || { echo "❌ 没有 dist/index.html，先构建"; exit 1; }

echo "发布 dist/ → $HOST:$DEST/（镜像同步）"
rsync -av --delete "$DIR/dist/" "$HOST:$DEST/"
echo "✅ 网页端已发布（nginx 静态即时生效）。刷新 https://dogfever.cn/"
