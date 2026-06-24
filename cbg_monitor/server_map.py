#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抓取并入库「大区 ↔ 服务器 ↔ serverid」映射（放在 /opt/cbg-data/server_map.py）

数据源（网易 CDN 静态文件，免登录、服务器可直接抓）：
  时间服: https://cbg-xyq.res.netease.com/js/server_list_data.js       → var server_data
  畅玩服: https://cbg-xyq.res.netease.com/js/xyqs_server_list_data.js   → var xyqs_server_data

数据结构： { areaid: [ [区名,...], [ [serverid,服务器名,...], ... ] ] }

入库表 server_map：
  product     时间服 / 畅玩服
  area_name   大区
  server_name 服务器名
  serverid    服务器ID（合服会多名共用同一ID，正常）
  server_age  三年内 / 三年外（仅时间服；本脚本不填，留待开服时间探测填充）

用法： python3 /opt/cbg-data/server_map.py
"""
import re
import json
import sqlite3
import requests

DB = "/opt/cbg-data/prices.db"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/149.0 Safari/537.36"
SOURCES = [
    ("https://cbg-xyq.res.netease.com/js/server_list_data.js", "server_data", "时间服"),
    ("https://cbg-xyq.res.netease.com/js/xyqs_server_list_data.js", "xyqs_server_data", "畅玩服"),
]


def extract_balanced(text, start):
    """从 start 处的 '{' 起花括号配对，返回完整 JSON 子串。"""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    raise RuntimeError("花括号未配平")


def fetch_map(url, varname, product):
    t = requests.get(url, headers={"User-Agent": UA}, timeout=20).text
    m = re.search(varname + r"\s*=\s*", t)
    if not m:
        raise RuntimeError(f"{varname} 未找到于 {url}")
    raw = extract_balanced(t, t.index("{", m.end()))
    sd = json.loads(raw)
    rows = []
    for area in sd.values():
        area_name = area[0][0]
        for s in area[1]:
            rows.append((product, area_name, s[1], s[0]))   # product, 区, 服, serverid
    return rows


def init_db(db):
    db.execute("""CREATE TABLE IF NOT EXISTS server_map(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product TEXT,
        area_name TEXT,
        server_name TEXT,
        serverid INTEGER,
        server_age TEXT,
        UNIQUE(product, area_name, server_name))""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_map_sid ON server_map(serverid)")
    db.commit()


def main():
    db = sqlite3.connect(DB)
    init_db(db)
    total = 0
    for url, var, product in SOURCES:
        rows = fetch_map(url, var, product)
        db.executemany(
            """INSERT INTO server_map(product,area_name,server_name,serverid)
               VALUES(?,?,?,?)
               ON CONFLICT(product,area_name,server_name)
               DO UPDATE SET serverid=excluded.serverid""", rows)
        total += len(rows)
        print(f"{product}: {len(rows)} 个服务器")
    db.commit()
    cnt = db.execute("SELECT COUNT(*) FROM server_map").fetchone()[0]
    print(f"完成：本次 {total} 行；server_map 表共 {cnt} 行")


if __name__ == "__main__":
    main()
