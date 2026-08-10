import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import { EXP_TABLE, XIULIAN, XIULIAN_TYPES, SHIMEN, BANGPAI, BANGPAI_SKILLS, type XlStep } from './calcData'
import { fetchOverview, fmt, serveridOf, serverCell, addCatchLog, fetchCatchLogs, startCatchTask, endCatchTask, fetchCatchTasks, fetchCatchStats, fetchScenePets, fetchGoods, fetchGoodsPrices, saveGoodsPrices, addCustomGood, deleteCustomGood, addGoodsCategory, deleteGoodsCategory, authLogin, authRegisterEmail, sendEmailCode, authMe, authLogout, CHANNEL_LABEL, type AuthUser, type Overview, type Item, type Region, type Roles, type RoleCell, type Equip, type EquipGroup, type CatchLog, type CatchTask, type CatchStat, type SceneGroup, type GoodsCategory } from './api'

const CBG = 'https://xyq.cbg.163.com/'
const SEL_KEY = '__mhxy_sel'   // localStorage: 记住用户选的区服/模式

const S: Record<string, CSSProperties> = {
  topbar: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, background: '#faf6eecc', backdropFilter: 'saturate(1.2) blur(8px)', borderBottom: '1px solid #ece2cf' },
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

// 登录 / 注册 页面（注册=邮箱验证码；网页注册为「普通」渠道；微信/抖音渠道由小程序端创建）
function AuthView({ mode, onAuth }: { mode: 'login' | 'register'; onAuth: (u: AuthUser) => void }) {
  const nav = useNavigate()
  const isLogin = mode === 'login'
  const [username, setUsername] = useState('')   // 登录：邮箱/用户名
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [cd, setCd] = useState(0)                // 发送验证码倒计时(秒)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tip, setTip] = useState('')

  useEffect(() => {
    if (cd <= 0) return
    const t = setTimeout(() => setCd(cd - 1), 1000)
    return () => clearTimeout(t)
  }, [cd])

  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#5a4a34', marginBottom: 6, display: 'block' }

  const sendCode = async () => {
    setErr(''); setTip('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('请输入正确的邮箱'); return }
    try {
      await sendEmailCode(email.trim())
      setCd(60)
      setTip('验证码已发送，请查收邮箱（10 分钟内有效）')
    } catch (e) { setErr((e as Error).message || '发送失败') }
  }

  const submit = async () => {
    setErr(''); setTip('')
    if (isLogin) {
      if (!username.trim()) { setErr('请输入邮箱/用户名'); return }
      if (!password) { setErr('请输入密码'); return }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('请输入正确的邮箱'); return }
      if (!code.trim()) { setErr('请输入验证码'); return }
      if (password.length < 6) { setErr('密码至少 6 位'); return }
      if (password !== password2) { setErr('两次密码不一致'); return }
    }
    setBusy(true)
    try {
      const u = isLogin ? await authLogin(username.trim(), password) : await authRegisterEmail(email.trim(), code.trim(), password, nickname.trim())
      onAuth(u)
      nav('/')
    } catch (e) { setErr((e as Error).message || '操作失败') }
    setBusy(false)
  }

  return (
    <div style={{ maxWidth: 400, margin: '30px auto 0' }}>
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 26 }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 900, color: '#2a221a', marginBottom: 4 }}>{isLogin ? '登录' : '注册'}</div>
        <div style={{ fontSize: 12, color: '#a89878', marginBottom: 18 }}>
          {isLogin ? '登录后可使用记录等功能' : '邮箱验证码注册（普通渠道）；微信 / 抖音渠道账号由对应小程序自动创建'}
        </div>
        {isLogin ? (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>邮箱 / 用户名</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="注册时的邮箱或用户名" className="ctl" />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>邮箱</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="ctl" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>验证码</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6 位数字" className="ctl" />
                <button className="btnH" onClick={sendCode} disabled={cd > 0}
                  style={{ flexShrink: 0, padding: '0 16px', fontSize: 12.5, fontWeight: 700, color: cd > 0 ? '#b0a48c' : '#a8351f', background: '#fbeee8', border: '1px solid #ecccc2', borderRadius: 8, cursor: cd > 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {cd > 0 ? `${cd}s 后重发` : '发送验证码'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>昵称 <span style={{ color: '#a89878', fontWeight: 400 }}>（可选）</span></label>
              <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="怎么称呼你" className="ctl" />
            </div>
          </>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>密码</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isLogin ? '密码' : '至少 6 位'} className="ctl"
            onKeyDown={e => { if (isLogin && e.key === 'Enter') submit() }} />
        </div>
        {!isLogin && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>确认密码</label>
            <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="再输一遍" className="ctl"
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button className="btnH" onClick={submit} disabled={busy}
            style={{ flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 800, color: '#fff', background: busy ? '#d9cdbb' : '#c1452e', border: 'none', borderRadius: 8, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {busy ? '处理中…' : (isLogin ? '登录' : '注册并登录')}
          </button>
        </div>
        {err && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: '#c1452e' }}>{err}</div>}
        {tip && !err && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: '#3a7a5a' }}>{tip}</div>}
        <div style={{ marginTop: 18, fontSize: 13, color: '#8a7a5c', textAlign: 'center' }}>
          {isLogin
            ? <>没有账号？<Link to="/register" style={{ color: '#c1452e', fontWeight: 700 }}>去注册</Link></>
            : <>已有账号？<Link to="/login" style={{ color: '#c1452e', fontWeight: 700 }}>去登录</Link></>}
        </div>
      </div>
    </div>
  )
}

// 计算器：经验换算 / 常规计算 / 修炼计算（数据与算法迁自官方梦幻工具箱，纯前端本地计算）
function CalcView() {
  const fmtNum = (n: number) => n.toLocaleString('en-US')
  const fmtBig = (n: number) => {
    if (n >= 1e8) return `${fmtNum(n)}（约 ${(n / 1e8).toFixed(2)} 亿）`
    if (n >= 1e4) return `${fmtNum(n)}（约 ${(n / 1e4).toFixed(1)} 万）`
    return fmtNum(n)
  }
  const numOnly = (v: string) => v.replace(/\D/g, '').slice(0, 12)
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#5a4a34', marginBottom: 6, display: 'block' }
  const cardStyle: CSSProperties = { flex: '1 1 300px', minWidth: 280, maxWidth: 420, background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 20, alignSelf: 'flex-start' }
  const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 800, color: '#c1452e', borderLeft: '3px solid #c1452e', paddingLeft: 10, marginBottom: 14 }
  const resStyle: CSSProperties = { fontSize: 13, color: '#3a3226', background: '#fff', border: '1px solid #e6dac4', borderRadius: 9, padding: '10px 12px', marginTop: 12, lineHeight: 1.9 }
  const btnStyle: CSSProperties = { padding: '10px 24px', fontSize: 13.5, fontWeight: 800, color: '#fff', background: '#c1452e', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }

  // 工具1: 经验换算
  const [lvFrom, setLvFrom] = useState(''); const [lvTo, setLvTo] = useState('')
  const [lvRes, setLvRes] = useState<string | null>(null)
  const calcLvToExp = () => {
    const a = Number(lvFrom), b = Number(lvTo)
    if (lvFrom === '' || a < 0 || a > 175) { setLvRes('当前等级输入有误，范围 0-175'); return }
    if (lvTo === '' || b < 0 || b > 175) { setLvRes('目标等级输入有误，范围 0-175'); return }
    if (a >= b) { setLvRes('目标等级需大于当前等级'); return }
    let s = 0
    for (let i = a; i < b; i++) s += EXP_TABLE[i]
    setLvRes(`需要经验：${fmtBig(s)}`)
  }
  const [expVal, setExpVal] = useState(''); const [expLv, setExpLv] = useState('')
  const [expRes, setExpRes] = useState<string | null>(null)
  const calcExpToLv = () => {
    const e = Number(expVal), l = Number(expLv)
    if (expVal === '') { setExpRes('当前经验输入有误'); return }
    if (expLv === '' || l < 1 || l > 175) { setExpRes('当前等级输入有误，范围 1-175'); return }
    let lv = l, rem = e
    while (lv < 175 && rem >= EXP_TABLE[lv]) { rem -= EXP_TABLE[lv]; lv++ }
    setExpRes(`可达等级：${lv}　剩余经验：${fmtBig(rem)}`)
  }

  // 工具2: 常规计算（官方公式）
  const [cgLv, setCgLv] = useState('')
  const [cgRes, setCgRes] = useState<string | null>(null)
  const calcChanggui = () => {
    const lv = Number(cgLv)
    if (cgLv === '' || lv > 175) { setCgRes('人物等级输入有误'); return }
    let skill: number | string = Math.trunc(lv - lv / 5 - 10)
    skill = (lv > 19 ? skill : 0) <= 0 ? '无' : skill
    const money = Math.min(lv * lv * 2000 + 10000, 30000000)
    setCgRes(`人物技能要求：${skill}　携带金钱上限：${fmtBig(money)}`)
  }

  // 工具4: 师门技能计算
  const [smFrom, setSmFrom] = useState(''); const [smTo, setSmTo] = useState('')
  const [smRes, setSmRes] = useState<string[] | null>(null)
  const calcShimen = () => {
    const a = Number(smFrom), b = Number(smTo)
    if (smFrom === '' || a < 0 || a > 180) { setSmRes(['当前等级输入有误，范围 0-180']); return }
    if (smTo === '' || b < 0 || b > 180) { setSmRes(['到达等级输入有误，范围 0-180']); return }
    if (a >= b) { setSmRes(['到达等级需大于当前等级']); return }
    const steps = SHIMEN.slice(a, b)
    setSmRes([
      `所需经验：${fmtBig(steps.reduce((s, x) => s + x[0], 0))}`,
      `所需金钱：${fmtBig(steps.reduce((s, x) => s + x[1], 0))}`,
    ])
  }

  // 工具5: 帮派技能计算
  const [bpIdx, setBpIdx] = useState(0)
  const [bpFrom, setBpFrom] = useState(''); const [bpTo, setBpTo] = useState('')
  const [bpRes, setBpRes] = useState<string[] | null>(null)
  const calcBangpai = () => {
    const [sid, , cap] = BANGPAI_SKILLS[bpIdx]
    const a = Number(bpFrom), b = Number(bpTo)
    if (bpFrom === '' || a < 0 || a > cap) { setBpRes([`目前等级输入有误，范围 0-${cap}`]); return }
    if (bpTo === '' || b < 0 || b > cap) { setBpRes([`目标等级输入有误，范围 0-${cap}`]); return }
    if (a >= b) { setBpRes(['目标等级需大于目前等级']); return }
    const steps = BANGPAI[sid].slice(a, b)
    setBpRes([
      `消耗经验：${fmtBig(steps.reduce((s, x) => s + x[0], 0))}`,
      `消耗金钱：${fmtBig(steps.reduce((s, x) => s + x[1], 0))}`,
      `需要达到帮贡：${fmtNum(5 * b)}`,
      `消耗帮贡：${fmtNum((a + 1 + b) * (b - a) / 2)}`,
    ])
  }

  // 工具3: 修炼计算
  const [xlType, setXlType] = useState<string>('1')
  const [xlFrom, setXlFrom] = useState(''); const [xlTo, setXlTo] = useState('')
  const [xlRes, setXlRes] = useState<string[] | null>(null)
  const calcXiulian = () => {
    const a = Number(xlFrom), b = Number(xlTo)
    if (xlFrom === '' || a < 0 || a > 25) { setXlRes(['目前修炼等级输入有误，范围 0-25']); return }
    if (xlTo === '' || b < 0 || b > 25) { setXlRes(['目标修炼等级输入有误，范围 0-25']); return }
    if (a >= b) { setXlRes(['目标修炼等级需大于目前等级']); return }
    const steps = XIULIAN[xlType].slice(a, b)
    const sum = (f: (s: XlStep) => number) => steps.reduce((acc, s) => acc + f(s), 0)
    const mx = (f: (s: XlStep) => number) => Math.max(...steps.map(f))
    setXlRes([
      `所需修炼经验：${fmtNum(sum(s => s.exp))}`,
      `角色等级要求：${mx(s => s.min_grade)}`,
      `需要达到帮贡：${fmtNum(mx(s => s.bg))}`,
      `消耗资财：${fmtNum(sum(s => s.zc))}`,
      `消耗金钱：${fmtNum(sum(s => s.cash) / 10000)} 万`,
    ])
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#a89878', marginBottom: 16 }}>数据与算法迁自官方梦幻工具箱，本地即时计算</div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 经验换算 */}
        <div style={cardStyle}>
          <div style={titleStyle}>经验换算</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>等级换算经验</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={lvFrom} onChange={e => setLvFrom(numOnly(e.target.value))} inputMode="numeric" placeholder="当前等级" className="ctl" />
              <span style={{ color: '#a89878' }}>→</span>
              <input value={lvTo} onChange={e => setLvTo(numOnly(e.target.value))} inputMode="numeric" placeholder="目标等级" className="ctl" />
              <button className="btnH" style={btnStyle} onClick={calcLvToExp}>查询</button>
            </div>
            {lvRes && <div style={resStyle}>{lvRes}</div>}
          </div>
          <div>
            <label style={labelStyle}>经验换算等级</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={expVal} onChange={e => setExpVal(numOnly(e.target.value))} inputMode="numeric" placeholder="当前经验" className="ctl" />
              <input value={expLv} onChange={e => setExpLv(numOnly(e.target.value))} inputMode="numeric" placeholder="当前等级" className="ctl" style={{ width: 110, flexShrink: 0 }} />
              <button className="btnH" style={btnStyle} onClick={calcExpToLv}>查询</button>
            </div>
            {expRes && <div style={resStyle}>{expRes}</div>}
          </div>
        </div>

        {/* 常规计算 */}
        <div style={cardStyle}>
          <div style={titleStyle}>常规计算</div>
          <label style={labelStyle}>人物等级</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={cgLv} onChange={e => setCgLv(numOnly(e.target.value))} inputMode="numeric" placeholder="0-175" className="ctl" />
            <button className="btnH" style={btnStyle} onClick={calcChanggui}>查询</button>
          </div>
          {cgRes && <div style={resStyle}>{cgRes}</div>}
        </div>

        {/* 修炼计算 */}
        <div style={cardStyle}>
          <div style={titleStyle}>修炼计算</div>
          <label style={labelStyle}>类型</label>
          <select value={xlType} onChange={e => setXlType(e.target.value)} className="ctl" style={{ marginBottom: 12 }}>
            {XIULIAN_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={xlFrom} onChange={e => setXlFrom(numOnly(e.target.value))} inputMode="numeric" placeholder="目前修炼等级" className="ctl" />
            <span style={{ color: '#a89878' }}>→</span>
            <input value={xlTo} onChange={e => setXlTo(numOnly(e.target.value))} inputMode="numeric" placeholder="目标修炼等级" className="ctl" />
            <button className="btnH" style={btnStyle} onClick={calcXiulian}>查询</button>
          </div>
          {xlRes && <div style={resStyle}>{xlRes.map((t, i) => <div key={i}>{t}</div>)}</div>}
        </div>

        {/* 师门技能计算 */}
        <div style={cardStyle}>
          <div style={titleStyle}>师门技能计算</div>
          <label style={labelStyle}>技能等级范围（0-180）</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={smFrom} onChange={e => setSmFrom(numOnly(e.target.value))} inputMode="numeric" placeholder="当前等级" className="ctl" />
            <span style={{ color: '#a89878' }}>→</span>
            <input value={smTo} onChange={e => setSmTo(numOnly(e.target.value))} inputMode="numeric" placeholder="到达等级" className="ctl" />
            <button className="btnH" style={btnStyle} onClick={calcShimen}>查询</button>
          </div>
          {smRes && <div style={resStyle}>{smRes.map((t, i) => <div key={i}>{t}</div>)}</div>}
        </div>

        {/* 帮派技能计算 */}
        <div style={cardStyle}>
          <div style={titleStyle}>帮派技能计算</div>
          <label style={labelStyle}>技能</label>
          <select value={bpIdx} onChange={e => { setBpIdx(Number(e.target.value)); setBpRes(null) }} className="ctl" style={{ marginBottom: 12 }}>
            {BANGPAI_SKILLS.map(([, name, cap], i) => <option key={i} value={i}>{name}（上限 {cap}）</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={bpFrom} onChange={e => setBpFrom(numOnly(e.target.value))} inputMode="numeric" placeholder="目前等级" className="ctl" />
            <span style={{ color: '#a89878' }}>→</span>
            <input value={bpTo} onChange={e => setBpTo(numOnly(e.target.value))} inputMode="numeric" placeholder="目标等级" className="ctl" />
            <button className="btnH" style={btnStyle} onClick={calcBangpai}>查询</button>
          </div>
          {bpRes && <div style={resStyle}>{bpRes.map((t, i) => <div key={i}>{t}</div>)}</div>}
        </div>
      </div>
    </div>
  )
}

// 物品价格：登录用户按区服给物品打价格标签（为收益金钱统计铺垫）
function GoodsView({ regions, initDaqu, initServer }: { regions: Region[]; initDaqu: string; initServer: string }) {
  const [cats, setCats] = useState<GoodsCategory[]>([])
  const [cat, setCat] = useState('')
  const [daqu, setDaqu] = useState(initDaqu)
  const [server, setServer] = useState(initServer)
  const [vals, setVals] = useState<Record<number, string>>({})       // 当前编辑值
  const [loaded, setLoaded] = useState<Record<number, string>>({})   // 服务端已存值
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const region = regions.find(r => r.daqu === daqu) || regions[0]
  const servers = region?.servers || []
  const sid = servers.find(s => s.name === server)?.serverid ?? servers[0]?.serverid

  // 自定义分类/物品
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newGoodName, setNewGoodName] = useState('')

  const reloadGoods = (keepCat?: string) => fetchGoods().then(c => {
    setCats(c)
    const want = keepCat ?? cat
    setCat(c.some(x => x.name === want) ? want : (c[0]?.name || ''))
  }).catch(() => { /* ignore */ })

  useEffect(() => { fetchGoods().then(c => { setCats(c); if (c[0]) setCat(c[0].name) }).catch(() => { /* ignore */ }) }, [])

  const doAddCategory = async () => {
    const n = newCatName.trim()
    if (!n) return
    try {
      await addGoodsCategory(n)
      setNewCatName(''); setShowNewCat(false)
      await reloadGoods(n)
      setMsg({ ok: true, text: `已添加分类「${n}」` })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const doDelCategory = async (n: string) => {
    if (!window.confirm(`删除分类「${n}」？该分类下你添加的物品及价格会一并删除`)) return
    try { await deleteGoodsCategory(n); await reloadGoods(''); setMsg({ ok: true, text: `已删除分类「${n}」` }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const doAddGood = async () => {
    const n = newGoodName.trim()
    if (!n || !cat) return
    try {
      await addCustomGood(n, cat)
      setNewGoodName('')
      await reloadGoods()
      setMsg({ ok: true, text: `已添加「${n}」` })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const doDelGood = async (id: number, n: string) => {
    if (!window.confirm(`删除物品「${n}」？其价格标签会一并删除`)) return
    try {
      await deleteCustomGood(id)
      const v = { ...vals }; delete v[id]; setVals(v)
      const o = { ...loaded }; delete o[id]; setLoaded(o)
      await reloadGoods()
      setMsg({ ok: true, text: `已删除「${n}」` })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  useEffect(() => {
    if (sid == null) return
    fetchGoodsPrices(sid).then(p => {
      const m: Record<number, string> = {}
      Object.entries(p).forEach(([k, v]) => { m[Number(k)] = String(v) })
      setVals(m); setLoaded(m); setMsg(null)
    }).catch(() => { /* ignore */ })
  }, [sid])

  const pickDaqu = (d: string) => {
    setDaqu(d)
    const r = regions.find(x => x.daqu === d)
    setServer(r?.servers[0]?.name || '')
  }

  const numOnly = (v: string) => v.replace(/[^\d.]/g, '').slice(0, 10)

  const save = async () => {
    const ids = new Set([...Object.keys(vals), ...Object.keys(loaded)].map(Number))
    const changes: { goods_id: number; price: number | null }[] = []
    ids.forEach(id => {
      const v = (vals[id] ?? '').trim(), o = (loaded[id] ?? '').trim()
      if (v === o) return
      changes.push({ goods_id: id, price: v === '' ? null : Number(v) })
    })
    if (!changes.length) { setMsg({ ok: true, text: '没有修改' }); return }
    if (changes.some(c => c.price != null && !isFinite(c.price))) { setMsg({ ok: false, text: '有价格不是有效数字' }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await saveGoodsPrices({ serverid: sid!, server_name: server, area_name: daqu, prices: changes })
      setLoaded({ ...vals })
      setMsg({ ok: true, text: `已保存 ${r.saved} 项${r.cleared ? `，清除 ${r.cleared} 项` : ''}` })
    } catch (e) { setMsg({ ok: false, text: '保存失败：' + ((e as Error).message || e) }) }
    setBusy(false)
  }

  const curGoods = cats.find(c => c.name === cat)?.goods || []
  const pricedCount = Object.values(vals).filter(v => (v ?? '').trim() !== '').length

  return (
    <div style={{ maxWidth: 860 }}>
      {/* 区服选择 + 保存 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={daqu} onChange={e => pickDaqu(e.target.value)} className="ctl" style={{ width: 150 }}>
          {regions.map(r => <option key={r.daqu} value={r.daqu}>{r.daqu}</option>)}
        </select>
        <select value={server} onChange={e => setServer(e.target.value)} className="ctl" style={{ width: 150 }}>
          {servers.map(s => <option key={s.serverid} value={s.name}>{s.name}</option>)}
        </select>
        <button className="btnH" onClick={save} disabled={busy}
          style={{ padding: '10px 26px', fontSize: 13.5, fontWeight: 800, color: '#fff', background: busy ? '#d9cdbb' : '#c1452e', border: 'none', borderRadius: 8, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
          {busy ? '保存中…' : '保存'}
        </button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? '#3a7a5a' : '#c1452e' }}>{msg.text}</span>}
      </div>
      <div style={{ fontSize: 12, color: '#a89878', marginBottom: 14 }}>
        价格与当前区服绑定，单位自定（建议统一用「万」）；已设 {pricedCount} 项。留空并保存 = 清除该价格。
      </div>

      {/* 分类（自定义分类带 ×，可新增分类） */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {cats.map(c => (
          <button key={c.name} className="btnH" onClick={() => setCat(c.name)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'inherit', ...(c.name === cat ? { color: '#fff', background: '#c1452e' } : { color: '#6a5a44', background: '#f5ecdd' }) }}>
            {c.name}（{c.goods.length}）
            {c.custom && <span onClick={e => { e.stopPropagation(); doDelCategory(c.name) }}
              style={{ fontSize: 13, lineHeight: 1, opacity: .7 }} title="删除该分类">×</span>}
          </button>
        ))}
        {showNewCat ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="新分类名" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') doAddCategory(); if (e.key === 'Escape') setShowNewCat(false) }}
              className="ctl" style={{ width: 120, padding: '6px 10px', fontSize: 13 }} />
            <button className="btnH" onClick={doAddCategory}
              style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#3a7a5a', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>确定</button>
            <button className="btnH" onClick={() => { setShowNewCat(false); setNewCatName('') }}
              style={{ padding: '7px 10px', fontSize: 12.5, fontWeight: 700, color: '#8a7a5c', background: 'transparent', border: '1px solid #e0d2b8', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          </div>
        ) : (
          <button className="btnH" onClick={() => setShowNewCat(true)}
            style={{ fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', border: '1px dashed #d0b98f', background: 'transparent', color: '#a8351f', fontFamily: 'inherit' }}>＋ 新分类</button>
        )}
      </div>

      {/* 物品 + 价格输入（自定义物品带 ×，尾部可添加物品） */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {curGoods.map(g => (
          <div key={g.id} style={{ width: 195, background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 10, padding: '10px 12px', position: 'relative' }}>
            {g.custom && <span onClick={() => doDelGood(g.id, g.name)} title="删除该物品"
              style={{ position: 'absolute', top: 5, right: 9, fontSize: 14, color: '#b0a48c', cursor: 'pointer', fontWeight: 700 }}>×</span>}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2a221a', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: g.custom ? 14 : 0 }}>{g.name}</div>
            <input value={vals[g.id] ?? ''} onChange={e => setVals({ ...vals, [g.id]: numOnly(e.target.value) })}
              inputMode="decimal" placeholder="未设置" className="ctl" style={{ padding: '7px 10px', fontSize: 13 }} />
          </div>
        ))}
        {cat && (
          <div style={{ width: 195, background: 'transparent', border: '1px dashed #d0b98f', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a8351f', marginBottom: 6 }}>＋ 添加物品到「{cat}」</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newGoodName} onChange={e => setNewGoodName(e.target.value)} placeholder="如 魔兽要诀"
                onKeyDown={e => { if (e.key === 'Enter') doAddGood() }}
                className="ctl" style={{ padding: '7px 10px', fontSize: 13 }} />
              <button className="btnH" onClick={doAddGood}
                style={{ flexShrink: 0, padding: '0 12px', fontSize: 13, fontWeight: 800, color: '#fff', background: '#3a7a5a', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>加</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 抓宝宝：一次任务(开始→结束) + 期间每抓到一只录入一条，二者关联
function CatchLogView() {
  const nowLocal = () => {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)   // 'YYYY-MM-DDTHH:mm'（本地时区）
  }
  const [category, setCategory] = useState<'召唤兽' | '环装'>('召唤兽')
  const [scenes, setScenes] = useState<SceneGroup[]>([])
  const [sceneId, setSceneId] = useState<number>(0)
  const [petName, setPetName] = useState('')
  const [ringLevel, setRingLevel] = useState('60')
  const [ringSub, setRingSub] = useState<'武器' | '装备'>('武器')
  const [coordX, setCoordX] = useState('')
  const [coordY, setCoordY] = useState('')
  const numOnly = (v: string) => v.replace(/\D/g, '').slice(0, 4)   // 只留数字，最多4位
  const catchLabel = (c: { category: string; name: string; sub_type: string }) =>
    c.category === '环装' ? `${c.name}环·${c.sub_type}` : c.category === '告密' ? '告密' : c.name
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tasks, setTasks] = useState<CatchTask[]>([])
  const [logs, setLogs] = useState<CatchLog[]>([])   // 当前任务已抓的列表

  // 进行中的任务 = 最近一条未结束的（服务端为准，刷新/换设备也不丢）
  const active = tasks.find(t => !t.end_time) || null
  const curScene = scenes.find(s => s.id === sceneId) || null

  // 任务进行中的实时计时器（每秒走字）
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active?.id])
  const elapsed = active ? Math.max(0, Math.floor((nowTick - new Date(active.start_time.replace(' ', 'T')).getTime()) / 1000)) : 0
  const fmtDur = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // 收益查询：日期范围(按日) → 每种东西分开计数
  const dayStr = (offset = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offset)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  const [statStart, setStatStart] = useState(dayStr(-29))   // 默认近30天
  const [statEnd, setStatEnd] = useState(dayStr(0))
  const [stats, setStats] = useState<CatchStat[]>([])
  const [statTotal, setStatTotal] = useState(0)
  const [statBusy, setStatBusy] = useState(false)
  const loadStats = async (s = statStart, e = statEnd) => {
    setStatBusy(true)
    try { const d = await fetchCatchStats(s, e); setStats(d.rows); setStatTotal(d.total) } catch { /* ignore */ }
    setStatBusy(false)
  }
  useEffect(() => { loadStats() }, [])
  const quickRange = (days: number) => { const s = dayStr(-(days - 1)), e = dayStr(0); setStatStart(s); setStatEnd(e); loadStats(s, e) }

  const loadTasks = () => fetchCatchTasks().then(setTasks).catch(() => { /* ignore */ })
  useEffect(() => { loadTasks() }, [])
  useEffect(() => {
    fetchScenePets().then(s => {
      setScenes(s)
      if (s[0]) { setSceneId(s[0].id); setPetName(s[0].pets[0]?.name || '') }
    }).catch(() => { /* ignore */ })
  }, [])
  const pickScene = (id: number) => {
    setSceneId(id)
    const sc = scenes.find(s => s.id === id)
    setPetName(sc?.pets[0]?.name || '')
  }
  useEffect(() => {
    if (active) fetchCatchLogs(active.id).then(setLogs).catch(() => { /* ignore */ })
    else setLogs([])
  }, [active?.id])

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
    let name = '', sub_type = '', scene = ''
    if (category === '召唤兽') { name = petName; scene = curScene?.name || ''; if (!name) { setMsg({ ok: false, text: '请选择召唤兽' }); return } }
    else if (category === '环装') { name = ringLevel; sub_type = ringSub; if (!name) { setMsg({ ok: false, text: '请选择环装级别' }); return } }
    setBusy(true); setMsg(null)
    try {
      await addCatchLog({ task_id: active.id, category, scene, name, sub_type, coord_x: coordX.trim(), coord_y: coordY.trim(), current_time: nowLocal() })
      setMsg({ ok: true, text: '已录入 ✓' })
      setCoordX(''); setCoordY('')
      await Promise.all([fetchCatchLogs(active.id).then(setLogs), loadTasks(), loadStats()])
    } catch (e) { setMsg({ ok: false, text: '录入失败：' + ((e as Error).message || e) }) }
    setBusy(false)
  }

  const btn = (bg: string, disabled: boolean): CSSProperties => ({ padding: '11px 24px', fontSize: 14, fontWeight: 800, color: '#fff', background: disabled ? '#d9cdbb' : bg, border: 'none', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' })

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* 左列：任务控制 + 录入表单 */}
      <div style={{ flex: '0 1 460px', minWidth: 300 }}>
      {/* 大任务控制 */}
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <button className="btnH" onClick={start} disabled={busy || !!active} style={btn('#3a7a5a', busy || !!active)}>开始</button>
          <button className="btnH" onClick={finish} disabled={busy || !active} style={btn('#c1452e', busy || !active)}>结束</button>
        </div>
        {active ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#3a7a5a', fontWeight: 700 }}>任务进行中 · 开始于 {active.start_time}</span>
            <span className="serif" style={{ fontSize: 20, fontWeight: 900, color: '#c1452e', fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtDur(elapsed)}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#a89878', fontWeight: 700 }}>当前无进行中的任务，点「开始」开启一次</div>
        )}
      </div>

      {/* 小任务：抓到一只录入一条（需在任务进行中） */}
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 20, opacity: active ? 1 : 0.6 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>类别</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['召唤兽', '环装'] as const).map(c => (
              <button className="btnH" key={c} onClick={() => setCategory(c)}
                style={{ flex: 1, padding: '9px 0', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 8, border: '1px solid ' + (category === c ? '#c1452e' : '#e0d4bd'), background: category === c ? '#c1452e' : '#fff', color: category === c ? '#fff' : '#6a5a44' }}>{c}</button>
            ))}
          </div>
        </div>
        {category === '召唤兽' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>场景</label>
              <select value={sceneId} onChange={e => pickScene(Number(e.target.value))} className="ctl">
                {scenes.map(s => <option key={s.id} value={s.id}>{s.name}（{s.pets.length}）</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>召唤兽</label>
              <select value={petName} onChange={e => setPetName(e.target.value)} className="ctl">
                {(curScene?.pets || []).map(p => <option key={p.id} value={p.name}>{p.name}{p.carry_lv ? `（${p.carry_lv}级）` : ''}</option>)}
              </select>
            </div>
          </div>
        )}
        {category === '环装' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>环装级别</label>
              <select value={ringLevel} onChange={e => setRingLevel(e.target.value)} className="ctl">
                {['60', '70', '80'].map(l => <option key={l} value={l}>{l}环</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>武器 / 装备</label>
              <select value={ringSub} onChange={e => setRingSub(e.target.value as '武器' | '装备')} className="ctl">
                {['武器', '装备'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>坐标 <span style={{ color: '#a89878', fontWeight: 400 }}>（可选，纯数字）</span></label>
          <div style={{ display: 'flex', gap: 12 }}>
            <input value={coordX} onChange={e => setCoordX(numOnly(e.target.value))} inputMode="numeric" placeholder="X 轴" className="ctl" />
            <input value={coordY} onChange={e => setCoordY(numOnly(e.target.value))} inputMode="numeric" placeholder="Y 轴" className="ctl" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btnH" onClick={submit} disabled={busy || !active} style={btn('#c1452e', busy || !active)}>{busy ? '处理中…' : '确认录入'}</button>
          {!active && <span style={{ fontSize: 12.5, color: '#a89878' }}>请先点「开始」</span>}
          {msg && !msg.ok && <span style={{ fontSize: 13, fontWeight: 700, color: '#c1452e' }}>{msg.text}</span>}
        </div>
      </div>
      </div>

      {/* 右列：本次任务记录 + 收益查询 */}
      <div style={{ flex: '1 1 340px', minWidth: 300 }}>
      {/* 收益查询：日期范围内每种东西分开统计 */}
      <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#2a221a', marginBottom: 12 }}>收益查询</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input type="date" value={statStart} onChange={e => setStatStart(e.target.value)} className="ctl" style={{ width: 148 }} />
          <span style={{ color: '#a89878' }}>至</span>
          <input type="date" value={statEnd} onChange={e => setStatEnd(e.target.value)} className="ctl" style={{ width: 148 }} />
          <button className="btnH" onClick={() => loadStats()} disabled={statBusy}
            style={{ padding: '10px 18px', fontSize: 13, fontWeight: 800, color: '#fff', background: statBusy ? '#d9cdbb' : '#c1452e', border: 'none', borderRadius: 8, cursor: statBusy ? 'default' : 'pointer', fontFamily: 'inherit' }}>查询</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {([['今天', 1], ['近7天', 7], ['近30天', 30]] as const).map(([label, n]) => (
            <button key={label} className="btnH" onClick={() => quickRange(n)}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#6a5a44', background: '#f5ecdd', border: '1px solid #e6dac4', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>
        {stats.length === 0 ? (
          <div style={{ fontSize: 13, color: '#a89878' }}>该时间段内暂无收获记录</div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: '#8a7a5c', marginBottom: 10 }}>共 <span style={{ fontWeight: 900, color: '#c1452e' }}>{statTotal}</span> 件</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {stats.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e6dac4', borderRadius: 9, padding: '7px 12px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', padding: '1px 6px', borderRadius: 7,
                    background: s.category === '召唤兽' ? '#c1452e' : s.category === '环装' ? '#8a4a12' : '#8a7a5c' }}>{s.category}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2a221a' }}>{catchLabel(s)}</span>
                  <span className="serif" style={{ fontSize: 14, fontWeight: 900, color: '#c1452e' }}>×{s.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {active && logs.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5a4a34', marginBottom: 10 }}>本次任务记录（{logs.length}）</div>
          <div style={{ background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.2fr 1fr 1.4fr', gap: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#a89878', borderBottom: '1px solid #ece2cf' }}>
              <div>类别</div><div>项目</div><div>坐标</div><div>时间</div>
            </div>
            {logs.map(l => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.2fr 1fr 1.4fr', gap: 8, padding: '9px 14px', fontSize: 12.5, color: '#3a3226', borderTop: '1px solid #f3ead9' }}>
                <div style={{ color: '#a89878' }}>{l.category}</div>
                <div>
                  <span style={{ fontWeight: 700 }}>{catchLabel(l)}</span>
                  {l.category === '召唤兽' && l.scene && <div style={{ fontSize: 10.5, color: '#a89878', marginTop: 1 }}>{l.scene}</div>}
                </div>
                <div>{l.coord_x == null && l.coord_y == null ? '—' : `${l.coord_x ?? '—'},${l.coord_y ?? '—'}`}</div>
                <div>{(l.current_time || '—').replace('T', ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>

    </div>
  )
}

export default function App() {
  const [data, setData] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<Mode>('global')
  const [daqu, setDaqu] = useState('')
  const [server, setServer] = useState('')
  const [openDaqu, setOpenDaqu] = useState(false)
  const [openServer, setOpenServer] = useState(false)
  const selRef = useRef<HTMLDivElement>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  useEffect(() => { authMe().then(setUser).catch(() => { /* ignore */ }).finally(() => setAuthReady(true)) }, [])
  const doLogout = async () => { await authLogout(); setUser(null) }
  const topbarRef = useRef<HTMLDivElement>(null)
  const [topbarH, setTopbarH] = useState(73)   // header 固定后占位高度（窄屏换行时自适应）

  useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const update = () => setTopbarH(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [data])   // topbar 在 data 加载后才渲染

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
  const isPrice = useLocation().pathname === '/'   // 区服选择器仅比价页显示

  const list = useMemo(() => data?.items || [], [data])

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

  return (
    <div>
      {/* TOP BAR（fixed 固定，不随页面滚动） */}
      <div ref={topbarRef} style={S.topbar}>
        <div style={S.topInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src="/logo.png" alt="狗脑发热" style={S.logoImg} />
            <div>
              <div className="serif" style={{ fontSize: 19, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>狗脑发热</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#c1452e', fontWeight: 700, marginTop: 4 }}>藏宝阁 · 全服比价</div>
            </div>
          </div>
          {/* 顶部导航（路由切换页面） */}
          <nav style={{ display: 'flex', gap: 4, marginLeft: 10 }}>
            {([['/', '比价'], ['/catch', '场景记录'], ['/goods', '物品价格'], ['/calc', '计算器']] as const).map(([to, label]) => (
              <NavLink key={to} to={to} end
                style={({ isActive }) => ({ padding: '8px 15px', fontSize: 14, fontWeight: 800, textDecoration: 'none', borderRadius: 8, color: isActive ? '#fff' : '#8a7a5c', background: isActive ? '#c1452e' : 'transparent' })}>{label}</NavLink>
            ))}
          </nav>
          {isPrice && <div ref={selRef} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', marginLeft: 'auto' }}>
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
          </div>}
          {/* 用户区：登录状态 / 登录注册入口 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: isPrice ? 0 : 'auto' }}>
            {user ? (
              <>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2a221a' }}>{user.nickname}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', padding: '2px 8px', borderRadius: 9,
                  background: user.channel === 'wechat' ? '#07c160' : user.channel === 'douyin' ? '#161823' : '#8a7a5c' }}>
                  {CHANNEL_LABEL[user.channel] || user.channel}
                </span>
                <button className="btnH" onClick={doLogout}
                  style={{ fontSize: 12, fontWeight: 700, color: '#8a7a5c', background: 'transparent', border: '1px solid #e0d2b8', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>退出</button>
              </>
            ) : (
              <NavLink to="/login"
                style={{ fontSize: 13, fontWeight: 800, textDecoration: 'none', color: '#a8351f', background: '#fbeee8', border: '1px solid #ecccc2', borderRadius: 8, padding: '7px 14px' }}>登录 / 注册</NavLink>
            )}
          </div>
        </div>
      </div>
      {/* fixed header 的占位（高度自适应换行） */}
      <div style={{ height: topbarH }} />

      {/* MAIN */}
      <div style={S.main}>
        <Routes>
          <Route path="/" element={<>
        {/* 全服 / 本服 切换 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'flex', background: '#f1e7d6', border: '1px solid #e6dac4', borderRadius: 9, padding: 3 }}>
            <button style={isGlobal ? segOn : segOff} onClick={() => { setMode('global'); setOpenDaqu(false); setOpenServer(false) }}>全服最低价</button>
            <button style={!isGlobal ? segOn : segOff} onClick={() => { setMode('server'); setOpenDaqu(false); setOpenServer(false) }}>本服 · {server}</button>
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
        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#c0b49c', lineHeight: 1.7 }}>
          狗脑发热 · 梦幻西游藏宝阁全服比价 · 数据更新于 {data.generated_at}<br />价格每日更新，仅供参考，点击「去购买」以藏宝阁实时为准
        </div>
          </>} />
          <Route path="/catch" element={
            !authReady ? <div style={{ textAlign: 'center', padding: '60px 0', color: '#b0a48c' }}>加载中…</div>
            : user ? <CatchLogView />
            : (
              <div style={{ maxWidth: 400, margin: '40px auto 0', background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 30, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#2a221a', marginBottom: 10 }}>场景记录需要登录后使用</div>
                <div style={{ fontSize: 13, color: '#a89878', marginBottom: 20 }}>每位用户的任务和记录相互独立</div>
                <Link to="/login" style={{ display: 'inline-block', textDecoration: 'none', fontSize: 14, fontWeight: 800, color: '#fff', background: '#c1452e', borderRadius: 8, padding: '11px 30px' }}>去登录 / 注册</Link>
              </div>
            )
          } />
          <Route path="/goods" element={
            !authReady ? <div style={{ textAlign: 'center', padding: '60px 0', color: '#b0a48c' }}>加载中…</div>
            : user ? <GoodsView regions={data.regions} initDaqu={daqu} initServer={server} />
            : (
              <div style={{ maxWidth: 400, margin: '40px auto 0', background: '#fdfaf3', border: '1px solid #ece2cf', borderRadius: 14, padding: 30, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#2a221a', marginBottom: 10 }}>物品价格需要登录后使用</div>
                <div style={{ fontSize: 13, color: '#a89878', marginBottom: 20 }}>每位用户按区服维护自己的价格标签</div>
                <Link to="/login" style={{ display: 'inline-block', textDecoration: 'none', fontSize: 14, fontWeight: 800, color: '#fff', background: '#c1452e', borderRadius: 8, padding: '11px 30px' }}>去登录 / 注册</Link>
              </div>
            )
          } />
          <Route path="/calc" element={<CalcView />} />
          <Route path="/login" element={<AuthView mode="login" onAuth={setUser} />} />
          <Route path="/register" element={<AuthView mode="register" onAuth={setUser} />} />
        </Routes>
      </div>
    </div>
  )
}
