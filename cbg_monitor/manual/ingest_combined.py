#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
合并 CSV 导入（放服务器 /opt/cbg-data/ingest_combined.py）

配合浏览器控制台脚本导出的单文件 CSV，列：
  run_date, item, 大区, 服务器, serverid, 最低价(元), 商品链接, eid
（大区/服务器仅供人看，不入库；服务器名/大区靠 serverid 关联 server_map）

按 (item_id, run_time, serverid) 去重，同日重复导入=覆盖更新。
物品不存在则自动在 item 表新建（category_id 留空，前端按"宝宝"兜底，
 之后可 UPDATE item SET category_id=? 归类）。

用法：python3 /opt/cbg-data/ingest_combined.py <xunshou_YYYYMMDD.csv>
"""
import os
import sys
import csv
import sqlite3

DB = os.environ.get("CBG_DB", "/opt/cbg-data/prices.db")


def get_item_id(db, name):
    db.execute("INSERT OR IGNORE INTO item(name) VALUES(?)", (name,))
    return db.execute("SELECT id FROM item WHERE name=?", (name,)).fetchone()[0]


def main(path):
    db = sqlite3.connect(DB)
    rows, dates, items = [], set(), set()
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                iid = get_item_id(db, r["item"].strip())
                rows.append((iid, r["run_date"].strip(), int(r["serverid"]),
                             float(r["最低价(元)"]), r.get("商品链接", ""), r.get("eid", "")))
                dates.add(r["run_date"].strip()); items.add(r["item"].strip())
            except (KeyError, ValueError):
                continue
    db.executemany("""INSERT INTO price_history(item_id,run_time,serverid,price_yuan,link,eid)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(item_id,run_time,serverid)
        DO UPDATE SET price_yuan=excluded.price_yuan, link=excluded.link, eid=excluded.eid""", rows)
    db.commit()
    total = db.execute("SELECT COUNT(*) FROM price_history").fetchone()[0]
    print(f"导入 {len(rows)} 行 | 物品: {', '.join(sorted(items))} | 日期: {', '.join(sorted(dates))}")
    print(f"历史库现有 {total} 行 → {DB}")
    db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("用法: python3 ingest_combined.py <xunshou_YYYYMMDD.csv>")
    main(sys.argv[1])
