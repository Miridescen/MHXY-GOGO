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


def ensure_tables(c):
    c.execute("""CREATE TABLE IF NOT EXISTS scene(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)""")
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

    db.commit()
    print("scene:", c.execute("SELECT COUNT(*) FROM scene").fetchone()[0])
    print("pet:", c.execute("SELECT COUNT(*) FROM pet").fetchone()[0])
    print("scene_pet:", c.execute("SELECT COUNT(*) FROM scene_pet").fetchone()[0])
    db.close()


if __name__ == "__main__":
    main()
