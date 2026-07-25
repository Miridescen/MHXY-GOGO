#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用物品库：建表 + 灌数据（幂等，可重复跑）。

物品 = 一切可定价的东西：抓宝宝产出（召唤兽/环装/告密）+ 常用交易物品（宝石/养成等）。
名称与 catch_log 的展示名对齐（召唤兽=宝宝名, 环装=「60环·武器」, 告密=「告密」），
以便后续 收益记录 × 价格标签 = 金钱统计。

召唤兽从 pet 表取「可见场景(hidden=0)」下的全部（含变异），init_pets.py 更新后重跑本脚本即可同步。

用法：python3 init_goods.py
"""
import os
import sqlite3

DB = os.environ.get("CBG_DB", "/opt/cbg-data/prices.db")

RINGS = [f"{lv}环·{s}" for lv in ("60", "70", "80") for s in ("武器", "装备")]
GEMS = ["黑宝石", "红玛瑙", "太阳石", "月亮石", "舍利子", "光芒石", "翡翠石", "神秘石", "星辉石"]
NURTURE = ["超级金柳露", "金柳露", "彩果", "易经丹", "如意丹", "清灵仙露"]
TASK = ["藏宝图", "高级藏宝图"]


def main():
    db = sqlite3.connect(DB)
    c = db.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS goods(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE, category TEXT, sort INTEGER DEFAULT 0)""")

    n = [0]

    def add(name, category):
        n[0] += 1
        c.execute("""INSERT INTO goods(name,category,sort) VALUES(?,?,?)
            ON CONFLICT(name) DO UPDATE SET category=excluded.category, sort=excluded.sort""",
                  (name, category, n[0]))

    # 召唤兽：可见场景下的全部（含变异），按 等级降序 + 基础/变异相邻
    for (name,) in c.execute(
        """SELECT DISTINCT p.name FROM pet p
           JOIN scene_pet sp ON sp.pet_id = p.id
           JOIN scene s ON s.id = sp.scene_id
           WHERE s.hidden = 0
           ORDER BY p.carry_lv DESC, LTRIM(p.name,'变异'), LENGTH(p.name)""").fetchall():
        add(name, "召唤兽")
    # 环装 + 告密
    for r in RINGS:
        add(r, "环装")
    add("告密", "其他")
    # 常用交易物品
    for g in GEMS:
        add(g, "宝石类")
    for g in NURTURE:
        add(g, "养成类")
    for g in TASK:
        add(g, "任务类")

    db.commit()
    for cat, cnt in c.execute("SELECT category, COUNT(*) FROM goods GROUP BY category ORDER BY 2 DESC"):
        print(f"{cat}: {cnt}")
    print("合计:", c.execute("SELECT COUNT(*) FROM goods").fetchone()[0])
    db.close()


if __name__ == "__main__":
    main()
