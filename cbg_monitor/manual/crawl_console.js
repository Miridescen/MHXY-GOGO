/* ============================================================
 * 藏宝阁全服比价 —— 浏览器控制台爬取脚本（任何电脑可用，不依赖 Claude）
 *
 * 用法：
 *   1. Chrome 登录藏宝阁，打开「召唤兽搜索」页：
 *      https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_pet
 *   2. 按 F12 打开开发者工具 → Console(控制台)
 *   3. 把本文件【全部内容】粘贴进去，回车
 *   4. 顶部出现进度条，分两段自动跑完（全程约 40 分钟，期间别关页面）：
 *        · 蓝色 = 召唤兽（约 30~40 分钟）→ 自动入库
 *        · 紫色 = 角色/锦衣/坐骑价格（约 6 分钟，显示 当前/总数）→ 自动入库
 *        · 变绿 = 「✅ 全部完成」，网站已自动更新，无需再做任何事
 *   5. 若进度条变红：蓝/紫段遇验证码 → 在藏宝阁随便搜一次手动解码 → 重新粘贴脚本跑
 *   6. （仅自动入库失败时）才会出现「⬇ 下载CSV」按钮，按《操作手册》手动导库
 *
 * 加物品：改下面 ITEMS 数组。type_ids 查法见《操作手册·附录》。
 * 遇验证码：进度条变红 → 在藏宝阁随便搜一次手动解验证码 → 重新粘贴本脚本跑。
 * ============================================================ */
(function () {
  // ====== 配置：要爬的物品（名字 + 藏宝阁类型ID，正常版，逗号分隔）======
  const ITEMS = [
    ['持国巡守', '102242,102245'],
    ['广目巡守', '102337,102338'],
    ['多闻巡守', '102339,102340'],
    ['谛听',     '102399,102400'],
  ];
  const DELAY_MIN = 1300, DELAY_RAND = 1300;  // 每次请求间隔 1.3~2.6 秒（账号安全，勿调太小）
  const REST_EVERY = 100, REST_MS = 20000;    // 每 100 次歇 20 秒
  // 爬完自动入库接口（HTTPS）。令牌不写在代码里：首次运行弹窗输入，存本浏览器，之后免输。
  const BASE = 'https://dogfever.cn';
  const INGEST_URL = BASE + '/api/ingest';
  const ROLE_QUERIES_URL = BASE + '/api/role_queries';   // 角色搜索清单(数据驱动)
  const INGEST_ROLE_URL = BASE + '/api/ingest_role';
  // 角色价格：从「全服最低价」里剔除这些 serverid（取下一个最低的）。45=时光·花样年华（价格异常，不计入）
  const EXCLUDE_ROLE_SERVERIDS = [45];
  const INGEST_TOKEN = localStorage.getItem('__ingest_token') ||
    (function () { const t = (prompt('首次使用：请输入入库令牌（向管理员索取）') || '').trim();
      if (t) localStorage.setItem('__ingest_token', t); return t; })();
  // =====================================================================

  if (!window.server_data) { alert('请在藏宝阁「召唤兽搜索」页运行（缺 server_data）'); return; }
  const sids = [...new Set([].concat(...Object.values(window.server_data).map(a => a[1].map(s => s[0]))))];
  const today = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const A = { items: ITEMS, all: {}, ci: 0, i: 0, reqCount: 0, errCount: 0, running: true, captcha: false, err: null };
  ITEMS.forEach(([n]) => A.all[n] = {});
  window.__crawl = A;

  // 进度条
  if (window.__statusTimer) clearInterval(window.__statusTimer);
  const bar = document.getElementById('__statusBar') || document.createElement('div');
  bar.id = '__statusBar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:14px 20px;font:bold 17px/1.5 sans-serif;color:#fff;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  document.body.appendChild(bar);
  const TARGET = sids.length * ITEMS.length;

  function buildCSV() {
    const esc = v => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [['run_date', 'item', '大区', '服务器', 'serverid', '最低价(元)', '商品链接', 'eid'].join(',')];
    for (const item of Object.keys(A.all)) {
      const rows = Object.values(A.all[item]).sort((a, b) => a.price_yuan - b.price_yuan);
      for (const r of rows) {
        const link = 'https://xyq.cbg.163.com/equip?s=' + r.serverid + '&eid=' + r.eid;
        lines.push([today, item, r.area_name, r.server_name, r.serverid, r.price_yuan.toFixed(2), link, r.eid].map(esc).join(','));
      }
    }
    return '﻿' + lines.join('\r\n');
  }
  function totalCount() { let n = 0; Object.values(A.all).forEach(o => n += Object.keys(o).length); return n; }
  function buildRows() {
    const out = [];
    for (const item of Object.keys(A.all))
      for (const r of Object.values(A.all[item]))
        out.push({ item, serverid: r.serverid, price_yuan: r.price_yuan,
          link: 'https://xyq.cbg.163.com/equip?s=' + r.serverid + '&eid=' + r.eid, eid: r.eid });
    return out;
  }
  function showDownload(prefix) {
    bar.style.background = '#188038'; bar.style.cursor = 'pointer';
    bar.textContent = (prefix || '') + '⬇ 点此下载CSV (xunshou_' + today.replace(/-/g, '') + '.csv)';
    bar.onclick = () => {
      const blob = new Blob([buildCSV()], { type: 'text/csv;charset=utf-8' });
      const u = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = u; a.download = 'xunshou_' + today.replace(/-/g, '') + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 1500);
    };
  }
  // 角色价格：跨服搜 role_query 里的每个组合，取全服最低价 → 入库（数据驱动，新增query自动爬）
  // 返回：>=0 入库条数；-1 接口/网络失败；-2 遇验证码（进度条已变红提示，调用方应直接 return）
  async function crawlRoles() {
    try {
      // 只爬角色组（境界/锦衣/坐骑）；装备组(search_type=overall_search_equip)单独用 crawl_equip.js 慢爬，避免限流连累
      const queries = (await (await fetch(ROLE_QUERIES_URL)).json())
        .filter(q => !(q.api_params && q.api_params.search_type === 'overall_search_equip'));
      const rows = [];
      const total = queries.length;
      for (let i = 0; i < total; i++) {
        const q = queries[i];
        const p = new URLSearchParams({ act: 'recommd_by_role', search_type: 'overall_search_role', page: '1', count: '10', order_by: 'price ASC', view_loc: 'overall_search' });
        for (const k in q.api_params) p.set(k, q.api_params[k]);
        try {
          const d = await (await fetch('https://xyq.cbg.163.com/cgi-bin/recommend.py?' + p, { credentials: 'include' })).json();
          if (d.status === 3 || /CAPTCHA/.test(d.status_code || '')) {   // 验证码：停下提示，已采集的不入库
            bar.style.background = '#d93025'; bar.style.cursor = 'default'; bar.onclick = null;
            bar.textContent = '⚠️ 角色爬取遇验证码（已完成 ' + i + '/' + total + '）！请在藏宝阁手动搜一次解验证码，再重跑脚本';
            return -2;
          }
          const it = (d.equip_list || []).find(e => !EXCLUDE_ROLE_SERVERIDS.includes(e.serverid));
          if (d.status === 1 && it) rows.push({ query_id: q.id, price_yuan: Math.round(it.price) / 100, serverid: it.serverid, server_name: it.server_name, area_name: it.area_name, eid: it.eid, link: 'https://xyq.cbg.163.com/equip?s=' + it.serverid + '&eid=' + it.eid });
        } catch (e) { /* 单条失败跳过 */ }
        bar.style.background = '#7b3fb0';   // 角色段用紫色，和召唤兽段(蓝)区分
        bar.textContent = '⏳ 角色价格 ' + (i + 1) + '/' + total + ' ｜ 当前:' + (q.name || '') + ' ｜ 已采 ' + rows.length;
        await new Promise(r => setTimeout(r, 1000));
      }
      bar.textContent = '⏳ 角色价格入库中…（' + rows.length + ' 条）';
      const res = await fetch(INGEST_ROLE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': INGEST_TOKEN }, body: JSON.stringify({ run_date: today, rows }) });
      const j = await res.json();
      return j.ok ? j.inserted : -1;
    } catch (e) { return -1; }
  }
  async function autoIngest() {
    bar.style.background = '#1a73e8'; bar.style.cursor = 'default'; bar.onclick = null;
    bar.textContent = '⏳ 自动入库中…（' + totalCount() + ' 条）';
    try {
      const r = await fetch(INGEST_URL, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Token': INGEST_TOKEN },
        body: JSON.stringify({ run_date: today, rows: buildRows() }) });
      const j = await r.json();
      if (r.ok && j.ok) {
        bar.textContent = '✅ 召唤兽入库 ' + j.inserted + ' 条，继续爬角色价格…';
        const rn = await crawlRoles();
        if (rn === -2) return;   // 验证码：进度条已是红色提示，保持不动
        bar.style.background = '#188038';
        bar.textContent = '✅ 全部完成！召唤兽 ' + j.inserted + ' + 角色 ' + (rn >= 0 ? rn : '失败') + ' 条（' + today + '）｜网站已更新';
      } else { throw new Error(j.detail || ('HTTP ' + r.status)); }
    } catch (e) {
      bar.style.background = '#d8843a';
      showDownload('⚠️ 自动入库失败(' + e.message + ')，改为手动：');
    }
  }

  window.__statusTimer = setInterval(() => {
    const c = n => Object.keys(A.all[n] || {}).length;
    const line = ITEMS.map(([n]) => n.slice(0, 2) + ' ' + c(n)).join(' | ');
    if (A.captcha) { bar.style.background = '#d93025'; bar.textContent = '⚠️ 验证码！请手动解后重新运行脚本 [' + line + ']'; clearInterval(window.__statusTimer); }
    else if (A.err) { bar.style.background = '#d93025'; bar.textContent = '⚠️ 登录过期，请重新登录后再运行 [' + line + ']'; clearInterval(window.__statusTimer); }
    else if (!A.running) { clearInterval(window.__statusTimer); autoIngest(); }
    else { bar.style.background = '#1a73e8'; bar.textContent = '⏳ 爬取中 ' + A.reqCount + '/' + TARGET + ' ｜ 当前:' + (A.items[A.ci] ? A.items[A.ci][0] : '') + ' ｜ ' + line; }
  }, 1500);

  (async () => {
    for (A.ci = 0; A.ci < ITEMS.length && !A.captcha && !A.err; A.ci++) {
      const [item, tids] = ITEMS[A.ci];
      for (A.i = 0; A.i < sids.length; A.i++) {
        const sid = sids[A.i];
        const u = 'https://xyq.cbg.163.com/cgi-bin/recommend.py?act=recommd_by_role&search_type=pet&serverid=' + sid +
          '&type=' + tids + '&page=1&count=15&order_by=price%20ASC&view_loc=equip_list';
        let d; try { d = await (await fetch(u, { credentials: 'include' })).json(); }
        catch (e) { A.errCount++; await sleep(2000); A.i--; continue; }
        if (d.status === 1) { const it = (d.equip_list || [])[0];
          if (it) A.all[item][sid] = { serverid: sid, server_name: it.server_name, area_name: it.area_name, price_yuan: Math.round(it.price) / 100, eid: it.eid };
        } else if (d.status === 3 || /CAPTCHA/.test(d.status_code || '')) { A.captcha = true; break; }
        else if (/SESSION/.test(d.status_code || '')) { A.err = 'SESSION'; break; }
        else A.errCount++;
        A.reqCount++;
        await sleep(DELAY_MIN + Math.random() * DELAY_RAND);
        if (A.reqCount % REST_EVERY === 0) await sleep(REST_MS);
      }
    }
    A.running = false;
  })();

  return 'started: ' + ITEMS.length + ' 物品 × ' + sids.length + ' 服 = ' + TARGET + ' 次，日期 ' + today;
})();
