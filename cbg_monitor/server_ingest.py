#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
服务器端入库脚本（放在 /opt/cbg-data/ingest.py）

把 runs/ 目录下新上传的 CSV 累积进 SQLite 历史库 prices.db，
入库后把文件移到 runs/ingested/ 避免重复。

数据库结构：
  item(id, name)                          物品名 ↔ id 映射表
  price_history(id, item_id, run_time, serverid, price_yuan, link, eid)
                只存 item_id；服务器名/大区靠 serverid 关联 server_map

CSV 文件名约定： <物品名>__<YYYYMMDD-HHMM>.csv
  例：持国巡守__20260624-0930.csv  ← 物品名和采集时间从文件名解析
CSV 列： 大区,服务器,serverid,最低价(元),等级,简介,卖家,商品链接,eid
  （等级/简介/卖家 三列即使在 CSV 里也不入库）

用法（服务器上）： python3 /opt/cbg-data/ingest.py
"""
import os
import csv
import sqlite3
import datetime as dt

BASE = "/opt/cbg-data"
RUNS = os.path.join(BASE, "runs")
DONE = os.path.join(RUNS, "ingested")
DB = os.path.join(BASE, "prices.db")


def init_db(db):
    db.execute("""CREATE TABLE IF NOT EXISTS item(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS price_history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,   -- → item.id
        run_time TEXT,              -- 采集批次时间
        serverid INTEGER,           -- 服务器ID(关联 server_map.serverid)
        price_yuan REAL,            -- 该服最低价(元)
        link TEXT, eid TEXT,
        UNIQUE(item_id, run_time, serverid),
        FOREIGN KEY(item_id) REFERENCES item(id))""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_item_srv ON price_history(item_id, serverid, run_time)")
    db.commit()


def get_item_id(db, name):
    db.execute("INSERT OR IGNORE INTO item(name) VALUES(?)", (name,))
    return db.execute("SELECT id FROM item WHERE name=?", (name,)).fetchone()[0]


def parse_name(fname):
    base = os.path.splitext(os.path.basename(fname))[0]
    if "__" in base:
        item, ts = base.rsplit("__", 1)
    else:
        item, ts = base, dt.datetime.now().strftime("%Y%m%d-%H%M")
    return item, ts


def ingest_file(db, path):
    item_name, run_time = parse_name(path)
    item_id = get_item_id(db, item_name)
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                rows.append((item_id, run_time, int(r["serverid"]),
                             float(r["最低价(元)"]), r.get("商品链接", ""), r.get("eid", "")))
            except (KeyError, ValueError):
                continue
    db.executemany("""INSERT OR IGNORE INTO price_history
        (item_id,run_time,serverid,price_yuan,link,eid)
        VALUES(?,?,?,?,?,?)""", rows)
    db.commit()
    return item_name, run_time, len(rows)


def main():
    os.makedirs(DONE, exist_ok=True)
    db = sqlite3.connect(DB)
    init_db(db)
    files = sorted(f for f in os.listdir(RUNS)
                   if f.lower().endswith(".csv") and os.path.isfile(os.path.join(RUNS, f)))
    if not files:
        print("没有待入库的 CSV。")
        return
    total = 0
    for f in files:
        src = os.path.join(RUNS, f)
        item, run_time, n = ingest_file(db, src)
        os.replace(src, os.path.join(DONE, f))
        total += n
        print(f"入库 {f}: {item} @ {run_time} → {n} 行")
    cnt = db.execute("SELECT COUNT(*) FROM price_history").fetchone()[0]
    print(f"完成：本次 {total} 行；历史库累计 {cnt} 行 → {DB}")


if __name__ == "__main__":
    main()
