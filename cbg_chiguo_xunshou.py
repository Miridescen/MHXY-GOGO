#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
梦幻西游藏宝阁(CBG) —— 爬取各服务器「持国巡守」当前最低价

工作原理（已对真实接口实测验证）:
  藏宝阁的「全服(跨服)搜索」走 recommend.py 接口，返回 JSON。
  按价格升序(price ASC)拉取时，每个服务器第一次出现 = 该服当前最低价。
  逐页累计、按 serverid 去重，即得各服最低价。

⚠️ 必须登录:
  藏宝阁现在所有搜索接口都要登录态，否则返回「登陆过期 / SESSION_TIMEOUT」。
  所以运行前需要把你登录后的 Cookie 填到下面的 COOKIE 变量里。

获取 Cookie 的步骤:
  1. 浏览器登录 https://xyq.cbg.163.com （网易账号 + 选择角色「进入」，要走到能正常搜索的状态）
  2. F12 打开开发者工具 -> Network(网络) 面板
  3. 在藏宝阁页面随便做一次召唤兽搜索，找到一条 recommend.py 请求
  4. 点开它 -> Request Headers(请求标头) -> 复制整段 Cookie 的值
  5. 粘贴到下面的 COOKIE = "..." 里

依赖: pip install requests
运行: python3 cbg_chiguo_xunshou.py
"""

import os
import sys
import csv
import time
import json
import datetime
import requests

# ===================== 配置区 =====================

# 把这里换成你登录后从浏览器复制的整段 Cookie；
# 也可以不改这里，改成设置环境变量 CBG_COOKIE（优先级更高）。
COOKIE = os.environ.get("CBG_COOKIE", "在这里粘贴你的Cookie")

PET_NAME = "持国巡守"
PET_TYPE = "102242,102245"     # 持国巡守的召唤兽类型ID（含进阶/变异类型，实测从官网搜索抓取）

OUT_CSV = "chiguo_xunshou_lowest.csv"
OUT_JSON = "chiguo_xunshou_lowest.json"

PAGE_DELAY = 0.4               # 每页请求间隔(秒)，别调太小，避免给服务器压力/被风控
MAX_PAGES = 0                  # 0 = 一直抓到最后一页；调成正整数则只抓前 N 页
REQUEST_TIMEOUT = 20

BASE_URL = "https://xyq.cbg.163.com/cgi-bin/recommend.py"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/149.0.0.0 Safari/537.36"),
    "Referer": "https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_pet",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

# ===================== 逻辑区 =====================


def fetch_page(sess, page):
    """拉取第 page 页，返回解析后的 JSON dict。"""
    params = {
        "act": "recommd_by_role",
        "search_type": "overall_search_pet",
        "view_loc": "overall_search",
        "type": PET_TYPE,
        "evol_skill_mode": 0,
        "page": page,
        "count": 15,              # 接口固定每页 15 条，传别的会被忽略
        "order_by": "price ASC",  # 价格升序：首次出现的服务器即该服最低价
    }
    r = sess.get(BASE_URL, params=params, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if data.get("status") != 1:
        raise RuntimeError(
            f"接口返回异常: status={data.get('status')} "
            f"code={data.get('status_code')} msg={data.get('msg')}\n"
            f"  —— 多半是 Cookie 失效或未登录，请重新登录藏宝阁并复制新的 Cookie。"
        )
    return data


def main():
    if "粘贴" in COOKIE or not COOKIE.strip():
        sys.exit("❌ 请先在脚本顶部 COOKIE = \"...\" 里填入登录后的 Cookie（见文件头部说明）。")

    sess = requests.Session()
    sess.headers.update(HEADERS)
    sess.headers["Cookie"] = COOKIE

    lowest = {}   # serverid -> 该服最低价记录
    page = 1
    total_pages = None

    print(f"开始抓取「{PET_NAME}」各服最低价 …\n")
    while True:
        try:
            data = fetch_page(sess, page)
        except Exception as e:
            print(f"\n第 {page} 页抓取失败: {e}")
            if not lowest:
                sys.exit(1)
            print("已用已抓到的数据继续输出。")
            break

        items = data.get("equip_list", [])
        total_pages = data.get("total_pages", page)

        for it in items:
            sid = it.get("serverid")
            if sid in lowest:
                continue   # 升序，已记录的就是该服最低价，跳过
            lowest[sid] = {
                "area_name": it.get("area_name", ""),
                "server_name": it.get("server_name", ""),
                "serverid": sid,
                "price_yuan": round(it.get("price", 0) / 100.0, 2),  # price 单位是“分”
                "price_desc": it.get("price_desc", ""),
                "equip_level": it.get("equip_level", ""),
                "summary": it.get("desc_sumup", ""),
                "seller": it.get("seller_nickname", ""),
                "eid": it.get("eid", ""),
                "link": f"https://xyq.cbg.163.com/equip?s={sid}&eid={it.get('eid', '')}",
            }

        print(f"第 {page}/{total_pages} 页 | 本页 {len(items)} 条 | 已覆盖 {len(lowest)} 个服务器")

        if data.get("is_last_page") or page >= total_pages:
            break
        if MAX_PAGES and page >= MAX_PAGES:
            print(f"已达到 MAX_PAGES={MAX_PAGES}，停止。")
            break
        page += 1
        time.sleep(PAGE_DELAY)

    if total_pages == 100 and not MAX_PAGES:
        print("\n注意: 全服搜索接口最多返回 100 页(约最便宜的 1500 条)。"
              "\n      个别『全服所有挂单都很贵』的服务器可能不在范围内，但其最低价本就偏高，一般不影响参考。")

    rows = sorted(lowest.values(), key=lambda x: x["price_yuan"])

    # 写 CSV（utf-8-sig 让 Excel 正常显示中文）
    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["大区", "服务器", "serverid", "最低价(元)", "等级", "简介", "卖家", "商品链接", "eid"])
        for r in rows:
            w.writerow([r["area_name"], r["server_name"], r["serverid"],
                        f'{r["price_yuan"]:.2f}', r["equip_level"], r["summary"],
                        r["seller"], r["link"], r["eid"]])

    # 写 JSON（带抓取时间）
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({
            "pet": PET_NAME,
            "crawled_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "server_count": len(rows),
            "data": rows,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完成: 共 {len(rows)} 个服务器有在售「{PET_NAME}」")
    print(f"   已写入 {OUT_CSV} 和 {OUT_JSON}\n")

    print("最便宜的 15 个服务器:")
    print(f"{'大区':<8}{'服务器':<10}{'最低价(元)':>10}   简介")
    for r in rows[:15]:
        print(f"{r['area_name']:<8}{r['server_name']:<10}{r['price_yuan']:>10.2f}   {r['summary']}")


if __name__ == "__main__":
    main()
