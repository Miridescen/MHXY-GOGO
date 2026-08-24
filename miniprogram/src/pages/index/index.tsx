import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import logo from '../../images/logo.png'
import {
  fetchOverview, fmt, copyLink,
  type Overview, type Carry, type Equip, type EquipGroup
} from '../../utils/api'
import './index.scss'

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

// 装备某子组：选「类型(/特技)」→ 等级 × 开服年限
function EquipGroupView({ group, ages }: { group: EquipGroup; ages: { code: number; name: string }[] }) {
  const [sel, setSel] = useState<Record<string, string>>({})
  const cur: Record<string, string> = {}
  group.sel.forEach(s => { cur[s.name] = (sel[s.name] && s.options.indexOf(sel[s.name]) >= 0) ? sel[s.name] : s.options[0] })
  const cells = group.cells.filter(c => group.sel.every(s => (s.name === '类型' ? c.类型 : c.特技) === cur[s.name]))
  const matrix: Record<number, Record<number, typeof cells[number]>> = {}
  cells.forEach(c => { (matrix[c.等级] = matrix[c.等级] || {})[c.年限] = c })
  return (
    <View className='eqGroup'>
      <View className='eqLabel'>{group.label}</View>
      {group.sel.map(s => (
        <ScrollView scrollX className='chips' key={s.name}>
          {s.options.map(o => (
            <Text key={o} className={'chip ' + (o === cur[s.name] ? 'chipOn' : '')} onClick={() => setSel(p => ({ ...p, [s.name]: o }))}>{o}</Text>
          ))}
        </ScrollView>
      ))}
      <View className='matrixWrap'>
        <View className='matrix matrixFit'>
          <View className='mRow mHead'>
            <View className='mCell mFirst'>等级\开服</View>
            {ages.map(a => <View key={a.code} className='mCell'>{a.name}</View>)}
          </View>
          {group.levels.map(lv => (
            <View key={lv} className='mRow'>
              <View className='mCell mFirst mGender'>{lv}级</View>
              {ages.map(a => {
                const c = matrix[lv] ? matrix[lv][a.code] : undefined
                return (
                  <View key={a.code} className='mCell' onClick={() => c && copyLink(c.link)}>
                    {c
                      ? <View><Text className='price'>{fmt(c.price)}</Text><View className='loc'>{c.daqu}·{c.server} ↗</View></View>
                      : <Text className='dash'>—</Text>}
                  </View>
                )
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

function EquipView({ equip }: { equip: Equip }) {
  if (!equip || !equip.date || !equip.groups.length) return null
  return (
    <View className='block'>
      <View className='blockTitle'>装备全服最低价</View>
      <View className='tip'>👆 点价格可复制藏宝阁链接</View>
      {equip.groups.map(g => <EquipGroupView key={g.key} group={g} ages={equip.ages} />)}
    </View>
  )
}

export default function Index() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = (pull?: boolean) => {
    setLoading(true); setErr('')
    fetchOverview().then(d => {
      setOv(d)
      setLoading(false)
      if (pull) Taro.stopPullDownRefresh()
    }).catch(e => {
      setErr(e.message || '加载失败'); setLoading(false)
      if (pull) Taro.stopPullDownRefresh()
    })
  }
  useEffect(() => { load() }, [])
  usePullDownRefresh(() => load(true))

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
      </View>

      <View className='dateLine'>数据更新于 {ov.generated_at}</View>

      {/* 角色境界 + 锦衣 + 坐骑（全服最低价） */}
      {ov.roles && ov.roles.date && (
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
      <CarryView title='角色 + 七夕限量锦衣 · 全服最低价' items={ov.roleClothes.clothes} data={ov.roleClothes} />
      <CarryView title='角色 + 限量坐骑 · 全服最低价' items={ov.roleMounts.mounts} data={ov.roleMounts} />
      <EquipView equip={ov.equip} />
    </View>
  )
}
