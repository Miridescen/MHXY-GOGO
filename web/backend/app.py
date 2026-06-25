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
    db.close()
    last = max((i["latestDate"] for i in items), default=None)
    return {"generated_at": last or "", "served_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "regions": regions_list, "items": items}


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
