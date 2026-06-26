import { View, Text, Image, ScrollView, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import logo from '../../images/logo.png'
import {
  fetchOverview, fmt, copyLink,
  type Overview, type Carry
} from '../../utils/api'
import { showRewardAd } from '../../utils/ad'
import './index.scss'

const CATS = ['全部', '装备', '宝宝', '灵饰', '内丹', '锦衣', '材料']
const SEL_KEY = 'mhxy_sel'

// 角色携带物（锦衣/坐骑）通用：选物品 → 看 性别×等级 矩阵
function CarryView({ title, items, data }: { title: string; items: string[]; data: Carry }) {
  const [sel, setSel] = useState('')
  if (!data || !data.date || !items.length) return null
  const cur = sel && data.matrix[sel] ? sel : items[0]
  const m = data.matrix[cur] || {}
  return (
    <View className='block'>
      <View className='blockTitle'>{title}</View>
      <View className='tip'>👆 点价格可复制藏宝阁链接，去藏宝阁查看</View>
      <ScrollView scrollX className='chips'>
        {items.map(c => (
          <Text key={c} className={'chip ' + (c === cur ? 'chipOn' : '')} onClick={() => setSel(c)}>{c}</Text>
        ))}
      </ScrollView>
      <ScrollView scrollX className='matrixWrap'>
        <View className='matrix'>
          <View className='mRow mHead'>
            <View className='mCell mFirst'>性别\等级</View>
            {data.levels.map(l => <View key={l} className='mCell'>{l}</View>)}
          </View>
          {data.genders.map(g => (
            <View key={g} className='mRow'>
              <View className='mCell mFirst mGender'>{g}号</View>
              {data.levels.map(l => {
                const c = m[g] ? m[g][l] : undefined
                return (
                  <View key={l} className='mCell' onClick={() => c && copyLink(c.link)}>
                    {c
                      ? <View><Text className='price'>{fmt(c.price)}</Text><View className='loc'>{c.daqu}·{c.server} ↗</View></View>
                      : <Text className='dash'>—</Text>}
                  </View>
                )
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

export default function Index() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'global' | 'server'>('global')
  const [regionIdx, setRegionIdx] = useState(0)
  const [serverIdx, setServerIdx] = useState(0)
  const [cat, setCat] = useState('全部')
  const [unlocked, setUnlocked] = useState(false)

  // 每天看一次广告解锁，当天免广告
  const today = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() })()
  useEffect(() => {
    if (Taro.getStorageSync('mhxy_unlock_date') === today) setUnlocked(true)
  }, [])
  const onUnlock = () => {
    showRewardAd().then(ok => {
      if (ok) { setUnlocked(true); Taro.setStorageSync('mhxy_unlock_date', today) }
      else Taro.showToast({ title: '需看完广告才能解锁哦', icon: 'none' })
    })
  }

  const load = (pull?: boolean) => {
    setLoading(true); setErr('')
    fetchOverview().then(d => {
      setOv(d)
      // 恢复上次选择
      try {
        const saved = Taro.getStorageSync(SEL_KEY)
        if (saved && saved.daqu) {
          const ri = d.regions.findIndex(r => r.daqu === saved.daqu)
          if (ri >= 0) {
            const si = d.regions[ri].servers.findIndex(s => s.name === saved.server)
            setRegionIdx(ri); setServerIdx(si >= 0 ? si : 0)
            if (saved.mode === 'global' || saved.mode === 'server') setMode(saved.mode)
          }
        }
      } catch (e) { /* ignore */ }
      setLoading(false)
      if (pull) Taro.stopPullDownRefresh()
    }).catch(e => {
      setErr(e.message || '加载失败'); setLoading(false)
      if (pull) Taro.stopPullDownRefresh()
    })
  }
  useEffect(() => { load() }, [])
  usePullDownRefresh(() => load(true))

  const region = ov?.regions[regionIdx]
  const serverList = region?.servers || []
  const curServer = serverList[serverIdx]
  const curSid = curServer ? curServer.serverid : null
  const isGlobal = mode === 'global'

  const daquNames = useMemo(() => (ov?.regions || []).map(r => r.daqu), [ov])
  const serverNames = useMemo(() => serverList.map(s => s.name), [serverList])

  const persist = (ri: number, si: number, md: string) => {
    const r = ov?.regions[ri]
    const s = r?.servers[si]
    if (r && s) Taro.setStorageSync(SEL_KEY, { daqu: r.daqu, server: s.name, mode: md })
  }

  const onColumnChange = (e: any) => {
    const { column, value } = e.detail
    if (column === 0) { setRegionIdx(value); setServerIdx(0) }
    else setServerIdx(value)
  }
  const onPickChange = (e: any) => {
    const [ri, si] = e.detail.value
    setRegionIdx(ri); setServerIdx(si); setMode('server'); persist(ri, si, 'server')
  }
  const switchMode = (md: 'global' | 'server') => { setMode(md); persist(regionIdx, serverIdx, md) }

  const list = useMemo(() => (ov?.items || []).filter(
    it => cat === '全部' || it.cat === cat
  ), [ov, cat])

  if (loading) return <View className='center'>加载中…</View>
  if (err) return <View className='center err'>数据加载失败：{err}</View>
  if (!ov) return <View className='center'>暂无数据</View>

  return (
    <View className='page'>
      {/* 头部 */}
      <View className='header'>
        <Image className='logo' src={logo} mode='aspectFill' />
        <View className='brand'>
          <Text className='brandName'>狗脑发热</Text>
          <Text className='brandSub'>藏宝阁 · 全服比价</Text>
        </View>
        <Picker mode='multiSelector' range={[daquNames, serverNames]} value={[regionIdx, serverIdx]}
          onColumnChange={onColumnChange} onChange={onPickChange}>
          <View className='regionBtn'>
            {region ? region.daqu : ''} · {curServer ? curServer.name : ''} <Text className='caret'>▾</Text>
          </View>
        </Picker>
      </View>

      {/* 广告解锁门：没解锁只显示这块 */}
      {!unlocked && (
        <View className='gate'>
          <Image className='gateLogo' src={logo} mode='aspectFill' />
          <View className='gateTitle'>看一段广告，解锁全服比价</View>
          <View className='gateDesc'>召唤兽 · 角色 · 锦衣 · 坐骑 全服最低价，每日更新</View>
          <View className='gateBtn' onClick={onUnlock}>▶ 看广告解锁</View>
          <View className='gateTip'>每天解锁一次，当天内免广告</View>
        </View>
      )}

      {unlocked && (<View>
      {/* 模式切换 */}
      <View className='seg'>
        <Text className={'segBtn ' + (isGlobal ? 'segOn' : '')} onClick={() => switchMode('global')}>全服最低价</Text>
        <Text className={'segBtn ' + (!isGlobal ? 'segOn' : '')} onClick={() => switchMode('server')}>本服 · {curServer ? curServer.name : ''}</Text>
      </View>

      <View className='dateLine'>数据更新于 {ov.generated_at}</View>

      {/* 全服模式：角色境界 + 锦衣 + 坐骑 */}
      {isGlobal && ov.roles && ov.roles.date && (
        <View className='block'>
          <View className='blockTitle'>角色全服最低价 · 按开服年限</View>
          <View className='tip'>👆 点价格可复制藏宝阁链接，去藏宝阁查看</View>
          <View className='matrixWrap'>
            <View className='matrix matrixFit'>
              <View className='mRow mHead'>
                <View className='mCell mFirst'>类别</View>
                {ov.roles.ages.map(a => <View key={a.code} className='mCell'>{a.name}</View>)}
              </View>
              {ov.roles.categories.map(c => (
                <View key={c} className='mRow'>
                  <View className='mCell mFirst mGender'>{c}</View>
                  {ov.roles.ages.map(a => {
                    const cell = ov.roles.matrix[c] ? ov.roles.matrix[c][String(a.code)] : undefined
                    return (
                      <View key={a.code} className='mCell' onClick={() => cell && copyLink(cell.link)}>
                        {cell
                          ? <View><Text className='price'>{fmt(cell.price)}</Text><View className='loc'>{cell.daqu}·{cell.server} ↗</View></View>
                          : <Text className='dash'>—</Text>}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
      {isGlobal && <CarryView title='角色 + 七夕限量锦衣 · 全服最低价' items={ov.roleClothes.clothes} data={ov.roleClothes} />}
      {isGlobal && <CarryView title='角色 + 限量坐骑 · 全服最低价' items={ov.roleMounts.mounts} data={ov.roleMounts} />}

      {/* 分类 */}
      <ScrollView scrollX className='chips'>
        {CATS.map(c => (
          <Text key={c} className={'chip ' + (c === cat ? 'chipOn' : '')} onClick={() => setCat(c)}>{c}</Text>
        ))}
      </ScrollView>

      <View className='meta'>
        共 {list.length} 件物品 · {isGlobal ? '展示每件在所有区服的最低价' : `展示 ${curServer ? curServer.name : ''} 在售价，并提示全服最低`}
      </View>

      {/* 物品列表 */}
      {list.length === 0
        ? <View className='center sub'>没有匹配的物品，换个关键词或分类</View>
        : list.map(it => {
          const here = !isGlobal && curSid != null ? it.prices[String(curSid)] : null
          const mainPrice = isGlobal ? it.low.price : (here ? here.price : null)
          const link = isGlobal ? it.low.link : (here ? here.link : it.low.link)
          const gLoc = `${it.low.daqu} · ${it.low.server}`
          const cheaper = !isGlobal && !!here && it.low.price < here.price
          return (
            <View key={it.id} className='card' onClick={() => copyLink(link)}>
              <View className='cardTop'>
                <View className='icon' style={{ background: it.iconBg, color: it.iconFg }}>{it.icon}</View>
                <View className='cardMid'>
                  <View className='nameRow'>
                    <Text className='name'>{it.name}</Text>
                    {isGlobal && <Text className='badge'>全服最低</Text>}
                    {!isGlobal && here && !cheaper && <Text className='badge'>全服最低</Text>}
                  </View>
                  <Text className='cardSub'>{isGlobal ? gLoc : it.cat}</Text>
                </View>
                <View className='cardPrice'>
                  <Text className='bigPrice'>{mainPrice != null ? fmt(mainPrice) : '—'}</Text>
                  {!isGlobal && !here && <Text className='hint'>本服无在售</Text>}
                </View>
              </View>
              {!isGlobal && (
                <View className='glow'>
                  全服最低 <Text className='glowPrice'>{fmt(it.low.price)}</Text>
                  <Text className='glowLoc'>· {gLoc}</Text>
                </View>
              )}
              <View className='copyHint'>点击复制藏宝阁链接 ↗</View>
            </View>
          )
        })}

      <View className='foot'>
        狗脑发热 · 梦幻西游藏宝阁全服比价{'\n'}价格每日更新，仅供参考，以藏宝阁实时为准
      </View>
      </View>)}
    </View>
  )
}
