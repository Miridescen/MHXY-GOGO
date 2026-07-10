#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抓宝宝：场景(scene) + 宝宝(pet) + 关联(scene_pet) 建表并灌数据。

设计：场景、宝宝各自独立成表（以后其它功能复用），中间表 scene_pet 做多对多。
数据源：同目录 scene_pets_data.json（网易官方 xyq_summon_info，已排除「超级」开头）。

用法：python3 init_pets.py   （幂等，可重复跑；更新数据后重跑即可）
"""
import os
import json
import sqlite3

DB = os.environ.get("CBG_DB", "/opt/cbg-data/prices.db")
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scene_pets_data.json")

# 下拉里只显示这些场景（其余软隐藏，数据/关联仍保留）。留空表示全部显示。
VISIBLE_SCENES = ["伊阙龙门", "凌云渡", "小雷音寺", "无名鬼城", "银华境", "青丘", "须弥东界", "鬼市"]


def ensure_tables(c):
    c.execute("""CREATE TABLE IF NOT EXISTS scene(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, hidden INTEGER DEFAULT 0)""")
    if "hidden" not in [r[1] for r in c.execute("PRAGMA table_info(scene)")]:
        c.execute("ALTER TABLE scene ADD COLUMN hidden INTEGER DEFAULT 0")
    c.execute("""CREATE TABLE IF NOT EXISTS pet(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE,
        carry_lv INTEGER DEFAULT 0, data TEXT)""")   # data: 携带等级/资质/成长/描述 等原始信息(JSON)
    c.execute("""CREATE TABLE IF NOT EXISTS scene_pet(
        scene_id INTEGER, pet_id INTEGER, UNIQUE(scene_id, pet_id))""")


def main():
    d = json.load(open(DATA, encoding="utf-8"))
    db = sqlite3.connect(DB)
    c = db.cursor()
    ensure_tables(c)

    # 宝宝表（带元数据；重跑时更新）
    for name, meta in d["pets"].items():
        c.execute("""INSERT INTO pet(name,carry_lv,data) VALUES(?,?,?)
            ON CONFLICT(name) DO UPDATE SET carry_lv=excluded.carry_lv, data=excluded.data""",
                  (name, int(meta.get("carry_lv", 0) or 0), json.dumps(meta, ensure_ascii=False)))

    # 场景表 + 关联表
    for scene, plist in d["scenes"].items():
        c.execute("INSERT OR IGNORE INTO scene(name) VALUES(?)", (scene,))
        sid = c.execute("SELECT id FROM scene WHERE name=?", (scene,)).fetchone()[0]
        for pn in plist:
            row = c.execute("SELECT id FROM pet WHERE name=?", (pn,)).fetchone()
            if not row:   # 兜底：场景里出现但 pets 里没有的，也补进 pet 表
                c.execute("INSERT OR IGNORE INTO pet(name) VALUES(?)", (pn,))
                row = c.execute("SELECT id FROM pet WHERE name=?", (pn,)).fetchone()
            c.execute("INSERT OR IGNORE INTO scene_pet(scene_id,pet_id) VALUES(?,?)", (sid, row[0]))

    # 变异召唤兽：每个基础召唤兽派生「变异X」，等级相同、继承全部场景关联（幂等，重跑不会生成变异变异X）
    bases = c.execute("SELECT id, name, carry_lv, data FROM pet WHERE name NOT LIKE '变异%'").fetchall()
    for bid, bname, blv, bdata in bases:
        mname = "变异" + bname
        c.execute("""INSERT INTO pet(name,carry_lv,data) VALUES(?,?,?)
            ON CONFLICT(name) DO UPDATE SET carry_lv=excluded.carry_lv""",
                  (mname, blv, json.dumps({"mutant_of": bname}, ensure_ascii=False)))
        mid = c.execute("SELECT id FROM pet WHERE name=?", (mname,)).fetchone()[0]
        c.execute("""INSERT OR IGNORE INTO scene_pet(scene_id, pet_id)
                     SELECT scene_id, ? FROM scene_pet WHERE pet_id=?""", (mid, bid))

    # 应用可见性：VISIBLE_SCENES 内的显示，其余隐藏
    if VISIBLE_SCENES:
        c.execute("UPDATE scene SET hidden = 1")
        c.executemany("UPDATE scene SET hidden = 0 WHERE name = ?", [(n,) for n in VISIBLE_SCENES])

    db.commit()
    print("scene:", c.execute("SELECT COUNT(*) FROM scene").fetchone()[0],
          "| 显示:", c.execute("SELECT COUNT(*) FROM scene WHERE hidden=0").fetchone()[0])
    print("pet:", c.execute("SELECT COUNT(*) FROM pet").fetchone()[0])
    print("scene_pet:", c.execute("SELECT COUNT(*) FROM scene_pet").fetchone()[0])
    db.close()


if __name__ == "__main__":
    main()
