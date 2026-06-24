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
import sqlite3
import datetime as dt
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

DB = os.environ.get("CBG_DB", "/opt/cbg-data/prices.db")

app = FastAPI(title="狗脑发热 API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 召唤兽(宝宝)品类配色 —— 取自设计 Design Tokens；后续多品类可扩此表
CAT_STYLE = {
    "宝宝": {"bg": "#fbeee8", "fg": "#a8351f", "icon": "宝"},
    "装备": {"bg": "#f3eadb", "fg": "#9a7b3a", "icon": "武"},
    "灵饰": {"bg": "#e6f0ea", "fg": "#3a7a5a", "icon": "灵"},
    "内丹": {"bg": "#eae6f0", "fg": "#5a4a8a", "icon": "丹"},
    "锦衣": {"bg": "#f6e8ea", "fg": "#9a3a5a", "icon": "衣"},
    "材料": {"bg": "#f0ece2", "fg": "#8a7a4a", "icon": "材"},
}
DEFAULT_CAT = "宝宝"   # item 表暂无品类列，默认召唤兽


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

    items = []
    for it in db.execute("SELECT id, name FROM item ORDER BY id"):
        iid = it["id"]
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
        cs = CAT_STYLE[DEFAULT_CAT]
        items.append({
            "id": iid, "name": it["name"], "cat": DEFAULT_CAT, "icon": cs["icon"],
            "iconBg": cs["bg"], "iconFg": cs["fg"], "latestDate": latest,
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


@app.get("/api/items")
def items():
    db = conn()
    out = [{"id": r["id"], "name": r["name"], "type_ids": r["type_ids"]}
           for r in db.execute("SELECT id, name, type_ids FROM item ORDER BY id")]
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
