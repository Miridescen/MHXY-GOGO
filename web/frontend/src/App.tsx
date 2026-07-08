import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { fetchOverview, fmt, serveridOf, serverCell, addCatchLog, fetchCatchLogs, startCatchTask, endCatchTask, fetchCatchTasks, type Overview, type Item, type Region, type Roles, type RoleCell, type Equip, type EquipGroup, type CatchLog, type CatchTask } from './api'

const CBG = 'https://xyq.cbg.163.com/'
const SEL_KEY = '__mhxy_sel'   // localStorage: 记住用户选的区服/模式

const S: Record<string, CSSProperties> = {
  topbar: { position: 'sticky', top: 0, zIndex: 40, background: '#faf6eecc', backdropFilter: 'saturate(1.2) blur(8px)', borderBottom: '1px solid #ece2cf' },
  topInner: { maxWidth: 1140, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  logoBox: { width: 42, height: 42, borderRadius: 9, background: '#c1452e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 23, color: '#faf0e0', boxShadow: 'inset 0 0 0 2px rgba(255,240,220,.35),0 3px 10px rgba(193,69,46,.3)' },
  logoImg: { width: 44, height: 44, borderRadius: 10, objectFit: 'cover', boxShadow: '0 3px 10px rgba(120,70,160,.32)' },
  main: { maxWidth: 1140, margin: '0 auto', padding: '22px 20px 60px' },
  daquBtn: { display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', background: '#f5ecdd', border: '1px solid #e0d2b8', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#2a221a', cursor: 'pointer' },
  srvBtn: { display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', background: '#fbeee8', border: '1.5px solid #c1452e', borderRadius: 8, fontSize: 13.5, fontWeight: 700, color: '#a8351f', cursor: 'pointer' },
  panel: { position: 'absolute', top: 46, right: 0, width: 300, background: '#fdfaf3', border: '1px solid #e6dac4', borderRadius: 12, boxShadow: '0 16px 40px rgba(60,40,20,.2)', overflow: 'auto', zIndex: 60 },
  panelHd: { fontSize: 10, fontWeight: 700, color: '#b0a48c', padding: '11px 16px 6px', letterSpacing: 1, position: 'sticky', top: 0, background: '#fdfaf3' },
  search: { flex: 1, minWidth: 200, maxWidth: 340, height: 40, background: '#fdfaf3', border: '1px solid #e6dac4', borderRadius: 9, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 9 },
  heroCard: { background: '#2a221a', borderRadius: 16, padding: 24, color: '#faf0e0', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' },
  tableHd: { display: 'grid', gridTemplateColumns: '2.7fr 1.3fr 1.5fr 1fr 1fr', padding: '12px 22px', fontSize: 11, fontWeight: 700, color: '#b0a48c', letterSpacing: .5, borderBottom: '1px solid #ece2cf', background: '#f7efe2' },
  tableRow: { display: 'grid', gridTemplateColumns: '2.7fr 1.3fr 1.5fr 1fr 1fr', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f0e7d6' },
}
const segOn: CSSProperties = { padding: '7px 15px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#c1452e', color: '#fff' }
const segOff: CSSProperties = { padding: '7px 15px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#6a5a44' }
const badgeOn: CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#fff', background: '#c1452e', padding: '2px 7px', borderRadius: 10 }

type Mode = 'global' | 'server'

interface Row {
  it: Item
  price: string            // 主价格列：全服模式=全服最低价；本服模式=本服价格
  priceHint: string        // 本服模式主价格下小字（本服无在售 / ✓本服即全服最低）；全服模式空
  priceHintColor: string
  loc: string              // 全服模式：所在区服（大区·服务器）
  gLowPrice: string        // 本服模式：全服最低价
  gLowLoc: string          // 本服模式：全服最低的 大区·服务器
  badge: string; showBadge: boolean; cbg: string
}

function Trend({ points, color, w = 64 }: { points: string; color: string; w?: number }) {
  return <svg width={w} height={22} viewBox="0 0 64 22"><polyline points={points} fill="none" stroke={color} strokeWidth={2} /></svg>
}

// 角色+限量锦衣：选锦衣 → 看 性别×等级 全服最低价
// 角色携带物（锦衣/坐骑）通用：先选物品，再看 性别×等级 矩阵
function RoleCarryView({ title, items, rc }: {
  title: string
  items: string[]
  rc: { date: string | null; genders: string[]; levels: string[]; matrix: Record<string, Record<string, Record<string, RoleCell>>> }
}) {
  const [sel, setSel] = useState('')
  if (!rc || !rc.date || !items.length) return null
  const cur = sel && rc.matrix[sel] ? sel : items[0]
  const m = rc.matrix[cur] || {}
  const hd: CSSProperties = { padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#b0a48c', textAlign: 'left', borderBottom: '1px solid #ece2cf', background: '#f7efe2' }
  const cell: CSSProperties = { padding: '11px 14px', borderTop: '1px solid #f0e7d6', whiteSpace: 'nowrap' }
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="serif" style={{ fontSize: 16, fontWeight: 900, color: '#c1452e', borderLeft: '3px solid #c1452e', paddingLeft: 10, letterSpacing: 1, marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {items.map(c => (
          <button key={c} onClick={() => setSel(c)}
            style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 13px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', ...(c === cur ? { color: '#fff', background: '#c1452e' } : { color: '#6a5a44', background: '#f5ecdd' }) }}>{c}</button>
        ))}
      </div>
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr><th style={hd}>性别 \ 等级</th>{rc.levels.map(l => <th key={l} style={hd}>{l}</th>)}</tr></thead>
          <tbody>
            {rc.genders.map(g => (
              <tr key={g}>
                <td style={{ ...cell, fontSize: 14, fontWeight: 700 }}>{g}号</td>
                {rc.levels.map(l => {
                  const c = m[g]?.[l]
                  return (
                    <td key={l} style={cell}>
                      {c ? (
                        <a href={c.link} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block' }}>
                          <div className="serif" style={{ fontSize: 15, fontWeight: 900, color: '#c1452e' }}>{fmt(c.price)}</div>
                          <div style={{ fontSize: 10.5, color: '#a89878', marginTop: 2 }}>{c.daqu} · {c.server} ↗</div>
                        </a>
                      ) : <span style={{ color: '#c0b49c' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 装备某子组：选「类型(/特技)」→ 看 等级 × 开服年限 全服最低价
function EquipGroupView({ group, ages }: { group: EquipGroup; ages: { code: number; name: string }[] }) {
  const [sel, setSel] = useState<Record<string, string>>({})
  const cur: Record<string, string> = {}
  group.sel.forEach(s => { cur[s.name] = (sel[s.name] && s.options.includes(sel[s.name])) ? sel[s.name] : s.options[0] })
  const cells = group.cells.filter(c => group.sel.every(s => (s.name === '类型' ? c.类型 : c.特技) === cur[s.name]))
  const matrix: Record<number, Record<number, typeof cells[number]>> = {}
  cells.forEach(c => { (matrix[c.等级] = matrix[c.等级] || {})[c.年限] = c })
  const hd: CSSProperties = { padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#b0a48c', textAlign: 'left', borderBottom: '1px solid #ece2cf', background: '#f7efe2' }
  const cell: CSSProperties = { padding: '10px 14px', borderTop: '1px solid #f0e7d6', whiteSpace: 'nowrap' }
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#8a4a12', marginBottom: 9 }}>{group.label}</div>
      {group.sel.map(s => (
        <div key={s.name} style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 9 }}>
          {s.options.map(o => (
            <button key={o} onClick={() => setSel(p => ({ ...p, [s.name]: o }))}
              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', ...(o === cur[s.name] ? { color: '#fff', background: '#c1452e' } : { color: '#6a5a44', background: '#f5ecdd' }) }}>{o}</button>
          ))}
        </div>
      ))}
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
          <thead><tr><th style={hd}>等级 \ 开服</th>{ages.map(a => <th key={a.code} style={hd}>{a.name}</th>)}</tr></thead>
          <tbody>
            {group.levels.map(lv => (
              <tr key={lv}>
                <td style={{ ...cell, fontSize: 14, fontWeight: 700 }}>{lv}级</td>
                {ages.map(a => {
                  const c = matrix[lv]?.[a.code]
                  return (
                    <td key={a.code} style={cell}>
                      {c ? (
                        <a href={c.link} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block' }}>
                          <div className="serif" style={{ fontSize: 15, fontWeight: 900, color: '#c1452e' }}>{fmt(c.price)}</div>
                          <div style={{ fontSize: 10.5, color: '#a89878', marginTop: 2 }}>{c.daqu} · {c.server} ↗</div>
                        </a>
                      ) : <span style={{ color: '#c0b49c' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EquipView({ equip }: { equip: Equip }) {
  if (!equip || !equip.date || !equip.groups.length) return null
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="serif" style={{ fontSize: 16, fontWeight: 900, color: '#c1452e', borderLeft: '3px solid #c1452e', paddingLeft: 10, letterSpacing: 1, marginBottom: 14 }}>
        装备全服最低价
      </div>
      {equip.groups.map(g => <EquipGroupView key={g.key} group={g} ages={equip.ages} />)}
    </div>
  )
}

// 角色全服最低价矩阵（类别 × 开服年限），仅全服模式展示
function RoleMatrix({ roles }: { roles: Roles }) {
  if (!roles || !roles.date) return null
  const hd: CSSProperties = { padding: '11px 14px', fontSize: 12, fontWeight: 700, color: '#b0a48c', textAlign: 'left', borderBottom: '1px solid #ece2cf', background: '#f7efe2' }
  const cell: CSSProperties = { padding: '12px 14px', borderTop: '1px solid #f0e7d6', verticalAlign: 'middle' }
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="serif" style={{ fontSize: 16, fontWeight: 900, color: '#c1452e', borderLeft: '3px solid #c1452e', paddingLeft: 10, letterSpacing: 1, marginBottom: 12 }}>
        角色全服最低价 · 按开服年限
      </div>
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={hd}>类别</th>
              {roles.ages.map(a => <th key={a.code} style={hd}>{a.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {roles.categories.map(cat => (
              <tr key={cat}>
                <td style={{ ...cell, fontSize: 14, fontWeight: 700 }}>{cat}</td>
                {roles.ages.map(a => {
                  const c = roles.matrix[cat]?.[String(a.code)]
                  return (
                    <td key={a.code} style={cell}>
                      {c ? (
                        <a href={c.link} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block' }}>
                          <div className="serif" style={{ fontSize: 16, fontWeight: 900, color: '#c1452e' }}>{fmt(c.price)}</div>
                          <div style={{ fontSize: 11, color: '#a89878', marginTop: 2 }}>{c.daqu} · {c.server} ↗</div>
                        </a>
                      ) : <span style={{ color: '#c0b49c' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 抓宝宝：一次任务(开始→结束) + 期间每抓到一只录入一条，二者关联
function CatchLogView({ petTypes }: { petTypes: string[] }) {
  const nowLocal = () => {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)   // 'YYYY-MM-DDTHH:mm'（本地时区）
  }
  const [petType, setPetType] = useState(petTypes[0] || '')
  const [coord, setCoord] = useState('')
  const [curTime, setCurTime] = useState(nowLocal())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tasks, setTasks] = useState<CatchTask[]>([])
  const [logs, setLogs] = useState<CatchLog[]>([])   // 当前任务已抓的列表

  // 进行中的任务 = 最近一条未结束的（服务端为准，刷新/换设备也不丢）
  const active = tasks.find(t => !t.end_time) || null

  const loadTasks = () => fetchCatchTasks().then(setTasks).catch(() => { /* ignore */ })
  useEffect(() => { loadTasks() }, [])
  useEffect(() => {
    if (active) fetchCatchLogs(active.id).then(setLogs).catch(() => { /* ignore */ })
    else setLogs([])
  }, [active?.id])

  const inputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: '#2a221a', background: '#fff', border: '1px solid #e0d4bd', borderRadius: 8, outline: 'none' }
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#5a4a34', marginBottom: 6, display: 'block' }

  const start = async () => {
    setBusy(true); setMsg(null)
    try { await startCatchTask(); await loadTasks(); setMsg({ ok: true, text: '任务已开始 ✓' }) }
    catch (e) { setMsg({ ok: false, text: '开始失败：' + ((e as Error).message || e) }) }
    setBusy(false)
  }
  const finish = async () => {
    if (!active) return
    setBusy(true); setMsg(null)
    try { await endCatchTask(active.id); await loadTasks(); setMsg({ ok: true, text: '任务已结束 ✓' }) }
    catch (e) { setMsg({ ok: false, text: '结束失败：' + ((e as Error).message || e) }) }
    setBusy(false)
  }
  const submit = async () => {
    if (!active) { setMsg({ ok: false, text: '请先点「开始」开启任务' }); return }
    if (!petType) { setMsg({ ok: false, text: '请选择宝宝类型' }); return }
    if (coord.trim() && !/^\d{1,4}\s*[,，]\s*\d{1,4}$/.test(coord.trim())) { setMsg({ ok: false, text: '坐标格式应为 12,234' }); return }
    setBusy(true); setMsg(null)
    try {
      await addCatchLog({ task_id: active.id, pet_type: petType, coord: coord.trim(), current_time: curTime })
      setMsg({ ok: true, text: '已录入 ✓' })
      setCoord(''); setCurTime(nowLocal())
      await Promise.all([fetchCatchLogs(active.id).then(setLogs), loadTasks()])
    } catch (e) { setMsg({ ok: false, text: '录入失败：' + ((e as Error).message || e) }) }
    setBusy(false)
  }

  const btn = (bg: string, disabled: boolean): CSSProperties => ({ padding: '11px 24px', fontSize: 14, fontWeight: 800, color: '#fff', background: disabled ? '#d9cdbb' : bg, border: 'none', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' })

  return (
    <div>
      {/* 大任务控制 */}
      <div style={{ fontSize: 16, fontWeight: 800, color: '#2a221a', marginBottom: 16 }}>抓宝宝任务</div>
      <div style={{ maxWidth: 460, background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <button onClick={start} disabled={busy || !!active} style={btn('#3a7a5a', busy || !!active)}>开始</button>
          <button onClick={finish} disabled={busy || !active} style={btn('#c1452e', busy || !active)}>结束</button>
        </div>
        <div style={{ fontSize: 13, color: active ? '#3a7a5a' : '#a89878', fontWeight: 700 }}>
          {active
            ? `任务进行中 · 开始于 ${active.start_time} · 本次已抓 ${logs.length} 只`
            : '当前无进行中的任务，点「开始」开启一次'}
        </div>
      </div>

      {/* 小任务：抓到一只录入一条（需在任务进行中） */}
      <div style={{ fontSize: 15, fontWeight: 800, color: '#2a221a', marginBottom: 12 }}>抓到一只 · 录入</div>
      <div style={{ maxWidth: 460, background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 20, opacity: active ? 1 : 0.6 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>宝宝类型</label>
          <select value={petType} onChange={e => setPetType(e.target.value)} style={inputStyle}>
            {petTypes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>坐标 <span style={{ color: '#a89878', fontWeight: 400 }}>（可选，如 12,234）</span></label>
          <input value={coord} onChange={e => setCoord(e.target.value)} placeholder="12,234" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>当前时间</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="datetime-local" value={curTime} onChange={e => setCurTime(e.target.value)} style={inputStyle} />
            <button onClick={() => setCurTime(nowLocal())} style={{ flexShrink: 0, padding: '0 14px', fontSize: 12.5, fontWeight: 700, color: '#a8351f', background: '#fbeee8', border: '1px solid #ecccc2', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>现在</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={submit} disabled={busy || !active} style={btn('#c1452e', busy || !active)}>{busy ? '处理中…' : '确认录入'}</button>
          {!active && <span style={{ fontSize: 12.5, color: '#a89878' }}>请先点「开始」</span>}
          {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? '#3a7a5a' : '#c1452e' }}>{msg.text}</span>}
        </div>
      </div>

      {/* 本次任务已抓列表 */}
      {active && logs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5a4a34', marginBottom: 10 }}>本次任务已抓（{logs.length}）</div>
          <div style={{ maxWidth: 460, background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#a89878', borderBottom: '1px solid #ece2cf' }}>
              <div>宝宝</div><div>坐标</div><div>时间</div>
            </div>
            {logs.map(l => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 8, padding: '9px 14px', fontSize: 12.5, color: '#3a3226', borderTop: '1px solid #f3ead9' }}>
                <div style={{ fontWeight: 700 }}>{l.pet_type}</div>
                <div>{l.coord || '—'}</div>
                <div>{(l.current_time || '—').replace('T', ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 历史任务（含进行中），后续按大任务统计 */}
      {tasks.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5a4a34', marginBottom: 10 }}>任务记录（{tasks.length}）</div>
          <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.5fr 1.6fr 1.6fr 0.8fr', gap: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#a89878', borderBottom: '1px solid #ece2cf' }}>
              <div>#</div><div>开始</div><div>结束</div><div style={{ textAlign: 'right' }}>抓到</div>
            </div>
            {tasks.map(t => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '0.5fr 1.6fr 1.6fr 0.8fr', gap: 8, padding: '10px 14px', fontSize: 12.5, color: '#3a3226', borderTop: '1px solid #f3ead9' }}>
                <div style={{ color: '#a89878' }}>{t.id}</div>
                <div>{t.start_time}</div>
                <div style={{ color: t.end_time ? '#3a3226' : '#3a7a5a', fontWeight: t.end_time ? 400 : 700 }}>{t.end_time || '进行中'}</div>
                <div style={{ textAlign: 'right', fontWeight: 800 }}>{t.catches}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<Mode>('global')
  const [daqu, setDaqu] = useState('')
  const [server, setServer] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'price' | 'catch'>('price')
  const [openDaqu, setOpenDaqu] = useState(false)
  const [openServer, setOpenServer] = useState(false)
  const selRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchOverview().then(d => {
      setData(d)
      // 恢复上次选择的区服/模式（localStorage），无效则回退到第一个区
      const r0 = d.regions[0]
      let dq = r0?.daqu || '', sv = r0?.servers[0]?.name || ''
      try {
        const saved = JSON.parse(localStorage.getItem(SEL_KEY) || 'null')
        if (saved) {
          const reg = d.regions.find(r => r.daqu === saved.daqu)
          if (reg && reg.servers.some(s => s.name === saved.server)) {
            dq = saved.daqu; sv = saved.server
            if (saved.mode === 'global' || saved.mode === 'server') setMode(saved.mode)
          }
        }
      } catch { /* ignore */ }
      setDaqu(dq); setServer(sv)
    }).catch(e => setErr(String(e.message || e)))
  }, [])

  // 选择变化时记住（区服 + 模式）
  useEffect(() => {
    if (daqu) localStorage.setItem(SEL_KEY, JSON.stringify({ mode, daqu, server }))
  }, [mode, daqu, server])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (selRef.current && !selRef.current.contains(e.target as Node)) { setOpenDaqu(false); setOpenServer(false) } }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  const region: Region | undefined = useMemo(() => data?.regions.find(r => r.daqu === daqu) || data?.regions[0], [data, daqu])
  const curSid = useMemo(() => serveridOf(region, server), [region, server])
  const isGlobal = mode === 'global'

  const list = useMemo(() => (data?.items || []).filter(it => (!q || it.name.indexOf(q) !== -1)), [data, q])

  const rows: Row[] = useMemo(() => list.map(it => {
    const gLoc = `${it.low.daqu} · ${it.low.server}`
    if (isGlobal) {
      // 全服模式：主价格=全服最低价（去掉历史最低小字），右列=所在区服
      return { it, price: fmt(it.low.price), priceHint: '', priceHintColor: '',
        loc: gLoc, gLowPrice: '', gLowLoc: '', badge: '全服最低', showBadge: true, cbg: it.low.link || CBG }
    }
    // 本服模式：主价格=本服价格；全服最低单独成列(价格+大区·服务器)
    const here = serverCell(it, curSid)
    const cheaper = !!here && it.low.price < here.price
    return { it,
      price: here ? fmt(here.price) : '—',
      priceHint: !here ? '本服无在售' : (cheaper ? '' : '✓ 本服即全服最低'),
      priceHintColor: '#3a7a5a',
      loc: '',
      gLowPrice: fmt(it.low.price), gLowLoc: gLoc,
      badge: '全服最低', showBadge: !!here && !cheaper,
      cbg: here ? (here.link || CBG) : (it.low.link || CBG) }
  }), [list, isGlobal, curSid])

  if (err) return <div style={{ textAlign: 'center', padding: '80px 0', color: '#c1452e' }}>数据加载失败：{err}</div>
  if (!data) return <div style={{ textAlign: 'center', padding: '80px 0', color: '#b0a48c' }}>加载中…</div>

  const priceColLabel = isGlobal ? '全服最低价' : '本服价格'
  const col3Label = isGlobal ? '所在区服' : '全服最低'
  const gridCols = isGlobal ? '2.7fr 1.3fr 1.5fr 1fr 1fr' : '2.4fr 1.2fr 1.9fr 1fr 1fr'
  // 宝宝类型下拉：取首页数据里「宝宝」品类的物品名（即已爬取的四种），兜底写死
  const petTypes = (() => {
    const p = data.items.filter(it => it.cat === '宝宝').map(it => it.name)
    return p.length ? p : ['持国巡守', '广目巡守', '多闻巡守', '谛听']
  })()

  return (
    <div>
      {/* TOP BAR */}
      <div style={S.topbar}>
        <div style={S.topInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 'auto' }}>
            <img src="/logo.png" alt="狗脑发热" style={S.logoImg} />
            <div>
              <div className="serif" style={{ fontSize: 19, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>狗脑发热</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#c1452e', fontWeight: 700, marginTop: 4 }}>藏宝阁 · 全服比价</div>
            </div>
          </div>
          <div ref={selRef} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <span className="serif" style={{ fontSize: 12, color: '#a89878' }}>当前区服</span>
            <button style={S.daquBtn} onClick={() => { setOpenDaqu(v => !v); setOpenServer(false) }}>{daqu} <span style={{ color: '#c1452e' }}>▾</span></button>
            <button style={S.srvBtn} onClick={() => { setOpenServer(v => !v); setOpenDaqu(false) }}>{server} <span style={{ color: '#c1452e' }}>▾</span></button>
            {openDaqu && (
              <div className="panel" style={S.panel}>
                <div style={S.panelHd}>第一步 · 选择大区</div>
                {data.regions.map(r => {
                  const on = r.daqu === daqu
                  return <div key={r.daqu} className="daquItem" onClick={() => { setDaqu(r.daqu); setServer(r.servers[0]?.name || ''); setOpenDaqu(false); setOpenServer(true) }}
                    style={{ padding: '10px 16px', fontSize: 13.5, cursor: 'pointer', ...(on ? { fontWeight: 800, color: '#a8351f', background: '#fbeee8', borderLeft: '3px solid #c1452e' } : { color: '#5a4a34', borderLeft: '3px solid transparent' }) }}>
                    {r.daqu}<span style={{ float: 'right', color: '#a89878', fontWeight: 400, fontSize: 12 }}>{r.servers.length} 服</span>
                  </div>
                })}
              </div>
            )}
            {openServer && region && (
              <div className="panel" style={S.panel}>
                <div style={S.panelHd}>第二步 · {region.daqu} 下选择服务器</div>
                {region.servers.map(s => {
                  const on = s.name === server
                  return <div key={s.name + s.serverid} className="srvItem" onClick={() => { setServer(s.name); setOpenServer(false); setMode('server') }}
                    style={{ padding: '10px 16px', fontSize: 13.5, cursor: 'pointer', color: '#5a4a34', ...(on ? { fontWeight: 800, color: '#a8351f', background: '#fbeee8' } : {}) }}>
                    {s.name}<span style={{ float: 'right' }}>{on ? '✓' : ''}</span>
                  </div>
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={S.main}>
        {/* TABS */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid #ece2cf' }}>
          {([['price', '比价'], ['catch', '抓宝宝记录']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '9px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', background: 'none', border: 'none', color: tab === k ? '#c1452e' : '#8a7a5c', borderBottom: tab === k ? '2px solid #c1452e' : '2px solid transparent', marginBottom: -1 }}>{label}</button>
          ))}
        </div>

        {tab === 'price' && (<>
        {/* mode + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'flex', background: '#f1e7d6', border: '1px solid #e6dac4', borderRadius: 9, padding: 3 }}>
            <button style={isGlobal ? segOn : segOff} onClick={() => { setMode('global'); setOpenDaqu(false); setOpenServer(false) }}>全服最低价</button>
            <button style={!isGlobal ? segOn : segOff} onClick={() => { setMode('server'); setOpenDaqu(false); setOpenServer(false) }}>本服 · {server}</button>
          </div>
          <div style={S.search}>
            <span style={{ color: '#c1452e' }}>⌕</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索物品名，如 持国 / 谛听 / 须弥"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, fontFamily: 'inherit', color: '#2a221a' }} />
          </div>
        </div>

        {/* 数据更新时间 */}
        <div style={{ fontSize: 11.5, color: '#b0a48c', marginBottom: 14 }}>数据更新于 {data.generated_at}</div>

        {/* 角色价格（仅全服模式）：境界矩阵 + 限量锦衣 */}
        {isGlobal && <RoleMatrix roles={data.roles} />}
        {isGlobal && <RoleCarryView title="角色 + 七夕限量锦衣 · 全服最低价" items={data.roleClothes.clothes} rc={data.roleClothes} />}
        {isGlobal && <RoleCarryView title="角色 + 限量坐骑 · 全服最低价" items={data.roleMounts.mounts} rc={data.roleMounts} />}
        {isGlobal && <EquipView equip={data.equip} />}

        {/* 物品列表标题 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#2a221a' }}>{isGlobal ? '全服最低价' : `本服 · ${server}`}</div>
          <div style={{ fontSize: 11, color: '#b0a48c' }}>价格仅供参考，点击「去购买」跳转藏宝阁实时核价</div>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 0', color: '#b0a48c', fontSize: 14 }}>没有找到匹配的物品，换个关键词或分类试试</div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="tableWrap">
              <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ ...S.tableHd, gridTemplateColumns: gridCols }}>
                  <div>物品</div><div>{priceColLabel}</div><div>{col3Label}</div><div>价格趋势</div><div style={{ textAlign: 'right' }}>操作</div>
                </div>
                {rows.map(r => (
                  <div key={r.it.id} style={{ ...S.tableRow, gridTemplateColumns: gridCols }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0, background: r.it.iconBg, color: r.it.iconFg }}>{r.it.icon}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>{r.it.name} {r.showBadge && <span style={badgeOn}>{r.badge}</span>}</div>
                        <div style={{ fontSize: 11, color: '#a89878', marginTop: 3 }}>{r.it.cat}</div>
                      </div>
                    </div>
                    {/* 主价格列 */}
                    <div>
                      <div className="serif" style={{ fontSize: 18, fontWeight: 900, color: '#2a221a' }}>{r.price}</div>
                      {r.priceHint && <div style={{ fontSize: 10.5, marginTop: 2, color: r.priceHintColor }}>{r.priceHint}</div>}
                    </div>
                    {/* 第三列：全服=所在区服；本服=全服最低(价格+大区·服务器) */}
                    {isGlobal
                      ? <div style={{ fontSize: 13, color: '#6a5a44' }}>{r.loc}</div>
                      : <div>
                          <div className="serif" style={{ fontSize: 16, fontWeight: 900, color: '#c1452e' }}>{r.gLowPrice}</div>
                          <div style={{ fontSize: 11, color: '#a89878', marginTop: 2 }}>{r.gLowLoc}</div>
                        </div>}
                    <div><Trend points={r.it.points} color={r.it.trendColor} /></div>
                    <div style={{ textAlign: 'right' }}>
                      <a href={r.cbg} target="_blank" rel="noopener" style={{ display: 'inline-block', background: '#fbeee8', color: '#a8351f', textDecoration: 'none', border: '1px solid #ecccc2', padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 700 }}>去购买 ↗</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MOBILE CARDS */}
            <div className="cardWrap" style={{ flexDirection: 'column', gap: 12 }}>
              {rows.map(r => (
                <div key={r.it.id} style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0, background: r.it.iconBg, color: r.it.iconFg }}>{r.it.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>{r.it.name} {r.showBadge && <span style={badgeOn}>{r.badge}</span>}</div>
                      <div style={{ fontSize: 11, color: '#a89878', marginTop: 3 }}>{isGlobal ? r.loc : r.it.cat}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="serif" style={{ fontSize: 19, fontWeight: 900, color: '#2a221a' }}>{r.price}</div>
                      {r.priceHint && <div style={{ fontSize: 10, marginTop: 2, color: r.priceHintColor }}>{r.priceHint}</div>}
                    </div>
                  </div>
                  {!isGlobal && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#6a5a44', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      全服最低 <span className="serif" style={{ fontWeight: 900, color: '#c1452e', fontSize: 14 }}>{r.gLowPrice}</span>
                      <span style={{ color: '#a89878' }}>· {r.gLowLoc}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0e7d6' }}>
                    <Trend points={r.it.points} color={r.it.trendColor} w={72} />
                    <a href={r.cbg} target="_blank" rel="noopener" style={{ background: '#c1452e', color: '#fff', textDecoration: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 800 }}>去藏宝阁购买 ↗</a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        </>)}

        {tab === 'catch' && <CatchLogView petTypes={petTypes} />}

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#c0b49c', lineHeight: 1.7 }}>
          狗脑发热 · 梦幻西游藏宝阁全服比价 · 数据更新于 {data.generated_at}<br />价格每日更新，仅供参考，点击「去购买」以藏宝阁实时为准
        </div>
      </div>
    </div>
  )
}
