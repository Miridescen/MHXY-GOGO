# 狗脑发热 · 梦幻西游藏宝阁全服比价

爬取《梦幻西游》藏宝阁各区服物品价格，找出**全服最低价**，并通过网站展示。

**在线网站**：https://43-106-131-65.nip.io:8090/

## 工作流（一步自动）

```
浏览器爬取(住宅IP Chrome)                       服务器(阿里云)
  登录藏宝阁 → F12控制台贴 crawl_console.js
  → 单线程慢速爬各服最低价 → 自动 POST          ──HTTPS令牌──►  /api/ingest 入库
                                                                  ↓
                                              prices.db(SQLite) ──► FastAPI ──► 网站(React)
```

- 爬取在浏览器真·Chrome 里跑（绕过易盾 TLS 指纹），单线程慢速防封号，遇验证码自停。
- 爬完自动 POST 到服务器令牌接口入库，**无需下载/scp/命令**。
- 服务器只做存储 + 网站；爬取建议放住宅 IP 机器（机房 IP 易被风控）。

👉 **完整操作步骤见 [cbg_monitor/manual/操作手册.md](cbg_monitor/manual/操作手册.md)**

## 仓库结构

```
cbg_monitor/
  manual/
    crawl_console.js    浏览器控制台爬取脚本(粘贴即用,爬完自动入库)
    ingest_combined.py  服务器端CSV导入脚本(自动入库失败时的备用)
    操作手册.md         换电脑也能用的完整操作文档
  server_map.py         从网易CDN刷新「大区↔服务器↔serverid」映射表
web/
  backend/app.py        FastAPI: /api/overview /api/ingest 等(127.0.0.1:5002)
  frontend/             Vite + React + TS 前端(按设计稿"狗脑发热"还原)
```

## 服务器部署一览

| 组件 | 位置 |
|---|---|
| 数据库 | `/opt/cbg-data/prices.db`（SQLite） |
| 后端 | systemd `mhxy-api`（127.0.0.1:5002，含 INGEST_TOKEN） |
| 网站 | nginx HTTPS :8090 → `/var/www/mhxy/` + 反代 `/api`（Let's Encrypt + nip.io，自动续期） |
| 导入接口 | `POST /api/ingest`（X-Token 令牌校验） |

## 数据库表

4 张表：`category`(品类维表) / `item`(物品) / `price_history`(价格历史) / `server_map`(区服映射)。

👉 **字段/约束/关系/常用查询详见 [docs/数据库说明.md](docs/数据库说明.md)**

## 注意

- 网站用 HTTPS 域名访问（`https://43-106-131-65.nip.io:8090/`），别用 IP（证书不匹配）。
- 入库令牌不在仓库里，首次运行脚本时弹窗输入、存浏览器本地。
- 爬取务必单线程慢速，切勿并发/调小间隔（封号风险）。
