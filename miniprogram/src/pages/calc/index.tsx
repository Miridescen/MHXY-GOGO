import { View, Text, Input, Picker } from '@tarojs/components'
import { useState } from 'react'
import { EXP_TABLE, XIULIAN, XIULIAN_TYPES, SHIMEN, BANGPAI, BANGPAI_SKILLS, PET_XIULIAN_CUM, petExpStep, type XlStep } from '../../utils/calcData'
import './index.scss'

const fmtNum = (n: number) => n.toLocaleString('en-US')
const fmtBig = (n: number) => {
  if (n >= 1e8) return `${fmtNum(n)}（约 ${(n / 1e8).toFixed(2)} 亿）`
  if (n >= 1e4) return `${fmtNum(n)}（约 ${(n / 1e4).toFixed(1)} 万）`
  return fmtNum(n)
}
const numOnly = (v: string) => v.replace(/\D/g, '').slice(0, 12)

export default function CalcPage() {
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
    setCgRes(`人物技能要求：${skill}\n携带金钱上限：${fmtBig(money)}`)
  }

  // 工具3: 修炼计算
  const [xlTypeIdx, setXlTypeIdx] = useState(0)
  const [xlFrom, setXlFrom] = useState(''); const [xlTo, setXlTo] = useState('')
  const [xlRes, setXlRes] = useState<string | null>(null)
  const calcXiulian = () => {
    const a = Number(xlFrom), b = Number(xlTo)
    if (xlFrom === '' || a < 0 || a > 25) { setXlRes('目前修炼等级输入有误，范围 0-25'); return }
    if (xlTo === '' || b < 0 || b > 25) { setXlRes('目标修炼等级输入有误，范围 0-25'); return }
    if (a >= b) { setXlRes('目标修炼等级需大于目前等级'); return }
    const steps = XIULIAN[XIULIAN_TYPES[xlTypeIdx][0]].slice(a, b)
    const sum = (f: (s: XlStep) => number) => steps.reduce((acc, s) => acc + f(s), 0)
    const mx = (f: (s: XlStep) => number) => Math.max(...steps.map(f))
    setXlRes([
      `所需修炼经验：${fmtNum(sum(s => s.exp))}`,
      `角色等级要求：${mx(s => s.min_grade)}`,
      `需要达到帮贡：${fmtNum(mx(s => s.bg))}`,
      `消耗资财：${fmtNum(sum(s => s.zc))}`,
      `消耗金钱：${fmtNum(sum(s => s.cash) / 10000)} 万`,
    ].join('\n'))
  }

  // 工具4: 师门技能计算
  const [smFrom, setSmFrom] = useState(''); const [smTo, setSmTo] = useState('')
  const [smRes, setSmRes] = useState<string | null>(null)
  const calcShimen = () => {
    const a = Number(smFrom), b = Number(smTo)
    if (smFrom === '' || a < 0 || a > 180) { setSmRes('当前等级输入有误，范围 0-180'); return }
    if (smTo === '' || b < 0 || b > 180) { setSmRes('到达等级输入有误，范围 0-180'); return }
    if (a >= b) { setSmRes('到达等级需大于当前等级'); return }
    const steps = SHIMEN.slice(a, b)
    setSmRes([
      `所需经验：${fmtBig(steps.reduce((s, x) => s + x[0], 0))}`,
      `所需金钱：${fmtBig(steps.reduce((s, x) => s + x[1], 0))}`,
    ].join('\n'))
  }

  // 工具5: 帮派技能计算
  const [bpIdx, setBpIdx] = useState(0)
  const [bpFrom, setBpFrom] = useState(''); const [bpTo, setBpTo] = useState('')
  const [bpRes, setBpRes] = useState<string | null>(null)
  const calcBangpai = () => {
    const [sid, , cap] = BANGPAI_SKILLS[bpIdx]
    const a = Number(bpFrom), b = Number(bpTo)
    if (bpFrom === '' || a < 0 || a > cap) { setBpRes(`目前等级输入有误，范围 0-${cap}`); return }
    if (bpTo === '' || b < 0 || b > cap) { setBpRes(`目标等级输入有误，范围 0-${cap}`); return }
    if (a >= b) { setBpRes('目标等级需大于目前等级'); return }
    const steps = BANGPAI[sid].slice(a, b)
    setBpRes([
      `消耗经验：${fmtBig(steps.reduce((s, x) => s + x[0], 0))}`,
      `消耗金钱：${fmtBig(steps.reduce((s, x) => s + x[1], 0))}`,
      `需要达到帮贡：${fmtNum(5 * b)}`,
      `消耗帮贡：${fmtNum((a + 1 + b) * (b - a) / 2)}`,
    ].join('\n'))
  }

  // 召唤兽修炼计算
  const [pxFrom, setPxFrom] = useState(''); const [pxTo, setPxTo] = useState('')
  const [pxRes, setPxRes] = useState<string | null>(null)
  const calcPetXiulian = () => {
    const a = Number(pxFrom), b = Number(pxTo)
    if (pxFrom === '' || a < 0 || a > 25) { setPxRes('目前修炼等级输入有误，范围 0-25'); return }
    if (pxTo === '' || b < 0 || b > 25 || b < a) { setPxRes('目标修炼等级输入有误，需不小于目前等级'); return }
    const exp = PET_XIULIAN_CUM[b] - PET_XIULIAN_CUM[a]
    setPxRes([
      `总经验：${fmtNum(exp)}`,
      `人物等级要求：${Math.max(b * 5 + 20, 65)}`,
      `要跑100环数量：${fmtNum(Math.ceil(exp / 760))}`,
      `需要修炼果数量：${fmtNum(Math.ceil(exp / 5))}`,
    ].join('\n'))
  }

  // 召唤兽升级计算
  const [psFrom, setPsFrom] = useState(''); const [psTo, setPsTo] = useState('')
  const [psRes, setPsRes] = useState<string | null>(null)
  const calcPetShengji = () => {
    const a = Number(psFrom), b = Number(psTo)
    if (psFrom === '' || a < 1 || a > 180) { setPsRes('当前等级输入有误，范围 1-180'); return }
    if (psTo === '' || b < 1 || b > 180) { setPsRes('目标等级输入有误，范围 1-180'); return }
    if (a >= b) { setPsRes('目标等级需大于当前等级'); return }
    let exp = 0
    for (let i = a; i < b; i++) exp += petExpStep(i)
    setPsRes(`需要经验：${fmtBig(exp)}`)
  }

  return (
    <View className='page'>
      <View className='tip'>数据与算法迁自官方梦幻工具箱，本地即时计算</View>

      {/* 经验换算 */}
      <View className='cardBox'>
        <View className='cardTitle'>经验换算</View>
        <View className='fLabel'>等级换算经验</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='当前等级' value={lvFrom} onInput={e => setLvFrom(numOnly(e.detail.value))} />
          <Text className='arrow'>→</Text>
          <Input className='numInput' type='number' placeholder='目标等级' value={lvTo} onInput={e => setLvTo(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcLvToExp}>查询</View>
        </View>
        {lvRes && <View className='resBox'>{lvRes}</View>}
        <View className='fLabel'>经验换算等级</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='当前经验' value={expVal} onInput={e => setExpVal(numOnly(e.detail.value))} />
          <Input className='numInput short' type='number' placeholder='当前等级' value={expLv} onInput={e => setExpLv(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcExpToLv}>查询</View>
        </View>
        {expRes && <View className='resBox'>{expRes}</View>}
      </View>

      {/* 常规计算 */}
      <View className='cardBox'>
        <View className='cardTitle'>常规计算</View>
        <View className='fLabel'>人物等级</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='0-175' value={cgLv} onInput={e => setCgLv(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcChanggui}>查询</View>
        </View>
        {cgRes && <View className='resBox'>{cgRes}</View>}
      </View>

      {/* 修炼计算 */}
      <View className='cardBox'>
        <View className='cardTitle'>修炼计算</View>
        <View className='fLabel'>类型</View>
        <Picker mode='selector' range={XIULIAN_TYPES.map(t => t[1])} value={xlTypeIdx} onChange={e => setXlTypeIdx(Number(e.detail.value))}>
          <View className='pickerBox'>{XIULIAN_TYPES[xlTypeIdx][1]} <Text className='caret'>▾</Text></View>
        </Picker>
        <View className='fLabel'>修炼等级范围</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='目前(0-25)' value={xlFrom} onInput={e => setXlFrom(numOnly(e.detail.value))} />
          <Text className='arrow'>→</Text>
          <Input className='numInput' type='number' placeholder='目标(0-25)' value={xlTo} onInput={e => setXlTo(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcXiulian}>查询</View>
        </View>
        {xlRes && <View className='resBox'>{xlRes}</View>}
      </View>

      {/* 师门技能计算 */}
      <View className='cardBox'>
        <View className='cardTitle'>师门技能计算</View>
        <View className='fLabel'>技能等级范围（0-180）</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='当前等级' value={smFrom} onInput={e => setSmFrom(numOnly(e.detail.value))} />
          <Text className='arrow'>→</Text>
          <Input className='numInput' type='number' placeholder='到达等级' value={smTo} onInput={e => setSmTo(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcShimen}>查询</View>
        </View>
        {smRes && <View className='resBox'>{smRes}</View>}
      </View>

      {/* 帮派技能计算 */}
      <View className='cardBox'>
        <View className='cardTitle'>帮派技能计算</View>
        <View className='fLabel'>技能</View>
        <Picker mode='selector' range={BANGPAI_SKILLS.map(s => `${s[1]}（上限 ${s[2]}）`)} value={bpIdx}
          onChange={e => { setBpIdx(Number(e.detail.value)); setBpRes(null) }}>
          <View className='pickerBox'>{BANGPAI_SKILLS[bpIdx][1]}（上限 {BANGPAI_SKILLS[bpIdx][2]}） <Text className='caret'>▾</Text></View>
        </Picker>
        <View className='fLabel'>技能等级范围</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='目前等级' value={bpFrom} onInput={e => setBpFrom(numOnly(e.detail.value))} />
          <Text className='arrow'>→</Text>
          <Input className='numInput' type='number' placeholder='目标等级' value={bpTo} onInput={e => setBpTo(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcBangpai}>查询</View>
        </View>
        {bpRes && <View className='resBox'>{bpRes}</View>}
      </View>

      {/* 召唤兽修炼计算 */}
      <View className='cardBox'>
        <View className='cardTitle'>召唤兽修炼计算</View>
        <View className='fLabel'>修炼等级范围（0-25）</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='目前等级' value={pxFrom} onInput={e => setPxFrom(numOnly(e.detail.value))} />
          <Text className='arrow'>→</Text>
          <Input className='numInput' type='number' placeholder='目标等级' value={pxTo} onInput={e => setPxTo(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcPetXiulian}>查询</View>
        </View>
        {pxRes && <View className='resBox'>{pxRes}</View>}
      </View>

      {/* 召唤兽升级计算 */}
      <View className='cardBox'>
        <View className='cardTitle'>召唤兽升级计算</View>
        <View className='fLabel'>召唤兽等级范围（1-180）</View>
        <View className='row'>
          <Input className='numInput' type='number' placeholder='当前等级' value={psFrom} onInput={e => setPsFrom(numOnly(e.detail.value))} />
          <Text className='arrow'>→</Text>
          <Input className='numInput' type='number' placeholder='目标等级' value={psTo} onInput={e => setPsTo(numOnly(e.detail.value))} />
          <View className='qBtn' onClick={calcPetShengji}>查询</View>
        </View>
        {psRes && <View className='resBox'>{psRes}</View>}
      </View>
    </View>
  )
}
