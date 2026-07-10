#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
狗脑发热 · 藏宝阁全服比价 —— 后端 API (FastAPI)

读取 /opt/cbg-data/prices.db，对前端提供 JSON 接口。
本机运行在 127.0.0.1:5002，由 nginx 反代 /api/ 对外。

启动: uvicorn app:app --host 127.0.0.1 --port 5002
接口:
  GET /api/health              健康检查
  GET /api/overview            主视图全量数据(区服 + 物品 + 各服价格)
  GET /api/items               物品列表(轻量)
  GET /api/item/{id}/servers   某物品各服最新价(含区服名/链接)
"""
import os
import re
import json
import sqlite3
import datetime as dt

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB = os.environ.get("CBG_DB", "/opt/cbg-data/prices.db")
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")   # 导入接口令牌(systemd 环境变量注入)

app = FastAPI(title="狗脑发热 API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 品类(图标/配色)来自 category 维表；item.category_id 为空时按此兜底展示
FALLBACK_CAT = {"name": "宝宝", "icon": "宝", "color_bg": "#fbeee8", "color_fg": "#a8351f"}


def load_categories(db):
    """返回 {category_id: {name, icon, color_bg, color_fg}}"""
    return {r["id"]: dict(r) for r in db.execute(
        "SELECT id, name, icon, color_bg, color_fg FROM category")}


def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def trend(series):
    """按时间升序的价格序列 → (points, color)。供趋势 sparkline 用。"""
    if not series:
        return "0,11 60,11", "#b8a888"
    pts = series[-6:]
    if len(pts) == 1:
        pts = pts * 2
    lo, hi = min(pts), max(pts)
    span = (hi - lo) or 1
    n = len(pts)
    coords = []
    for i, p in enumerate(pts):
        x = round(i * (60 / (n - 1))) if n > 1 else 0
        y = round(18 - (p - lo) / span * 14)
        coords.append(f"{x},{y}")
    d = pts[-1] - pts[0]
    color = "#c1452e" if d < 0 else ("#d8843a" if d > 0 else "#b8a888")
    return " ".join(coords), color


def build_overview():
    db = conn()
    # regions
    regions = {}
    for r in db.execute("SELECT product, area_name, server_name, serverid FROM server_map ORDER BY product, area_name, server_name"):
        regions.setdefault((r["product"], r["area_name"]), []).append(
            {"name": r["server_name"], "serverid": r["serverid"]})
    regions_list = [{"daqu": area, "product": prod, "servers": servers}
                    for (prod, area), servers in regions.items()]

    sid_loc = {}
    for r in db.execute("SELECT serverid, area_name, server_name FROM server_map"):
        sid_loc.setdefault(r["serverid"], (r["area_name"], r["server_name"]))

    cats = load_categories(db)
    items = []
    for it in db.execute("SELECT id, name, category_id FROM item ORDER BY id"):
        iid = it["id"]
        meta = cats.get(it["category_id"]) or FALLBACK_CAT
        dates = [row[0] for row in db.execute(
            "SELECT DISTINCT run_time FROM price_history WHERE item_id=? ORDER BY run_time", (iid,))]
        if not dates:
            continue
        latest = dates[-1]
        prices = {}
        for row in db.execute("SELECT serverid, price_yuan, link FROM price_history WHERE item_id=? AND run_time=?",
                              (iid, latest)):
            prices[str(row["serverid"])] = {"price": row["price_yuan"], "link": row["link"]}
        if not prices:
            continue
        low_sid, low = min(prices.items(), key=lambda kv: kv[1]["price"])
        low_area, low_srv = sid_loc.get(int(low_sid), ("", ""))
        hist = []
        for d_ in dates:
            mn = db.execute("SELECT MIN(price_yuan) FROM price_history WHERE item_id=? AND run_time=?", (iid, d_)).fetchone()[0]
            if mn is not None:
                hist.append(mn)
        history_low = min(hist) if hist else low["price"]
        pts, tcolor = trend(hist)
        items.append({
            "id": iid, "name": it["name"], "cat": meta["name"], "icon": meta["icon"],
            "iconBg": meta["color_bg"], "iconFg": meta["color_fg"], "latestDate": latest,
            "prices": prices,
            "low": {"serverid": int(low_sid), "price": low["price"], "link": low["link"],
                    "daqu": low_area, "server": low_srv},
            "historyLow": history_low, "points": pts, "trendColor": tcolor,
        })
    roles = build_roles(db)
    role_clothes = build_role_clothes(db)
    role_mounts = build_role_mounts(db)
    equip = build_equip(db)
    db.close()
    last = max((i["latestDate"] for i in items), default=None)
    return {"generated_at": last or "", "served_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "regions": regions_list, "items": items, "roles": roles,
            "roleClothes": role_clothes, "roleMounts": role_mounts, "equip": equip}


ROLE_CATS = ["飞升", "渡劫", "175级", "化圣"]               # 展示顺序
ROLE_AGES = [{"code": 1, "name": "1年内"}, {"code": 2, "name": "1到3年"}, {"code": 3, "name": "3年以上"}]


CLOTHES_ORDER = ["青花瓷", "青花瓷.墨黑", "青花瓷.月白", "冰寒绡", "冰寒绡.月白", "冰寒绡.墨黑",
                 "落星织", "云龙梦", "云龙梦.月白", "云龙梦.墨黑", "浪淘纱", "浪淘纱·月白", "浪淘纱·墨黑",
                 "纤云纱", "纤云纱·月白", "纤云纱·墨黑", "潮汐帆板"]
MOUNTS_ORDER = ["天使猪猪", "九尾冰狐"]
CLOTHES_GENDERS = ["男", "女"]
CLOTHES_LEVELS = ["不限", "69", "109", "飞升", "渡劫", "175", "化圣"]

EQUIP_TYPE_ORDER = ["扇", "剑", "刀", "斧", "锤", "枪", "双环", "双剑", "鞭", "爪刺", "魔棒", "飘带",
                    "宝珠", "弓", "法杖", "男衣", "女衣", "男头", "女头", "腰带", "鞋子", "饰品",
                    "灯笼", "巨剑", "伞", "双斧", "棍"]
EQUIP_SKILLS = ["晶清诀", "罗汉金钟"]
# 装备四子组：(组key, 展示标题, 选择维度)
EQUIP_GROUP_DEFS = [
    ("无级别", "无级别 · 100~150级", ["类型"]),
    ("永不磨损", "永不磨损 · 150~160级", ["类型"]),
    ("特技", "附特技 · 晶清诀/罗汉金钟", ["特技", "类型"]),
    ("愤怒腰带", "愤怒腰带 · 100~160级", []),
]


def _latest_cell(db, query_id):
    row = db.execute("""SELECT run_time, price_yuan, serverid, server_name, area_name, link
        FROM role_price_history WHERE query_id=? ORDER BY run_time DESC LIMIT 1""", (query_id,)).fetchone()
    if not row:
        return None, None
    return row["run_time"], {"price": row["price_yuan"], "server": row["server_name"],
                             "daqu": row["area_name"], "link": row["link"]}


def build_roles(db):
    """境界组矩阵（类别 × 开服年限 → 全服最低价）。"""
    matrix, latest = {}, None
    for q in db.execute("SELECT id, conditions FROM role_query WHERE enabled=1 AND grp='境界'"):
        cond = json.loads(q["conditions"])
        rt, cell = _latest_cell(db, q["id"])
        if not cell:
            continue
        latest = max(latest or "", rt)
        matrix.setdefault(cond.get("类别"), {})[str(cond.get("开服年限"))] = cell
    return {"date": latest, "categories": ROLE_CATS, "ages": ROLE_AGES, "matrix": matrix}


def _carry_matrix(db, grp, cond_key, order):
    """角色携带物组通用：{物品: {性别: {等级: cell}}}。返回 (最新日期, 有数据的物品序, matrix)。"""
    matrix, latest = {}, None
    for q in db.execute("SELECT id, conditions FROM role_query WHERE enabled=1 AND grp=?", (grp,)):
        cond = json.loads(q["conditions"])
        rt, cell = _latest_cell(db, q["id"])
        if not cell:
            continue
        latest = max(latest or "", rt)
        matrix.setdefault(cond.get(cond_key), {}).setdefault(cond.get("性别"), {})[cond.get("等级")] = cell
    keys = [k for k in order if k in matrix]
    return latest, keys, matrix


def build_role_clothes(db):
    """限量锦衣组：{锦衣: {性别: {等级: cell}}}，前端按锦衣筛选看 性别×等级。"""
    latest, clothes, matrix = _carry_matrix(db, "锦衣", "锦衣", CLOTHES_ORDER)
    return {"date": latest, "clothes": clothes, "genders": CLOTHES_GENDERS,
            "levels": CLOTHES_LEVELS, "matrix": matrix}


def build_role_mounts(db):
    """限量坐骑组：{坐骑: {性别: {等级: cell}}}，结构同锦衣。"""
    latest, mounts, matrix = _carry_matrix(db, "坐骑", "坐骑", MOUNTS_ORDER)
    return {"date": latest, "mounts": mounts, "genders": CLOTHES_GENDERS,
            "levels": CLOTHES_LEVELS, "matrix": matrix}


def build_equip(db):
    """装备组：4 子组，统一返回扁平 cells，前端按「类型(/特技)」筛选后看 等级×开服年限 表。"""
    by_group, latest = {}, None
    for q in db.execute("SELECT id, conditions FROM role_query WHERE enabled=1 AND grp='装备'"):
        cond = json.loads(q["conditions"])
        rt, cell = _latest_cell(db, q["id"])
        if not cell:
            continue
        latest = max(latest or "", rt)
        by_group.setdefault(cond.get("组"), []).append((cond, cell))

    groups = []
    for key, label, sels in EQUIP_GROUP_DEFS:
        items = by_group.get(key, [])
        if not items:
            continue
        cells, levels = [], set()
        for cond, cell in items:
            if cond.get("开服年限") == 1:   # 1年内档位不再展示
                continue
            cells.append({"类型": cond.get("类型"), "特技": cond.get("特技"),
                          "等级": cond.get("等级"), "年限": cond.get("开服年限"),
                          "price": cell["price"], "server": cell["server"],
                          "daqu": cell["daqu"], "link": cell["link"]})
            levels.add(cond.get("等级"))
        sel_opts = []
        for s in sels:
            if s == "类型":
                opts = [t for t in EQUIP_TYPE_ORDER if any(c["类型"] == t for c in cells)]
            else:  # 特技
                opts = [t for t in EQUIP_SKILLS if any(c["特技"] == t for c in cells)]
            sel_opts.append({"name": s, "options": opts})
        groups.append({"key": key, "label": label, "sel": sel_opts,
                       "levels": sorted(levels), "cells": cells})
    return {"date": latest, "ages": [a for a in ROLE_AGES if a["code"] != 1], "groups": groups}


# 简单缓存：数据一天才变两次，缓存 60s，避免每次请求都全表扫
_cache = {"ts": 0.0, "data": None}


def _now():
    return dt.datetime.now().timestamp()


@app.get("/api/health")
def health():
    try:
        n = conn().execute("SELECT COUNT(*) FROM price_history").fetchone()[0]
        return {"ok": True, "price_rows": n}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/overview")
def overview():
    if _cache["data"] is None or _now() - _cache["ts"] > 60:
        _cache["data"] = build_overview()
        _cache["ts"] = _now()
    return _cache["data"]


@app.get("/api/categories")
def categories():
    db = conn()
    out = [dict(r) for r in db.execute(
        "SELECT id, name, icon, color_bg, color_fg FROM category ORDER BY id")]
    db.close()
    return out


@app.get("/api/items")
def items():
    db = conn()
    cats = load_categories(db)
    out = []
    for r in db.execute("SELECT id, name, category_id, type_ids FROM item ORDER BY id"):
        meta = cats.get(r["category_id"])
        out.append({"id": r["id"], "name": r["name"], "type_ids": r["type_ids"],
                    "category_id": r["category_id"], "category": meta["name"] if meta else None})
    db.close()
    return out


@app.get("/api/item/{item_id}/servers")
def item_servers(item_id: int):
    db = conn()
    dates = [row[0] for row in db.execute(
        "SELECT DISTINCT run_time FROM price_history WHERE item_id=? ORDER BY run_time", (item_id,))]
    if not dates:
        raise HTTPException(404, "无该物品数据")
    latest = dates[-1]
    rows = []
    for r in db.execute("""SELECT p.serverid, p.price_yuan, p.link FROM price_history p
                           WHERE p.item_id=? AND p.run_time=? ORDER BY p.price_yuan""", (item_id, latest)):
        loc = db.execute("SELECT area_name, server_name FROM server_map WHERE serverid=? LIMIT 1", (r["serverid"],)).fetchone()
        rows.append({"serverid": r["serverid"], "price": r["price_yuan"], "link": r["link"],
                     "daqu": loc["area_name"] if loc else "", "server": loc["server_name"] if loc else ""})
    db.close()
    return {"item_id": item_id, "date": latest, "servers": rows}


# ============ 令牌导入接口（爬虫爬完直接 POST 入库）============
class IngestRow(BaseModel):
    item: str
    serverid: int
    price_yuan: float
    link: str = ""
    eid: str = ""


class IngestBody(BaseModel):
    run_date: str               # YYYY-MM-DD
    rows: list[IngestRow]


def get_item_id(db, name):
    db.execute("INSERT OR IGNORE INTO item(name) VALUES(?)", (name,))
    return db.execute("SELECT id FROM item WHERE name=?", (name,)).fetchone()[0]


@app.post("/api/ingest")
def ingest(body: IngestBody, x_token: str = Header(default="")):
    if not INGEST_TOKEN or x_token != INGEST_TOKEN:
        raise HTTPException(401, "令牌无效")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", body.run_date):
        raise HTTPException(400, "run_date 格式应为 YYYY-MM-DD")
    if not body.rows:
        raise HTTPException(400, "rows 为空")
    db = conn()
    items = set()
    data = []
    for r in body.rows:
        name = r.item.strip()
        if not name:
            continue
        iid = get_item_id(db, name)
        items.add(name)
        data.append((iid, body.run_date, r.serverid, r.price_yuan, r.link, r.eid))
    db.executemany("""INSERT INTO price_history(item_id,run_time,serverid,price_yuan,link,eid)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(item_id,run_time,serverid)
        DO UPDATE SET price_yuan=excluded.price_yuan, link=excluded.link, eid=excluded.eid""", data)
    db.commit()
    total = db.execute("SELECT COUNT(*) FROM price_history").fetchone()[0]
    db.close()
    _cache["data"] = None   # 失效缓存，下次 overview 立即反映新数据
    return {"ok": True, "inserted": len(data), "items": sorted(items),
            "run_date": body.run_date, "total_rows": total}


# ============ 角色价格：查询清单 + 导入 ============
@app.get("/api/role_queries")
def role_queries():
    """爬虫拉取要爬的角色搜索清单（含藏宝阁接口参数）。"""
    db = conn()
    out = [{"id": r["id"], "name": r["name"],
            "conditions": json.loads(r["conditions"]), "api_params": json.loads(r["api_params"])}
           for r in db.execute("SELECT id,name,conditions,api_params FROM role_query WHERE enabled=1 ORDER BY id")]
    db.close()
    return out


@app.get("/api/role_done")
def role_done(date: str):
    """某采集日期已入库的 query_id 列表，供续爬脚本跳过已完成项。"""
    db = conn()
    ids = [r[0] for r in db.execute(
        "SELECT DISTINCT query_id FROM role_price_history WHERE run_time=?", (date,))]
    db.close()
    return {"date": date, "ids": ids}


class RoleRow(BaseModel):
    query_id: int
    price_yuan: float
    serverid: int = 0
    server_name: str = ""
    area_name: str = ""
    link: str = ""
    eid: str = ""


class RoleIngestBody(BaseModel):
    run_date: str
    rows: list[RoleRow]


@app.post("/api/ingest_role")
def ingest_role(body: RoleIngestBody, x_token: str = Header(default="")):
    if not INGEST_TOKEN or x_token != INGEST_TOKEN:
        raise HTTPException(401, "令牌无效")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", body.run_date):
        raise HTTPException(400, "run_date 格式应为 YYYY-MM-DD")
    db = conn()
    data = [(r.query_id, body.run_date, r.price_yuan, r.serverid, r.server_name, r.area_name, r.link, r.eid)
            for r in body.rows]
    db.executemany("""INSERT INTO role_price_history
        (query_id,run_time,price_yuan,serverid,server_name,area_name,link,eid) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(query_id,run_time) DO UPDATE SET
            price_yuan=excluded.price_yuan, serverid=excluded.serverid, server_name=excluded.server_name,
            area_name=excluded.area_name, link=excluded.link, eid=excluded.eid""", data)
    db.commit()
    db.close()
    _cache["data"] = None
    return {"ok": True, "inserted": len(data), "run_date": body.run_date}


# ============ 抓宝宝：大任务(catch_task) + 小任务/每次抓到(catch_log) ============
CATCH_CATEGORIES = ("宝宝", "环装", "告密")
RING_SUB_TYPES = ("武器", "装备")


class CatchLogBody(BaseModel):
    task_id: int
    category: str = "宝宝"      # 宝宝 | 环装 | 告密
    scene: str = ""            # 宝宝→所在场景; 环装/告密留空
    name: str = ""             # 宝宝→宝宝名; 环装→级别(60/70/80); 告密→空
    sub_type: str = ""         # 环装→武器/装备; 宝宝/告密留空
    coord: str = ""            # 可选，形如 "12,234"
    current_time: str = ""     # 抓到的时间（前端默认 now，可改）


def _server_now():
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_catch_tables(db):
    # 大任务：一次抓宝宝任务（开始→结束）
    db.execute("""CREATE TABLE IF NOT EXISTS catch_task(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time TEXT, end_time TEXT, created_at TEXT)""")
    # 小任务：任务期间每抓到一只（catch_time 而非 current_time，后者是 SQLite 保留字）
    # category=宝宝/环装/告密; scene=宝宝所在场景; name=宝宝名或环装级别; sub_type=环装的武器/装备
    db.execute("""CREATE TABLE IF NOT EXISTS catch_log(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER, category TEXT, scene TEXT, name TEXT, sub_type TEXT, coord TEXT,
        catch_time TEXT, created_at TEXT)""")
    # 迁移：老表补 scene 列
    if "scene" not in [r[1] for r in db.execute("PRAGMA table_info(catch_log)")]:
        db.execute("ALTER TABLE catch_log ADD COLUMN scene TEXT")


@app.post("/api/catch_task/start")
def catch_task_start():
    db = conn()
    _ensure_catch_tables(db)
    now = _server_now()
    cur = db.execute("INSERT INTO catch_task(start_time,end_time,created_at) VALUES(?,NULL,?)", (now, now))
    db.commit()
    tid = cur.lastrowid
    db.close()
    return {"ok": True, "id": tid, "start_time": now}


@app.post("/api/catch_task/{task_id}/end")
def catch_task_end(task_id: int):
    db = conn()
    _ensure_catch_tables(db)
    now = _server_now()
    db.execute("UPDATE catch_task SET end_time=? WHERE id=? AND end_time IS NULL", (now, task_id))
    db.commit()
    db.close()
    return {"ok": True, "id": task_id, "end_time": now}


@app.post("/api/catch_log")
def catch_log_add(body: CatchLogBody):
    category = body.category.strip()
    name = body.name.strip()
    sub_type = body.sub_type.strip()
    if category not in CATCH_CATEGORIES:
        raise HTTPException(400, "类别应为 宝宝 / 环装 / 告密")
    if category == "环装":
        if not name:
            raise HTTPException(400, "请选择环装级别")
        if sub_type not in RING_SUB_TYPES:
            raise HTTPException(400, "环装需选择 武器 或 装备")
    elif category == "宝宝":
        if not name:
            raise HTTPException(400, "请选择宝宝类型")
        sub_type = ""
    else:   # 告密：只有坐标 + 时间
        name = ""
        sub_type = ""
    coord = body.coord.strip()
    if coord and not re.fullmatch(r"\d{1,4}\s*[,，]\s*\d{1,4}", coord):
        raise HTTPException(400, "坐标格式应为 12,234")
    db = conn()
    _ensure_catch_tables(db)
    t = db.execute("SELECT id, end_time FROM catch_task WHERE id=?", (body.task_id,)).fetchone()
    if not t:
        db.close()
        raise HTTPException(400, "任务不存在，请先点「开始」")
    if t["end_time"]:
        db.close()
        raise HTTPException(400, "任务已结束，请重新开始")
    scene = body.scene.strip() if category == "宝宝" else ""
    now = _server_now()
    cur = db.execute(
        "INSERT INTO catch_log(task_id,category,scene,name,sub_type,coord,catch_time,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (body.task_id, category, scene, name, sub_type, coord, body.current_time.strip(), now))
    db.commit()
    rid = cur.lastrowid
    db.close()
    return {"ok": True, "id": rid, "task_id": body.task_id}


@app.get("/api/catch_tasks")
def catch_tasks(limit: int = 50):
    """任务列表 + 每个任务抓到数量（供展示 / 后续统计）。end_time 为空即进行中。"""
    db = conn()
    _ensure_catch_tables(db)
    rows = [dict(r) for r in db.execute(
        """SELECT t.id, t.start_time, t.end_time, t.created_at, COUNT(l.id) AS catches
           FROM catch_task t LEFT JOIN catch_log l ON l.task_id = t.id
           GROUP BY t.id ORDER BY t.id DESC LIMIT ?""",
        (max(1, min(300, limit)),))]
    db.close()
    return {"rows": rows}


@app.get("/api/catch_logs")
def catch_logs(task_id: int = 0, limit: int = 100):
    db = conn()
    _ensure_catch_tables(db)
    if task_id:
        rows = db.execute(
            "SELECT id,task_id,category,scene,name,sub_type,coord,catch_time AS current_time,created_at "
            "FROM catch_log WHERE task_id=? ORDER BY id DESC LIMIT ?",
            (task_id, max(1, min(500, limit))))
    else:
        rows = db.execute(
            "SELECT id,task_id,category,scene,name,sub_type,coord,catch_time AS current_time,created_at "
            "FROM catch_log ORDER BY id DESC LIMIT ?",
            (max(1, min(500, limit)),))
    out = [dict(r) for r in rows]
    db.close()
    return {"rows": out}


# ============ 场景 / 宝宝 数据（scene + pet + scene_pet，供抓宝宝等功能复用）============
def _ensure_pet_tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS scene(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, hidden INTEGER DEFAULT 0)""")
    if "hidden" not in [r[1] for r in db.execute("PRAGMA table_info(scene)")]:
        db.execute("ALTER TABLE scene ADD COLUMN hidden INTEGER DEFAULT 0")
    db.execute("""CREATE TABLE IF NOT EXISTS pet(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE,
        carry_lv INTEGER DEFAULT 0, data TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS scene_pet(
        scene_id INTEGER, pet_id INTEGER, UNIQUE(scene_id, pet_id))""")


@app.get("/api/scenes")
def scenes_list():
    """场景列表 + 每个场景的宝宝数量。"""
    db = conn()
    _ensure_pet_tables(db)
    rows = [dict(r) for r in db.execute(
        """SELECT s.id, s.name, COUNT(sp.pet_id) AS pet_count
           FROM scene s LEFT JOIN scene_pet sp ON sp.scene_id = s.id
           WHERE s.hidden = 0
           GROUP BY s.id ORDER BY pet_count DESC, s.name""")]
    db.close()
    return {"rows": rows}


@app.get("/api/scene_pets")
def scene_pets_all():
    """所有场景及其宝宝（供前端「场景 → 宝宝」联动下拉一次取全）。"""
    db = conn()
    _ensure_pet_tables(db)
    scenes = {}
    for r in db.execute(
        """SELECT s.id AS sid, s.name AS sname, p.id AS pid, p.name AS pname, p.carry_lv
           FROM scene s JOIN scene_pet sp ON sp.scene_id = s.id
                        JOIN pet p ON p.id = sp.pet_id
           WHERE s.hidden = 0
           ORDER BY s.name, p.carry_lv, p.name"""):
        s = scenes.setdefault(r["sid"], {"id": r["sid"], "name": r["sname"], "pets": []})
        s["pets"].append({"id": r["pid"], "name": r["pname"], "carry_lv": r["carry_lv"]})
    db.close()
    return {"scenes": list(scenes.values())}


@app.get("/api/pets")
def pets_list(scene_id: int = 0):
    """宝宝列表；传 scene_id 则只返回该场景的宝宝。"""
    db = conn()
    _ensure_pet_tables(db)
    if scene_id:
        rows = db.execute(
            """SELECT p.id, p.name, p.carry_lv FROM pet p
               JOIN scene_pet sp ON sp.pet_id = p.id
               WHERE sp.scene_id = ? ORDER BY p.carry_lv, p.name""", (scene_id,))
    else:
        rows = db.execute("SELECT id, name, carry_lv FROM pet ORDER BY carry_lv, name")
    out = [dict(r) for r in rows]
    db.close()
    return {"rows": out}
