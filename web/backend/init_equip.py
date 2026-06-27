#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
装备价格：把「装备搜索」的查询灌进 role_query（grp=装备），复用同一套"查询注册表+结果历史"。
接口与角色一致走 recommend.py，仅 search_type=overall_search_equip + 装备参数。

四组（均按"每个等级分开"）：
  ①无级别   : 100~150 每级(100,110,120,130,140,150) × 27类型 × 3开服年限 = 486
  ②永不磨损 : 150~160 每级(150,160)               × 27类型 × 3年限      = 162
  ③特技     : 100~160 每级(100..160,7级) × 6衣帽鞋饰 × {晶清诀,罗汉金钟} × 3年限 = 252
  ④愤怒腰带 : 100~160 每级(7级) × 3年限 = 21
  合计 921

编码来自藏宝阁 CBG_GAME_CONFIG：
  类型 kindid / 特效 special_effect(无级别1 愤怒3 永不磨损5) / 特技 special_skill(晶清诀1015 罗汉金钟2010)
  开服年限 server_type(1年内1 / 1到3年2 / 3年以上3)

用法： python3 init_equip.py
"""
import sqlite3
import json

DB = "/opt/cbg-data/prices.db"

# 27 个武器/防具类型 (kindid, 名称)
WEAPON_ARMORS = [
    (10, "扇"), (6, "剑"), (14, "刀"), (5, "斧"), (15, "锤"), (4, "枪"),
    (13, "双环"), (7, "双剑"), (12, "鞭"), (9, "爪刺"), (11, "魔棒"), (8, "飘带"),
    (52, "宝珠"), (53, "弓"), (54, "法杖"),
    (18, "男衣"), (59, "女衣"), (17, "男头"), (58, "女头"), (20, "腰带"), (19, "鞋子"), (21, "饰品"),
    (72, "灯笼"), (73, "巨剑"), (74, "伞"), (83, "双斧"), (91, "棍"),
]
ARMOR6 = [(18, "男衣"), (59, "女衣"), (17, "男头"), (58, "女头"), (19, "鞋子"), (21, "饰品")]
SKILLS = [(1015, "晶清诀"), (2010, "罗汉金钟")]
AGES = [(1, "1年内"), (2, "1到3年"), (3, "3年以上")]   # server_type

L_100_150 = [100, 110, 120, 130, 140, 150]
L_150_160 = [150, 160]
L_100_160 = [100, 110, 120, 130, 140, 150, 160]

BASE = {"search_type": "overall_search_equip", "sum_attr_without_melt": 1}


def upsert(c, grp, name, conditions, api_params):
    c.execute("""INSERT INTO role_query(grp,name,conditions,api_params,enabled) VALUES(?,?,?,?,1)
        ON CONFLICT(name) DO UPDATE SET grp=excluded.grp, conditions=excluded.conditions, api_params=excluded.api_params""",
              (grp, name, json.dumps(conditions, ensure_ascii=False), json.dumps(api_params, ensure_ascii=False)))


def main():
    db = sqlite3.connect(DB)
    c = db.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS role_query(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE, conditions TEXT, api_params TEXT, enabled INTEGER DEFAULT 1, grp TEXT)""")

    def lvl_param(lv):
        return {"level_min": lv, "level_max": lv}

    # ① 无级别 100~150 各级 各类型
    for lv in L_100_150:
        for kid, kname in WEAPON_ARMORS:
            for sc, aname in AGES:
                upsert(c, "装备", f"无级别·{kname}·{lv}·{aname}",
                       {"组": "无级别", "类型": kname, "等级": lv, "开服年限": sc},
                       {**BASE, **lvl_param(lv), "kindid": kid, "special_effect": 1, "server_type": sc})
    # ② 永不磨损 150~160 各级 各类型
    for lv in L_150_160:
        for kid, kname in WEAPON_ARMORS:
            for sc, aname in AGES:
                upsert(c, "装备", f"永不磨损·{kname}·{lv}·{aname}",
                       {"组": "永不磨损", "类型": kname, "等级": lv, "开服年限": sc},
                       {**BASE, **lvl_param(lv), "kindid": kid, "special_effect": 5, "server_type": sc})
    # ③ 特技 100~160 各级 × 6衣帽鞋饰 × {晶清诀,罗汉金钟}
    for lv in L_100_160:
        for kid, kname in ARMOR6:
            for skid, skname in SKILLS:
                for sc, aname in AGES:
                    upsert(c, "装备", f"{skname}·{kname}·{lv}·{aname}",
                           {"组": "特技", "特技": skname, "类型": kname, "等级": lv, "开服年限": sc},
                           {**BASE, **lvl_param(lv), "kindid": kid, "special_skill": skid, "server_type": sc})
    # ④ 愤怒腰带 100~160 各级
    for lv in L_100_160:
        for sc, aname in AGES:
            upsert(c, "装备", f"愤怒腰带·{lv}·{aname}",
                   {"组": "愤怒腰带", "类型": "腰带", "等级": lv, "开服年限": sc},
                   {**BASE, **lvl_param(lv), "kindid": 20, "special_effect": 3, "server_type": sc})

    db.commit()
    total = c.execute("SELECT COUNT(*) FROM role_query WHERE grp='装备'").fetchone()[0]
    by = c.execute("SELECT json_extract(conditions,'$.组') g, COUNT(*) FROM role_query WHERE grp='装备' GROUP BY g").fetchall()
    print("装备组各子组:", dict(by))
    print("装备组合计:", total)
    print("role_query 总计:", c.execute("SELECT COUNT(*) FROM role_query").fetchone()[0])


if __name__ == "__main__":
    main()
