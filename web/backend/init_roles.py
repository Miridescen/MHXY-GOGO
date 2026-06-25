#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
角色价格：建表 + 灌入查询清单（一次性，放服务器执行）

设计思路（"查询注册表 + 结果历史"，条件用 JSON，加条件只是加数据、不改表）：
  role_query          定义"要追踪哪些角色搜索"：conditions(业务条件) + api_params(藏宝阁接口参数)
  role_price_history   每个 query 每天一行全服最低价

爬虫流程：GET /api/role_queries → 按 api_params 跨服搜 → 取最低价 → POST /api/ingest_role
加新组合 = 往 role_query 插一行；加新条件维度 = JSON 多一个键。爬虫/表结构都不用改。

用法： python3 init_roles.py
"""
import sqlite3
import json

DB = "/opt/cbg-data/prices.db"

# 类别 → 藏宝阁接口参数（飞升/渡劫/化圣=zhuang_zhi 状态码；175级=等级区间）
CATS = [
    ("飞升", {"zhuang_zhi": "1"}),
    ("渡劫", {"zhuang_zhi": "2"}),
    ("175级", {"level_min": 175, "level_max": 175}),
    ("化圣", {"zhuang_zhi": "10,20,30,40,50,60,70,80,90"}),
]
# 开服年限 server_type: 1=1年内 2=1到3年 3=3年以上（与 server_map.server_age 同码）
AGES = [(1, "1年内"), (2, "1到3年"), (3, "3年以上")]


def main():
    db = sqlite3.connect(DB)
    c = db.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS role_query(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,            -- 人读名, 如 飞升·3年以上
        conditions TEXT,            -- JSON 业务条件(给人看/网站筛选)
        api_params TEXT,            -- JSON 藏宝阁接口查询参数
        enabled INTEGER DEFAULT 1)""")
    c.execute("""CREATE TABLE IF NOT EXISTS role_price_history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_id INTEGER REFERENCES role_query(id),
        run_time TEXT,              -- 采集日期(年月日)
        price_yuan REAL,            -- 该组合全服最低价(元)
        serverid INTEGER, server_name TEXT, area_name TEXT,
        link TEXT, eid TEXT,
        UNIQUE(query_id, run_time))""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_rph ON role_price_history(query_id, run_time)")

    for cat, p in CATS:
        for code, agename in AGES:
            name = f"{cat}·{agename}"
            conditions = json.dumps({"类别": cat, "开服年限": code}, ensure_ascii=False)
            api_params = json.dumps({**p, "server_type": code}, ensure_ascii=False)
            c.execute("""INSERT INTO role_query(name,conditions,api_params,enabled) VALUES(?,?,?,1)
                ON CONFLICT(name) DO UPDATE SET conditions=excluded.conditions, api_params=excluded.api_params""",
                      (name, conditions, api_params))
    db.commit()
    print("role_query 共", c.execute("SELECT COUNT(*) FROM role_query").fetchone()[0], "条")


if __name__ == "__main__":
    main()
