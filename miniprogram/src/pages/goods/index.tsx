import { View, Text, Input, Picker, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchOverview, fetchGoods, fetchGoodsPrices, saveGoodsPrices,
  addCustomGood, deleteCustomGood, addGoodsCategory, deleteGoodsCategory, ensureLogin,
  type Region, type GoodsCategory, type AuthUser
} from '../../utils/api'
import './index.scss'

const numOnly = (v: string) => v.replace(/[^\d.]/g, '').slice(0, 10)

export default function GoodsPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [regionIdx, setRegionIdx] = useState(0)
  const [serverIdx, setServerIdx] = useState(0)
  const [cats, setCats] = useState<GoodsCategory[]>([])
  const [cat, setCat] = useState('')
  const [vals, setVals] = useState<Record<number, string>>({})       // 当前编辑值
  const [loaded, setLoaded] = useState<Record<number, string>>({})   // 服务端已存值
  const [busy, setBusy] = useState(false)

  const toast = (title: string, icon: 'none' | 'success' = 'none') => Taro.showToast({ title, icon })

  const region = regions[regionIdx]
  const serverList = region?.servers || []
  const curServer = serverList[serverIdx]
  const sid = curServer ? curServer.serverid : null
  const daquNames = useMemo(() => regions.map(r => r.daqu), [regions])
  const serverNames = useMemo(() => serverList.map(s => s.name), [serverList])

  const reloadGoods = (keepCat?: string) => fetchGoods().then(c => {
    setCats(c)
    const want = keepCat ?? cat
    setCat(c.some(x => x.name === want) ? want : (c[0]?.name || ''))
  }).catch(() => { /* ignore */ })

  // 登录 → 拉区服 + 物品库
  useEffect(() => {
    ensureLogin().then(u => {
      setUser(u)
      if (u) {
        fetchOverview().then(d => setRegions(d.regions)).catch(() => { /* ignore */ })
        reloadGoods()
      }
    }).finally(() => setAuthReady(true))
  }, [])

  // 区服变化 → 拉该服已存价格
  useEffect(() => {
    if (sid == null) return
    fetchGoodsPrices(sid).then(p => {
      const m: Record<number, string> = {}
      Object.keys(p).forEach(k => { m[Number(k)] = String(p[k]) })
      setVals(m); setLoaded(m)
    }).catch(() => { /* ignore */ })
  }, [sid])

  const onPickChange = (e: any) => { const [ri, si] = e.detail.value; setRegionIdx(ri); setServerIdx(si) }
  const onColumnChange = (e: any) => {
    const { column, value } = e.detail
    if (column === 0) { setRegionIdx(value); setServerIdx(0) }
    else setServerIdx(value)
  }

  const doAddCategory = () => {
    Taro.showModal({ title: '新增分类', editable: true, placeholderText: '分类名，如 兽决' } as any).then((r: any) => {
      if (!r.confirm) return
      const n = (r.content || '').trim()
      if (!n) return
      addGoodsCategory(n).then(() => reloadGoods(n)).then(() => toast(`已添加分类「${n}」`, 'success'))
        .catch(e => toast((e as Error).message))
    })
  }
  const doDelCategory = (n: string) => {
    Taro.showModal({ title: '删除分类', content: `删除「${n}」？该分类下你添加的物品及价格会一并删除` }).then(r => {
      if (!r.confirm) return
      deleteGoodsCategory(n).then(() => reloadGoods('')).then(() => toast(`已删除分类「${n}」`, 'success'))
        .catch(e => toast((e as Error).message))
    })
  }
  const doAddGood = () => {
    if (!cat) return
    Taro.showModal({ title: `添加物品到「${cat}」`, editable: true, placeholderText: '如 魔兽要诀' } as any).then((r: any) => {
      if (!r.confirm) return
      const n = (r.content || '').trim()
      if (!n) return
      addCustomGood(n, cat).then(() => reloadGoods()).then(() => toast(`已添加「${n}」`, 'success'))
        .catch(e => toast((e as Error).message))
    })
  }
  const doDelGood = (id: number, n: string) => {
    Taro.showModal({ title: '删除物品', content: `删除「${n}」？其价格标签会一并删除` }).then(r => {
      if (!r.confirm) return
      deleteCustomGood(id).then(() => {
        const v = { ...vals }; delete v[id]; setVals(v)
        const o = { ...loaded }; delete o[id]; setLoaded(o)
        return reloadGoods()
      }).then(() => toast(`已删除「${n}」`, 'success')).catch(e => toast((e as Error).message))
    })
  }

  const save = async () => {
    if (sid == null) return
    const ids = new Set([...Object.keys(vals), ...Object.keys(loaded)].map(Number))
    const changes: { goods_id: number; price: number | null }[] = []
    ids.forEach(id => {
      const v = (vals[id] ?? '').trim(), o = (loaded[id] ?? '').trim()
      if (v === o) return
      changes.push({ goods_id: id, price: v === '' ? null : Number(v) })
    })
    if (!changes.length) { toast('没有修改'); return }
    if (changes.some(c => c.price != null && !isFinite(c.price))) { toast('有价格不是有效数字'); return }
    setBusy(true)
    try {
      const r = await saveGoodsPrices({ serverid: sid, server_name: curServer.name, area_name: region.daqu, prices: changes })
      setLoaded({ ...vals })
      toast(`已保存 ${r.saved} 项${r.cleared ? `，清除 ${r.cleared} 项` : ''}`, 'success')
    } catch (e) { toast('保存失败：' + (e as Error).message) }
    setBusy(false)
  }

  const curGoods = cats.find(c => c.name === cat)?.goods || []
  const pricedCount = Object.keys(vals).filter(k => (vals[Number(k)] ?? '').trim() !== '').length

  if (!authReady) return <View className='page'><View className='cardBox loginTip'>登录中…</View></View>
  if (!user) return (
    <View className='page'>
      <View className='cardBox loginTip'>
        <View className='loginTitle'>自动登录失败</View>
        <View className='loginDesc'>物品价格需登录后使用（每位用户按区服维护自己的价格标签）</View>
      </View>
    </View>
  )

  return (
    <View className='page'>
      {/* 区服 + 保存 */}
      <View className='cardBox'>
        <View className='topRow'>
          <Picker mode='multiSelector' range={[daquNames, serverNames]} value={[regionIdx, serverIdx]}
            onColumnChange={onColumnChange} onChange={onPickChange}>
            <View className='pickerBox'>{region ? region.daqu : ''} · {curServer ? curServer.name : ''} <Text className='caret'>▾</Text></View>
          </Picker>
          <View className={'saveBtn ' + (busy ? 'off' : '')} onClick={() => !busy && save()}>{busy ? '保存中…' : '保存'}</View>
        </View>
        <View className='hint'>价格与当前区服绑定，单位自定（建议统一用「万」）；已设 {pricedCount} 项。留空并保存 = 清除该价格。</View>
      </View>

      {/* 分类 */}
      <ScrollView scrollX className='catScroll'>
        {cats.map(c => (
          <View key={c.name} className={'catChip ' + (c.name === cat ? 'catOn' : '')} onClick={() => setCat(c.name)}>
            <Text>{c.name}（{c.goods.length}）</Text>
            {c.custom && <Text className='delX' onClick={e => { e.stopPropagation(); doDelCategory(c.name) }}>×</Text>}
          </View>
        ))}
        <View className='catChip catAdd' onClick={doAddCategory}>＋ 新分类</View>
      </ScrollView>

      {/* 物品 + 价格输入 */}
      <View className='goodsGrid'>
        {curGoods.map(g => (
          <View key={g.id} className='goodsCard'>
            {g.custom && <Text className='goodX' onClick={() => doDelGood(g.id, g.name)}>×</Text>}
            <Text className='goodName'>{g.name}</Text>
            <Input className='goodInput' type='digit' placeholder='未设置' value={vals[g.id] ?? ''}
              onInput={e => setVals({ ...vals, [g.id]: numOnly(e.detail.value) })} />
          </View>
        ))}
        {cat && (
          <View className='goodsCard goodsAdd' onClick={doAddGood}>
            <Text className='addGoodText'>＋ 添加物品</Text>
            <Text className='addGoodSub'>到「{cat}」</Text>
          </View>
        )}
      </View>
    </View>
  )
}
