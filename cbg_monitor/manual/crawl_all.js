/* ============================================================
 * 比价页数据一体化爬取 —— 角色/锦衣/坐骑 + 装备（不含召唤兽）
 *
 * 用法：
 *   1. Chrome 登录藏宝阁，打开任意藏宝阁页（如装备搜索页）：
 *      https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_equip
 *   2. F12 → Console，粘贴本文件全部内容，回车
 *   3. 第一次跑：🟣角色/锦衣/坐骑(~6分钟) → 🔵装备第一轮(~240条后被限流自停，正常)
 *      之后重贴：自动跳过角色，只🔵续爬装备
 *   4. 变红=限流/验证码 → 等 30~60 分钟，账号不忙时再粘一次本脚本续爬
 *   5. 变绿「✅ 全部完成」= 角色+装备今天都爬好了，网站已更新
 *
 * 机制：
 *   · 角色段一次跑完，用 localStorage(role_done_日期) 标记，当天重贴自动跳过
 *   · 装备段可续爬，跳过 =「服务器已入库(有货)」∪「本机已尝试(含无货, 按天存)」
 * 安全：单线程慢爬，每 80 条歇 10 秒，连续 6 次出错自动停（防风控连累账号）。
 * ============================================================ */
(function () {
  const BASE = 'https://dogfever.cn';
  const TOKEN = localStorage.getItem('__ingest_token') ||
    (function () { const t = (prompt('首次使用：请输入入库令牌（向管理员索取）') || '').trim();
      if (t) localStorage.setItem('__ingest_token', t); return t; })();
  const ROLE_QUERIES_URL = BASE + '/api/role_queries';
  const INGEST_ROLE_URL = BASE + '/api/ingest_role';
  // 角色价格：从「全服最低价」里剔除这些 serverid（45=时光·花样年华，价格异常，不计入）
  const EXCLUDE_ROLE_SERVERIDS = [45];
  // 装备段限速参数
  const DELAY_MIN = 1800, DELAY_RAND = 700;   // 每条 1.8~2.5 秒
  const REST_EVERY = 80, REST_MS = 10000;     // 每 80 条歇 10 秒
  const ERR_STREAK_STOP = 6;                  // 连续 6 次出错=疑似限流，自动停
  const FLUSH_EVERY = 100;                    // 每采够 100 条入库一次

  const today = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
  const ATT_KEY = 'eq_att_' + today;          // 装备当天"已尝试"集合（含无货）
  const ROLE_DONE_KEY = 'role_done_' + today;  // 角色段当天完成标记
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let bar = document.getElementById('__crawlBar');
  if (!bar) { bar = document.createElement('div'); bar.id = '__crawlBar'; document.body.appendChild(bar); }
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:14px 20px;font:bold 16px/1.5 sans-serif;color:#fff;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);background:#7b3fb0';
  bar.textContent = '⏳ 准备中…';

  (async () => {
    try {
      const allQ = await (await fetch(ROLE_QUERIES_URL)).json();
      const roleQs = allQ.filter(q => !(q.api_params && q.api_params.search_type === 'overall_search_equip'));
      const equipQs = allQ
        .filter(q => q.api_params && q.api_params.search_type === 'overall_search_equip')
        .filter(q => (q.conditions || {}).开服年限 !== 1);   // 去掉「1年内」档位，不爬取（省 1/3 装备配额）

      // ===== 第一段：角色 / 锦衣 / 坐骑（当天没跑过才跑）=====
      if (localStorage.getItem(ROLE_DONE_KEY) !== '1') {
        const rows = [];
        const total = roleQs.length;
        for (let i = 0; i < total; i++) {
          const q = roleQs[i];
          const p = new URLSearchParams({ act: 'recommd_by_role', search_type: 'overall_search_role', page: '1', count: '10', order_by: 'price ASC', view_loc: 'overall_search' });
          for (const k in q.api_params) p.set(k, q.api_params[k]);
          try {
            const d = await (await fetch('https://xyq.cbg.163.com/cgi-bin/recommend.py?' + p, { credentials: 'include' })).json();
            if (d.status === 3 || /CAPTCHA/.test(d.status_code || '')) {   // 验证码：停下提示，已采集的不入库
              bar.style.background = '#d93025';
              bar.textContent = '⚠️ 角色段遇验证码（已完成 ' + i + '/' + total + '）！请在藏宝阁手动搜一次解验证码，再重跑本脚本';
              return;
            }
            const it = (d.equip_list || []).find(e => !EXCLUDE_ROLE_SERVERIDS.includes(e.serverid));
            if (d.status === 1 && it) rows.push({ query_id: q.id, price_yuan: Math.round(it.price) / 100, serverid: it.serverid, server_name: it.server_name, area_name: it.area_name, eid: it.eid, link: 'https://xyq.cbg.163.com/equip?s=' + it.serverid + '&eid=' + it.eid });
          } catch (e) { /* 单条失败跳过 */ }
          bar.style.background = '#7b3fb0';   // 角色段用紫色
          bar.textContent = '⏳ 角色价格 ' + (i + 1) + '/' + total + ' ｜ 当前:' + (q.name || '') + ' ｜ 已采 ' + rows.length;
          await sleep(1000);
        }
        bar.textContent = '⏳ 角色价格入库中…（' + rows.length + ' 条）';
        const res = await fetch(INGEST_ROLE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body: JSON.stringify({ run_date: today, rows }) });
        const j = await res.json();
        if (!(res.ok && j.ok)) {
          bar.style.background = '#d8843a';
          bar.textContent = '⚠️ 角色入库失败：' + (j.detail || ('HTTP ' + res.status)) + '（稍后重跑本脚本）';
          return;
        }
        localStorage.setItem(ROLE_DONE_KEY, '1');
        bar.style.background = '#188038';
        bar.textContent = '✅ 角色/锦衣/坐骑完成 ' + j.inserted + ' 条，继续爬装备…';
        await sleep(1500);
      }

      // ===== 第二段：装备（可续爬）=====
      const eqState = { got: 0, withPrice: 0, ingested: 0, errStreak: 0, err: null, total: 0, doneBefore: 0 };
      window.__eq = eqState;

      const doneSet = new Set((await (await fetch(BASE + '/api/role_done?date=' + today)).json()).ids);
      const attempted = new Set(JSON.parse(localStorage.getItem(ATT_KEY) || '[]'));
      const skip = id => doneSet.has(id) || attempted.has(id);
      const saveAtt = () => localStorage.setItem(ATT_KEY, JSON.stringify([...attempted]));
      const targets = equipQs.filter(q => !skip(q.id));
      eqState.total = equipQs.length; eqState.doneBefore = equipQs.length - targets.length;

      if (!targets.length) {
        bar.style.background = '#188038';
        bar.textContent = '✅ 全部完成！角色 + 装备（' + equipQs.length + ' 条）今天都爬好了 ｜ 网站已更新';
        return;
      }

      let buf = [];
      async function flush() {
        if (!buf.length) return;
        const res = await fetch(INGEST_ROLE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body: JSON.stringify({ run_date: today, rows: buf }) });
        const j = await res.json(); eqState.ingested += (j.inserted || 0); buf = [];
      }
      const ageName = a => a === 1 ? '1年内' : a === 2 ? '1-3年' : '3年外';

      for (let i = 0; i < targets.length; i++) {
        const q = targets[i], c = q.conditions || {};
        const p = new URLSearchParams({ act: 'recommd_by_role', search_type: 'overall_search_equip', page: '1', count: '5', order_by: 'price ASC', view_loc: 'overall_search' });
        for (const k in q.api_params) p.set(k, q.api_params[k]);
        let d = null;
        try { d = await (await fetch('https://xyq.cbg.163.com/cgi-bin/recommend.py?' + p, { credentials: 'include' })).json(); } catch (e) { /* 网络抖动 */ }

        if (d && (d.status === 3 || /CAPTCHA/.test(d.status_code || ''))) {
          eqState.err = 'CAPTCHA'; await flush(); saveAtt(); bar.style.background = '#d93025';
          bar.textContent = '⚠️ 装备段遇验证码（本轮 ' + i + ' 条）！在藏宝阁手动搜一次解码，等会儿重粘脚本续爬'; break;
        } else if (d && /SESSION/.test(d.status_code || '')) {
          eqState.err = 'SESSION'; await flush(); saveAtt(); bar.style.background = '#d93025';
          bar.textContent = '⚠️ 登录过期！重新登录后重粘脚本续爬'; break;
        } else if (!d || d.status !== 1) {
          eqState.errStreak++;
          if (eqState.errStreak >= ERR_STREAK_STOP) { eqState.err = 'LIMIT'; await flush(); saveAtt(); bar.style.background = '#d93025';
            bar.textContent = '⚠️ 疑似限流已自动停（本轮采 ' + eqState.withPrice + ' 条）。等 30~60 分钟再重粘脚本续爬'; break; }
        } else {
          eqState.errStreak = 0; attempted.add(q.id);
          const it = (d.equip_list || [])[0];
          if (it) { eqState.withPrice++; buf.push({ query_id: q.id, price_yuan: Math.round(it.price) / 100, serverid: it.serverid, server_name: it.server_name, area_name: it.area_name, eid: it.eid, link: 'https://xyq.cbg.163.com/equip?s=' + it.serverid + '&eid=' + it.eid }); }
        }
        eqState.got++;
        bar.style.background = '#1a73e8';   // 装备段用蓝色
        bar.textContent = '⏳ 装备 本轮' + (i + 1) + '/' + targets.length + ' ｜ 累计' + (eqState.doneBefore + eqState.got) + '/' + eqState.total
          + ' ｜ ' + (c.组 || '') + '·' + (c.类型 || '') + '·' + (c.等级 || '') + '级·' + ageName(c.开服年限)
          + ' ｜ 入库' + eqState.ingested;
        if (buf.length >= FLUSH_EVERY) await flush();
        if (eqState.got % 20 === 0) saveAtt();
        await sleep(DELAY_MIN + Math.random() * DELAY_RAND);
        if (eqState.got % REST_EVERY === 0) await sleep(REST_MS);
      }
      await flush(); saveAtt();
      if (!eqState.err) {
        const rem = equipQs.filter(q => !skip(q.id)).length;
        if (rem <= 0) { bar.style.background = '#188038'; bar.textContent = '✅ 全部完成！角色 + 装备（' + eqState.total + ' 条）今天都爬好了 ｜ 网站已更新'; }
        else { bar.style.background = '#188038'; bar.textContent = '✅ 本轮装备完成，累计已处理 ' + (eqState.total - rem) + '/' + eqState.total + '，还剩 ' + rem + ' 条，等会儿再重粘续爬'; }
      }
    } catch (e) { bar.style.background = '#d8843a'; bar.textContent = '⚠️ 出错：' + String(e).slice(0, 60); }
  })();

  return '一体化爬取已启动：角色/锦衣/坐骑' + (localStorage.getItem(ROLE_DONE_KEY) === '1' ? '(今日已完成,跳过)' : '') + ' + 装备(可续爬)';
})();
