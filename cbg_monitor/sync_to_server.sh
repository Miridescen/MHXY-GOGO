#!/bin/bash
# 本地 → 服务器 数据同步
# 用法: ./sync_to_server.sh [本地数据目录，默认 ../data]
# 流程: rsync 上传 data/ 里的 CSV → 触发服务器入库(累积进 prices.db)
set -e

SERVER="root@43.106.131.65"
REMOTE_RUNS="/opt/cbg-data/runs"
DATA_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/data}"

echo "同步 $DATA_DIR/ → $SERVER:$REMOTE_RUNS/"
rsync -avz --include='*.csv' --exclude='*' "$DATA_DIR/" "$SERVER:$REMOTE_RUNS/"

echo "触发服务器入库 …"
ssh "$SERVER" 'python3 /opt/cbg-data/ingest.py'

echo "✅ 完成。可在服务器上查询: sqlite3 /opt/cbg-data/prices.db"
