import { View, Text, Input, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { fetchCatchPrices, setCatchPrice, setMhbRate, ensureLogin, type PriceItem, type AuthUser } from '../../utils/api'
import './index.scss'

const numOnly = (v: string) => v.replace(/[^\d.]/g, '').slice(0, 12)

export default function GoodsPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [rate, setRate] = useState<number | null>(null)
  const [rateInput, setRateInput] = useState('')
  const [items, setItems] = useState<PriceItem[]>([])
  const [selIdx, setSelIdx] = useState(0)
  const [priceInput, setPriceInput] = useState('')

  const toast = (t: string, icon: 'none' | 'success' = 'none') => Taro.showToast({ title: t, icon })
  const load = () => fetchCatchPrices().then(d => { setRate(d.rate); setRateInput(d.rate == null ? '' : String(d.rate)); setItems(d.items) }).catch(() => { /* ignore */ })
  useEffect(() => { ensureLogin().then(u => { setUser(u); if (u) load() }).finally(() => setAuthReady(true)) }, [])
  void rate

  const unpriced = items.filter(i => i.price == null)
  const priced = items.filter(i => i.price != null)

  const saveRate = () => {
    const v = rateInput.trim()
    setMhbRate(v === '' ? null : Number(v)).then(() => { toast('汇率已保存', 'success'); load() }).catch(e => toast((e as Error).message))
  }
  const addPrice = () => {
    const it = unpriced[selIdx]
    if (!it) { toast('没有可添加的物品'); return }
    const p = Number(priceInput)
    if (priceInput === '' || !isFinite(p) || p < 0) { toast('请输入有效价格'); return }
    setCatchPrice({ category: it.category, name: it.name, sub_type: it.sub_type, price: p }).then(() => {
      setPriceInput(''); setSelIdx(0); load(); toast('已设价', 'success')
    }).catch(e => toast((e as Error).message))
  }
  const editPrice = (it: PriceItem) => {
    Taro.showModal({ title: `${it.label} 价格(万)`, editable: true, placeholderText: '万梦幻币', content: it.price == null ? '' : String(it.price) } as any).then((r: any) => {
      if (!r.confirm) return
      const s = (r.content || '').trim()
      if (s === '') return
      const p = Number(s)
      if (!isFinite(p) || p < 0) { toast('价格无效'); return }
      setCatchPrice({ category: it.category, name: it.name, sub_type: it.sub_type, price: p }).then(() => { load(); toast('已改', 'success') }).catch(e => toast((e as Error).message))
    })
  }
  const delPrice = (it: PriceItem) => {
    Taro.showModal({ title: '删除价格', content: `删除「${it.label}」的价格？` }).then(r => {
      if (!r.confirm) return
      setCatchPrice({ category: it.category, name: it.name, sub_type: it.sub_type, price: null }).then(() => { load(); toast('已删', 'success') }).catch(e => toast((e as Error).message))
    })
  }

  if (!authReady) return <View className='page'><View className='cardBox loginTip'>登录中…</View></View>
  if (!user) return (
    <View className='page'><View className='cardBox loginTip'>
      <View className='loginTitle'>自动登录失败</View>
      <View className='loginDesc'>物品价格需登录后使用</View>
    </View></View>
  )

  return (
    <View className='page'>
      {/* 汇率 */}
      <View className='cardBox'>
        <View className='fLabel'>梦幻币兑换比例</View>
        <View className='rateRow'>
          <Text className='rateHint'>每1万梦幻币=</Text>
          <Input className='numInput rateInput' type='digit' placeholder='如 0.28' value={rateInput} onInput={e => setRateInput(numOnly(e.detail.value))} />
          <Text className='rateHint'>元</Text>
          <View className='miniBtn' onClick={saveRate}>保存</View>
        </View>
        <View className='tip2'>用于「场景记录·收益查询」折算人民币</View>
      </View>

      {/* 添加 */}
      <View className='cardBox'>
        <View className='fLabel'>给抓到的物品定价（万梦幻币）</View>
        {items.length === 0 ? (
          <Text className='tip2'>还没有抓取记录，去「场景记录」抓到东西后这里可定价</Text>
        ) : unpriced.length === 0 ? (
          <Text className='doneTip'>抓到过的物品都已定价 ✓（下面可改）</Text>
        ) : (
          <View>
            <Picker mode='selector' range={unpriced.map(i => `${i.label}（抓到${i.count}）`)} value={selIdx} onChange={e => setSelIdx(Number(e.detail.value))}>
              <View className='pickerBox'>{unpriced[selIdx] ? unpriced[selIdx].label : '选择物品'} <Text className='caret'>▾</Text></View>
            </Picker>
            <View className='addRow'>
              <Input className='numInput' type='digit' placeholder='价格(万)' value={priceInput} onInput={e => setPriceInput(numOnly(e.detail.value))} />
              <View className='miniBtn green' onClick={addPrice}>添加</View>
            </View>
          </View>
        )}
      </View>

      {/* 已定价 */}
      <View className='cardBox'>
        <View className='barTitle'>已定价（{priced.length}）</View>
        {priced.length === 0 ? <Text className='tip2'>还没定价</Text> : priced.map(it => (
          <View key={`${it.category}|${it.name}|${it.sub_type}`} className='priceRow'>
            <Text className={'pTag ' + (it.category === '召唤兽' ? 'tPet' : it.category === '环装' ? 'tRing' : 'tOther')}>{it.category}</Text>
            <Text className='pName'>{it.label}</Text>
            <Text className='pVal'>{it.price}万</Text>
            <Text className='renX' onClick={() => editPrice(it)}>✎</Text>
            <Text className='delX' onClick={() => delPrice(it)}>×</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
