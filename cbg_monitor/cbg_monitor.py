#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
梦幻西游藏宝阁 多账号价格监控引擎（骨架）
==========================================

目标：100+ 物品 × 各服务器，每天爬 2 次最低价，10 个账号分摊负载。

已验证的核心事实（对真实接口实测）：
  接口          GET https://xyq.cbg.163.com/cgi-bin/recommend.py
  跨服(贵价)    act=recommd_by_role & search_type=overall_search_pet & view_loc=overall_search
                → 一次分页扫描覆盖全服，升序首次出现=该服最低价；但有 300 元地板价
  本服(便宜)    act=recommd_by_role & search_type=pet & serverid=X & view_loc=equip_list
                → 单服真实最低价（含 <300）
  公共参数      type=<类型ID,逗号分隔> & order_by=price ASC & page & count=15 & evol_skill_mode=0
  返回          status==1 正常；status==3/CAPTCHA_AUTH 验证码；SESSION_TIMEOUT 登录过期
  item.price    单位是“分”，÷100 得元

设计要点：
  - 账号池：每个账号一个 worker 线程，账号内部严格单线程慢速（这是不触发验证码的关键）。
  - 任务队列：贵价物品=1个“跨服扫描”任务；便宜物品=按服务器分片成多个“本服”任务，分摊到不同账号并行。
  - 遇验证码：该账号暂停 + 告警，当前任务重新入队由别的账号接管。验证码需人工解（不做绕过）。
  - 存储：SQLite，price_history 记录每次采样，便于看历史曲线。
  - 断点续爬：任务级重试 + 已完成结果落库，崩溃重启不重复已成功项。

依赖：pip install requests
配置：复制 config.example.json 为 config.json 并填入账号 cookie / 物品清单
运行：python3 cbg_monitor.py run        # 立即跑一轮
      python3 cbg_monitor.py serve      # 常驻，按 settings.run_at 每天定时跑
      python3 cbg_monitor.py servers    # 刷新服务器列表缓存
"""

import os
import re
import sys
import json
import time
import queue
import sqlite3
import threading
import datetime as dt
from dataclasses import dataclass, field

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
BASE_URL = "https://xyq.cbg.163.com/cgi-bin/recommend.py"
HOME_URL = "https://xyq.cbg.163.com/"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")


# ============================================================
# 配置
# ============================================================
def load_config(path=None):
    path = path or os.path.join(HERE, "config.json")
    if not os.path.exists(path):
        sys.exit(f"找不到配置文件 {path}，请复制 config.example.json 为 config.json 并填写。")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ============================================================
# 服务器列表（从首页 JS 的 server_data 解析，免登录）
# ============================================================
def fetch_server_list():
    """返回 [{'serverid':int,'server_name':str,'area_name':str}, ...]（已按 serverid 去重）"""
    html = requests.get(HOME_URL, headers={"User-Agent": UA}, timeout=20).text
    m = re.search(r"server_data\s*=\s*(\{.*?\})\s*;", html, re.S)
    if not m:
        raise RuntimeError("首页未找到 server_data，接口结构可能变了。")
    raw = _extract_balanced(html, m.start(1))
    sd = json.loads(raw)
    seen, out = set(), []
    for aid, area in sd.items():
        area_name = area[0][0]
        for s in area[1]:
            sid = s[0]
            if sid in seen:
                continue
            seen.add(sid)
            out.append({"serverid": sid, "server_name": s[1], "area_name": area_name})
    return out


def _extract_balanced(text, start):
    """从 start 处的 '{' 起做花括号配对，返回完整 JSON 子串。"""
    depth, i = 0, start
    while i < len(text):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
        i += 1
    raise RuntimeError("server_data 花括号未配平。")


def get_servers(cache_hours=24):
    """带本地缓存（servers.json）。"""
    cache = os.path.join(HERE, "servers.json")
    if os.path.exists(cache):
        age = time.time() - os.path.getmtime(cache)
        if age < cache_hours * 3600:
            with open(cache, encoding="utf-8") as f:
                return json.load(f)
    servers = fetch_server_list()
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(servers, f, ensure_ascii=False)
    return servers


# ============================================================
# 异常类型
# ============================================================
class CaptchaError(Exception):
    """触发验证码：账号需暂停 + 人工解。"""


class SessionExpired(Exception):
    """cookie 失效：账号需重新登录。"""


# ============================================================
# 单账号客户端
# ============================================================
class Account:
    def __init__(self, name, cookie):
        self.name = name
        self.sess = requests.Session()
        self.sess.headers.update({
            "User-Agent": UA,
            "Referer": "https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_pet",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Cookie": cookie,
        })
        self.paused_until = 0.0      # 验证码后冷却到此时间戳
        self.dead = False            # cookie 失效，需人工重登
        self.req_count = 0

    def available(self):
        return (not self.dead) and time.time() >= self.paused_until

    def _get(self, params):
        r = self.sess.get(BASE_URL, params=params, timeout=20)
        r.raise_for_status()
        self.req_count += 1
        d = r.json()
        st, code = d.get("status"), d.get("status_code", "")
        if st == 1:
            return d
        if st == 3 or "CAPTCHA" in code:
            raise CaptchaError(d.get("msg", "验证码"))
        if "SESSION" in code:
            raise SessionExpired(d.get("msg", "登录过期"))
        # 其它非致命错误：抛普通异常，交由任务级重试
        raise RuntimeError(f"接口异常 status={st} code={code} msg={d.get('msg')}")

    # —— 跨服：一次扫描得到每服最低价（贵价物品，≥300） ——
    def overall_min_per_server(self, type_ids, page_cap=100, delay=1.2, jitter=0.4):
        result = {}            # serverid -> row
        page = 1
        while page <= page_cap:
            d = self._get({
                "act": "recommd_by_role", "search_type": "overall_search_pet",
                "view_loc": "overall_search", "type": type_ids, "evol_skill_mode": 0,
                "page": page, "count": 15, "order_by": "price ASC",
            })
            for it in d.get("equip_list", []):
                sid = it["serverid"]
                if sid not in result:            # 升序，首次=最低
                    result[sid] = _row(it)
            if d.get("is_last_page") or page >= d.get("total_pages", page):
                break
            page += 1
            _sleep(delay, jitter, page)
        return result

    # —— 本服：单服最低价（便宜物品，含 <300） ——
    def per_server_min(self, type_ids, serverid):
        d = self._get({
            "act": "recommd_by_role", "search_type": "pet", "serverid": serverid,
            "view_loc": "equip_list", "type": type_ids, "evol_skill_mode": 0,
            "page": 1, "count": 15, "order_by": "price ASC",
        })
        it = (d.get("equip_list") or [None])[0]
        return _row(it) if it else None


def _row(it):
    return {
        "serverid": it["serverid"], "server_name": it.get("server_name", ""),
        "area_name": it.get("area_name", ""), "price_yuan": round(it["price"] / 100.0, 2),
        "equip_level": it.get("equip_level"), "summary": it.get("desc_sumup", ""),
        "seller": it.get("seller_nickname", ""), "eid": it.get("eid", ""),
        "link": f"https://xyq.cbg.163.com/equip?s={it['serverid']}&eid={it.get('eid','')}",
    }


def _sleep(delay, jitter, salt):
    time.sleep(delay + ((salt * 97) % int(max(1, jitter * 1000))) / 1000.0)


# ============================================================
# 存储
# ============================================================
class Store:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("""CREATE TABLE IF NOT EXISTS price_history(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item TEXT, serverid INTEGER, server_name TEXT, area_name TEXT,
            price_yuan REAL, summary TEXT, seller TEXT, eid TEXT, link TEXT,
            run_id TEXT, crawled_at TEXT)""")
        self.db.execute("CREATE INDEX IF NOT EXISTS idx_item_srv ON price_history(item, serverid, crawled_at)")
        self.db.commit()

    def save(self, item, run_id, rows):
        now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self.lock:
            self.db.executemany(
                """INSERT INTO price_history(item,serverid,server_name,area_name,price_yuan,
                   summary,seller,eid,link,run_id,crawled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                [(item, r["serverid"], r["server_name"], r["area_name"], r["price_yuan"],
                  r["summary"], r["seller"], r["eid"], r["link"], run_id, now) for r in rows])
            self.db.commit()


# ============================================================
# 任务与账号池
# ============================================================
@dataclass
class Task:
    item: str
    type_ids: str
    mode: str                 # 'overall' | 'per_server'
    servers: list = field(default_factory=list)   # per_server 模式下要查的服务器分片
    attempts: int = 0


class Engine:
    def __init__(self, cfg):
        self.cfg = cfg
        s = cfg["settings"]
        self.delay = s.get("per_request_delay", 1.2)
        self.jitter = s.get("jitter", 0.4)
        self.page_cap = s.get("overall_page_cap", 100)
        self.captcha_cooldown = s.get("captcha_cooldown_sec", 1800)
        self.max_attempts = s.get("max_task_attempts", 3)
        self.store = Store(os.path.join(HERE, s.get("db_path", "prices.db")))
        self.accounts = [Account(a["name"], a["cookie"]) for a in cfg["accounts"]]
        self.servers = get_servers()
        self.q = queue.Queue()
        self.results = {}          # item -> {serverid: row}（合并 per_server 分片）
        self.results_lock = threading.Lock()

    def build_tasks(self):
        chunk = self.cfg["settings"].get("per_server_chunk", 40)
        sids = [s["serverid"] for s in self.servers]
        for it in self.cfg["items"]:
            mode = it.get("mode", "overall")
            if mode == "overall":
                self.q.put(Task(it["name"], it["type_ids"], "overall"))
            else:  # per_server：按服分片，分摊到多账号
                for i in range(0, len(sids), chunk):
                    self.q.put(Task(it["name"], it["type_ids"], "per_server", servers=sids[i:i + chunk]))

    def _merge(self, item, rows):
        with self.results_lock:
            d = self.results.setdefault(item, {})
            for r in rows:
                cur = d.get(r["serverid"])
                if cur is None or r["price_yuan"] < cur["price_yuan"]:
                    d[r["serverid"]] = r

    def _run_task(self, acc, task):
        if task.mode == "overall":
            res = acc.overall_min_per_server(task.type_ids, self.page_cap, self.delay, self.jitter)
            self._merge(task.item, list(res.values()))
        else:
            rows = []
            for sid in task.servers:
                row = acc.per_server_min(task.type_ids, sid)
                if row:
                    rows.append(row)
                _sleep(self.delay, self.jitter, sid)
            self._merge(task.item, rows)

    def _worker(self, acc):
        while True:
            try:
                task = self.q.get_nowait()
            except queue.Empty:
                return
            if not acc.available():
                self.q.put(task)            # 该账号歇着，任务还给队列
                time.sleep(1)
                return                       # 退出该 worker，剩余任务由别的账号消化
            try:
                self._run_task(acc, task)
                print(f"[{acc.name}] ✓ {task.item} ({task.mode}, {len(task.servers) or '全服'})")
            except CaptchaError:
                acc.paused_until = time.time() + self.captcha_cooldown
                task.attempts += 1
                self.q.put(task)
                print(f"[{acc.name}] ⚠ 验证码！冷却 {self.captcha_cooldown}s，任务退回。"
                      f"请人工到浏览器解一次验证码。")
            except SessionExpired:
                acc.dead = True
                self.q.put(task)
                print(f"[{acc.name}] ✗ cookie 失效，需重新登录并更新 config.json。任务退回。")
            except Exception as e:
                task.attempts += 1
                if task.attempts < self.max_attempts:
                    self.q.put(task)
                print(f"[{acc.name}] 重试 {task.item}: {e}")
            finally:
                self.q.task_done()

    def run_pass(self):
        run_id = dt.datetime.now().strftime("%Y%m%d-%H%M")
        print(f"=== 开始第 {run_id} 轮，{len(self.cfg['items'])} 物品 / "
              f"{len(self.servers)} 服 / {len(self.accounts)} 账号 ===")
        self.results.clear()
        self.build_tasks()
        # 每账号一个 worker 线程；worker 退出后若仍有任务，循环再起一批活账号
        while not self.q.empty():
            threads = []
            for acc in self.accounts:
                if acc.available():
                    t = threading.Thread(target=self._worker, args=(acc,), daemon=True)
                    t.start()
                    threads.append(t)
            if not threads:
                wake = min((a.paused_until for a in self.accounts if not a.dead), default=0)
                if wake == 0:
                    print("所有账号都失效，需重新登录。中止本轮。")
                    break
                nap = max(5, wake - time.time())
                print(f"全部账号冷却中，等待 {int(nap)}s …（期间可人工解验证码）")
                time.sleep(nap)
                continue
            for t in threads:
                t.join()
        # 落库
        total = 0
        for item, d in self.results.items():
            rows = sorted(d.values(), key=lambda r: r["price_yuan"])
            self.store.save(item, run_id, rows)
            total += len(rows)
            if rows:
                print(f"  {item}: {len(rows)} 服，最低 {rows[0]['price_yuan']} 元（{rows[0]['server_name']}）")
        reqs = sum(a.req_count for a in self.accounts)
        print(f"=== 完成：{total} 条已入库，本轮共 {reqs} 次请求 ===")


# ============================================================
# 入口
# ============================================================
def cmd_run():
    Engine(load_config()).run_pass()


def cmd_servers():
    servers = fetch_server_list()
    with open(os.path.join(HERE, "servers.json"), "w", encoding="utf-8") as f:
        json.dump(servers, f, ensure_ascii=False)
    print(f"已刷新服务器列表：{len(servers)} 个服务器 → servers.json")


def cmd_serve():
    cfg = load_config()
    run_at = cfg["settings"].get("run_at", ["09:00", "21:00"])   # 每天两次
    print(f"常驻模式：每天 {run_at} 各跑一轮。Ctrl-C 退出。")
    done_today = set()
    while True:
        now = dt.datetime.now().strftime("%H:%M")
        today = dt.date.today().isoformat()
        for t in run_at:
            key = (today, t)
            if now == t and key not in done_today:
                done_today.add(key)
                try:
                    Engine(cfg).run_pass()
                except Exception as e:
                    print("本轮异常：", e)
        # 跨天清理
        done_today = {k for k in done_today if k[0] == today}
        time.sleep(20)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    {"run": cmd_run, "serve": cmd_serve, "servers": cmd_servers}.get(cmd, cmd_run)()
