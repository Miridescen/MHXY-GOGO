/* ============================================================
 * 装备全服比价 —— 可续爬脚本（装备搜索接口敏感，单独慢爬、分多轮补齐）
 *
 * 用法：
 *   1. Chrome 登录藏宝阁，打开任意藏宝阁页（如装备搜索页）：
 *      https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_equip
 *   2. F12 → Console，粘贴本文件全部内容，回车
 *   3. 顶部蓝色进度条开始跑（本轮约爬 ~240 条就会被限流自动停，正常）
 *   4. 变红=被限流/验证码 → 等 30~60 分钟，账号不忙时再粘一次本脚本
 *      （脚本会自动跳过已爬到的，接着没爬的往下补，几轮后全部 921 条补满）
 *   5. 变绿「✅ 装备全部完成」= 921 条今天都爬好了
 *
 * 安全：单线程 ~2 秒/条，每 80 条歇 10 秒，连续 6 次出错自动停（防风控连累账号）。
 * ============================================================ */
(function () {
  const BASE = 'https://43-106-131-65.nip.io:8090';
  const ROLE_QUERIES_URL = BASE + '/api/role_queries';
  const ROLE_DONE_URL = BASE + '/api/role_done';
  const INGEST_ROLE_URL = BASE + '/api/ingest_role';
  const TOKEN = localStorage.getItem('__ingest_token') ||
    (function () { const t = (prompt('请输入入库令牌（向管理员索取）') || '').trim();
      if (t) localStorage.setItem('__ingest_token', t); return t; })();
  const DELAY_MIN = 1800, DELAY_RAND = 700;   // 每条 1.8~2.5 秒
  const REST_EVERY = 80, REST_MS = 10000;     // 每 80 条歇 10 秒
  const ERR_STREAK_STOP = 6;                  // 连续 6 次出错=疑似限流，自动停
  const FLUSH_EVERY = 100;                    // 每采够 100 条入库一次

  const today = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

  // 进度条
  let bar = document.getElementById('__eqBar');
  if (!bar) { bar = document.createElement('div'); bar.id = '__eqBar'; document.body.appendChild(bar); }
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:14px 20px;font:bold 16px/1.5 sans-serif;color:#fff;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);background:#1a73e8';
  bar.textContent = '⏳ 装备爬取准备中…';

  const A = { got: 0, withPrice: 0, ingested: 0, errStreak: 0, err: null, total: 0, doneBefore: 0 };
  window.__eq = A;

  (async () => {
    try {
      const allQs = await (await fetch(ROLE_QUERIES_URL)).json();
      const equipQs = allQs.filter(q => q.api_params && q.api_params.search_type === 'overall_search_equip');
      const doneSet = new Set((await (await fetch(ROLE_DONE_URL + '?date=' + today)).json()).ids);
      const targets = equipQs.filter(q => !doneSet.has(q.id));   // 跳过今天已爬到的
      A.total = equipQs.length;
      A.doneBefore = equipQs.length - targets.length;

      if (!targets.length) { bar.style.background = '#188038'; bar.textContent = '✅ 装备全部完成！今天 ' + equipQs.length + ' 条都爬好了'; return; }

      let buf = [];
      async function flush() {
        if (!buf.length) return;
        const res = await fetch(INGEST_ROLE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body: JSON.stringify({ run_date: today, rows: buf }) });
        const j = await res.json(); A.ingested += (j.inserted || 0); buf = [];
      }
      const ageName = a => a === 1 ? '1年内' : a === 2 ? '1-3年' : '3年外';

      for (let i = 0; i < targets.length; i++) {
        const q = targets[i], c = q.conditions || {};
        const p = new URLSearchParams({ act: 'recommd_by_role', search_type: 'overall_search_equip', page: '1', count: '5', order_by: 'price ASC', view_loc: 'overall_search' });
        for (const k in q.api_params) p.set(k, q.api_params[k]);
        let d = null;
        try { d = await (await fetch('https://xyq.cbg.163.com/cgi-bin/recommend.py?' + p, { credentials: 'include' })).json(); } catch (e) { /* 网络抖动 */ }

        if (d && (d.status === 3 || /CAPTCHA/.test(d.status_code || ''))) {
          A.err = 'CAPTCHA'; await flush(); bar.style.background = '#d93025';
          bar.textContent = '⚠️ 遇验证码（本轮 ' + i + ' 条）！在藏宝阁手动搜一次解码，等会儿重粘脚本续爬'; break;
        } else if (d && /SESSION/.test(d.status_code || '')) {
          A.err = 'SESSION'; await flush(); bar.style.background = '#d93025';
          bar.textContent = '⚠️ 登录过期！重新登录后重粘脚本续爬'; break;
        } else if (!d || d.status !== 1) {
          A.errStreak++;
          if (A.errStreak >= ERR_STREAK_STOP) { A.err = 'LIMIT'; await flush(); bar.style.background = '#d93025';
            bar.textContent = '⚠️ 疑似限流已自动停（本轮采 ' + A.withPrice + ' 条）。等 30~60 分钟再重粘脚本续爬'; break; }
        } else {
          A.errStreak = 0;
          const it = (d.equip_list || [])[0];
          if (it) { A.withPrice++; buf.push({ query_id: q.id, price_yuan: Math.round(it.price) / 100, serverid: it.serverid, server_name: it.server_name, area_name: it.area_name, eid: it.eid, link: 'https://xyq.cbg.163.com/equip?s=' + it.serverid + '&eid=' + it.eid }); }
        }
        A.got++;
        bar.style.background = '#1a73e8';
        bar.textContent = '⏳ 装备 本轮' + (i + 1) + '/' + targets.length + ' ｜ 累计' + (A.doneBefore + A.got) + '/' + A.total
          + ' ｜ ' + (c.组 || '') + '·' + (c.类型 || '') + '·' + (c.等级 || '') + '级·' + ageName(c.开服年限)
          + ' ｜ 入库' + A.ingested;
        if (buf.length >= FLUSH_EVERY) await flush();
        await new Promise(r => setTimeout(r, DELAY_MIN + Math.random() * DELAY_RAND));
        if (A.got % REST_EVERY === 0) await new Promise(r => setTimeout(r, REST_MS));
      }
      await flush();
      if (!A.err) {
        const left = A.total - A.doneBefore - A.got;
        if (left <= 0) { bar.style.background = '#188038'; bar.textContent = '✅ 装备全部完成！今天 ' + A.total + ' 条都爬好了'; }
        else { bar.style.background = '#188038'; bar.textContent = '✅ 本轮完成，累计 ' + (A.doneBefore + A.got) + '/' + A.total + '，还剩 ' + left + ' 条，等会儿再重粘续爬'; }
      }
    } catch (e) { bar.style.background = '#d8843a'; bar.textContent = '⚠️ 出错：' + String(e).slice(0, 60); }
  })();

  return '装备续爬已启动（本轮约 240 条后会被限流自动停，属正常，分多轮补齐）';
})();
