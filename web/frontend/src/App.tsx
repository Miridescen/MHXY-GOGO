import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { fetchOverview, fmt, serveridOf, serverCell, type Overview, type Item, type Region } from './api'

const CBG = 'https://xyq.cbg.163.com/'
const CATS = ['全部', '装备', '宝宝', '灵饰', '内丹', '锦衣', '材料']
const SEL_KEY = '__mhxy_sel'   // localStorage: 记住用户选的区服/模式

const S: Record<string, CSSProperties> = {
  topbar: { position: 'sticky', top: 0, zIndex: 40, background: '#faf6eecc', backdropFilter: 'saturate(1.2) blur(8px)', borderBottom: '1px solid #ece2cf' },
  topInner: { maxWidth: 1140, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  logoBox: { width: 42, height: 42, borderRadius: 9, background: '#c1452e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 23, color: '#faf0e0', boxShadow: 'inset 0 0 0 2px rgba(255,240,220,.35),0 3px 10px rgba(193,69,46,.3)' },
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

export default function App() {
  const [data, setData] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<Mode>('global')
  const [daqu, setDaqu] = useState('')
  const [server, setServer] = useState('')
  const [cat, setCat] = useState('全部')
  const [q, setQ] = useState('')
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

  const list = useMemo(() => (data?.items || []).filter(it => (cat === '全部' || it.cat === cat) && (!q || it.name.indexOf(q) !== -1)), [data, cat, q])

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
  const resultMeta = `共 ${rows.length} 件物品 · ${isGlobal ? '展示每件商品在所有区服的最低价' : `展示 ${server} 在售价格，并提示全服最低`}`

  return (
    <div>
      {/* TOP BAR */}
      <div style={S.topbar}>
        <div style={S.topInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 'auto' }}>
            <div className="serif" style={S.logoBox}>狗</div>
            <div>
              <div className="serif" style={{ fontSize: 19, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>狗脑发热</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#c1452e', fontWeight: 700, marginTop: 4 }}>藏宝阁 · 全服比价行</div>
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

        {/* chips */}
        <div style={{ display: 'flex', gap: 9, marginBottom: 14, flexWrap: 'wrap' }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', ...(c === cat ? { color: '#fff', background: '#c1452e' } : { color: '#6a5a44', background: '#f5ecdd' }) }}>{c}</button>
          ))}
        </div>

        {/* result meta */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 12.5, color: '#8a7a5c' }}>{resultMeta}</div>
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
      </div>
    </div>
  )
}
