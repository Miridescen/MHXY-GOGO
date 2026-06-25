#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
角色价格：建表 + 灌入查询清单（一次性，放服务器执行）

设计："查询注册表 + 结果历史"，条件用 JSON，加条件只是加数据、不改表。
  role_query(grp, name, conditions, api_params, enabled)   grp 分组便于网站分块展示
  role_price_history(query_id, run_time, price_yuan, ...)

两组：
  境界组(grp=境界)：类别(飞升/渡劫/175级/化圣) × 开服年限(1年内/1到3年/3年以上) = 12
  锦衣组(grp=锦衣)：性别(男/女) × 等级(69/109/飞升/渡劫/175/化圣) × 限量锦衣(19) = 228

用法： python3 init_roles.py
"""
import sqlite3
import json

DB = "/opt/cbg-data/prices.db"

# ---- 境界组 ----
JINGJIE_CATS = [("飞升", {"zhuang_zhi": "1"}), ("渡劫", {"zhuang_zhi": "2"}),
                ("175级", {"level_min": 175, "level_max": 175}),
                ("化圣", {"zhuang_zhi": "10,20,30,40,50,60,70,80,90"})]
AGES = [(1, "1年内"), (2, "1到3年"), (3, "3年以上")]   # server_type

# ---- 锦衣组 ----
SEX = [("男", 1), ("女", 2)]
LEVELS = [  # 等级标签 → 接口参数
    ("69", {"level_min": 69, "level_max": 69}),
    ("109", {"level_min": 109, "level_max": 109}),
    ("飞升", {"zhuang_zhi": "1"}),
    ("渡劫", {"zhuang_zhi": "2"}),
    ("175", {"level_min": 175, "level_max": 175}),
    ("化圣", {"zhuang_zhi": "10,20,30,40,50,60,70,80,90"}),
]
CLOTHES = [  # 锦衣名 → limit_clothes 编码（图2红框内 19 个）
    ("青花瓷", 12512), ("青花瓷.墨黑", 12513), ("青花瓷.月白", 12514),
    ("冰寒绡", 12498), ("冰寒绡.月白", 40023), ("冰寒绡.墨黑", 40025),
    ("落星织", 40013),
    ("云龙梦", 40124), ("云龙梦.月白", 40126), ("云龙梦.墨黑", 40128),
    ("浪淘纱", 42196), ("浪淘纱·月白", 42198), ("浪淘纱·墨黑", 42200),
    ("纤云纱", 40285), ("纤云纱·月白", 40287), ("纤云纱·墨黑", 13029),
    ("水云归", 42560), ("水云归·月白", 42562), ("水云归·墨黑", 42564),
]


def upsert(c, grp, name, conditions, api_params):
    c.execute("""INSERT INTO role_query(grp,name,conditions,api_params,enabled) VALUES(?,?,?,?,1)
        ON CONFLICT(name) DO UPDATE SET grp=excluded.grp, conditions=excluded.conditions, api_params=excluded.api_params""",
              (grp, name, json.dumps(conditions, ensure_ascii=False), json.dumps(api_params, ensure_ascii=False)))


def main():
    db = sqlite3.connect(DB)
    c = db.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS role_query(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE, conditions TEXT, api_params TEXT, enabled INTEGER DEFAULT 1)""")
    if "grp" not in [r[1] for r in c.execute("PRAGMA table_info(role_query)")]:
        c.execute("ALTER TABLE role_query ADD COLUMN grp TEXT")   # 分组: 境界 / 锦衣
    c.execute("""CREATE TABLE IF NOT EXISTS role_price_history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_id INTEGER REFERENCES role_query(id), run_time TEXT,
        price_yuan REAL, serverid INTEGER, server_name TEXT, area_name TEXT,
        link TEXT, eid TEXT, UNIQUE(query_id, run_time))""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_rph ON role_price_history(query_id, run_time)")

    # 境界组
    for cat, p in JINGJIE_CATS:
        for code, agename in AGES:
            upsert(c, "境界", f"{cat}·{agename}", {"类别": cat, "开服年限": code}, {**p, "server_type": code})
    # 锦衣组
    for cloth, cv in CLOTHES:
        for sexname, sexcode in SEX:
            for lvl, lp in LEVELS:
                upsert(c, "锦衣", f"{cloth}·{sexname}·{lvl}",
                       {"锦衣": cloth, "性别": sexname, "等级": lvl},
                       {"limit_clothes": cv, "sex": sexcode, **lp})
    db.commit()
    for g in ("境界", "锦衣"):
        print(g, "组:", c.execute("SELECT COUNT(*) FROM role_query WHERE grp=?", (g,)).fetchone()[0], "条")
    print("合计:", c.execute("SELECT COUNT(*) FROM role_query").fetchone()[0])


if __name__ == "__main__":
    main()
