import { View, Text, Input, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  fetchScenePets, fetchCatchTasks, startCatchTask, endCatchTask, fetchCatchLogs, addCatchLog, ensureLogin,
  type SceneGroup, type CatchTask, type CatchLog, type AuthUser
} from '../../utils/api'
import './index.scss'

const RING_LEVELS = ['60', '70', '80']
const RING_SUBS = ['武器', '装备'] as const

// 'YYYY-MM-DDTHH:mm'（本地时区，与网站一致）
function nowLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const fmtDur = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const catchLabel = (c: { category: string; name: string; sub_type: string }) =>
  c.category === '环装' ? `${c.name}环·${c.sub_type}` : c.category === '告密' ? '告密' : c.name

export default function CatchPage() {
  const [category, setCategory] = useState<'召唤兽' | '环装' | '告密'>('召唤兽')
  const [scenes, setScenes] = useState<SceneGroup[]>([])
  const [sceneIdx, setSceneIdx] = useState(0)
  const [petIdx, setPetIdx] = useState(0)
  const [ringLvIdx, setRingLvIdx] = useState(0)
  const [ringSubIdx, setRingSubIdx] = useState(0)
  const [coordX, setCoordX] = useState('')
  const [coordY, setCoordY] = useState('')
  const [curTime, setCurTime] = useState(nowLocal())
  const [busy, setBusy] = useState(false)
  const [tasks, setTasks] = useState<CatchTask[]>([])
  const [logs, setLogs] = useState<CatchLog[]>([])
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)

  // 进行中的任务 = 最近一条未结束的（服务端为准，刷新/换设备不丢）
  const active = tasks.find(t => !t.end_time) || null
  const curScene = scenes[sceneIdx] || null
  const curPets = curScene ? curScene.pets : []

  const loadTasks = () => fetchCatchTasks().then(setTasks).catch(() => { /* ignore */ })
  // 静默登录（wx.login/tt.login 自动创建微信/抖音渠道账号）→ 再拉取本人任务
  useEffect(() => {
    ensureLogin().then(u => { setUser(u); if (u) loadTasks() }).finally(() => setAuthReady(true))
  }, [])
  useEffect(() => { fetchScenePets().then(setScenes).catch(() => { /* ignore */ }) }, [])
  useEffect(() => {
    if (active) fetchCatchLogs(active.id).then(setLogs).catch(() => { /* ignore */ })
    else setLogs([])
  }, [active?.id])

  // 任务进行中的实时计时器
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active?.id])
  const elapsed = active ? Math.max(0, Math.floor((nowTick - new Date(active.start_time.replace(' ', 'T')).getTime()) / 1000)) : 0

  const toast = (title: string) => Taro.showToast({ title, icon: 'none' })
  const numOnly = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  const start = async () => {
    setBusy(true)
    try { await startCatchTask(); await loadTasks() } catch (e) { toast('开始失败：' + (e as Error).message) }
    setBusy(false)
  }
  const finish = async () => {
    if (!active) return
    setBusy(true)
    try { await endCatchTask(active.id); await loadTasks() } catch (e) { toast('结束失败：' + (e as Error).message) }
    setBusy(false)
  }
  const submit = async () => {
    if (!active) { toast('请先点「开始」开启任务'); return }
    let name = '', sub_type = '', scene = ''
    if (category === '召唤兽') {
      const p = curPets[petIdx]
      if (!p) { toast('请选择召唤兽'); return }
      name = p.name; scene = curScene ? curScene.name : ''
    } else if (category === '环装') {
      name = RING_LEVELS[ringLvIdx]; sub_type = RING_SUBS[ringSubIdx]
    }
    setBusy(true)
    try {
      await addCatchLog({ task_id: active.id, category, scene, name, sub_type, coord_x: coordX, coord_y: coordY, current_time: curTime })
      setCoordX(''); setCoordY(''); setCurTime(nowLocal())
      await Promise.all([fetchCatchLogs(active.id).then(setLogs), loadTasks()])
    } catch (e) { toast('录入失败：' + (e as Error).message) }
    setBusy(false)
  }

  // 时间：Picker(mode=time) 只给 HH:mm，日期取今天
  const timeHM = curTime.slice(11, 16)
  const onTimePick = (e: any) => setCurTime(`${curTime.slice(0, 10)}T${e.detail.value}`)

  const retryLogin = () => {
    setAuthReady(false)
    ensureLogin().then(u => { setUser(u); if (u) loadTasks() }).finally(() => setAuthReady(true))
  }

  if (!authReady) return <View className='page'><View className='cardBox loginTip'>登录中…</View></View>
  if (!user) return (
    <View className='page'>
      <View className='cardBox loginTip'>
        <View className='loginTitle'>自动登录失败</View>
        <View className='loginDesc'>场景记录需登录后使用（每位用户的记录相互独立）</View>
        <View className='submitBtn' onClick={retryLogin}>重试登录</View>
      </View>
    </View>
  )

  return (
    <View className='page'>
      {/* 大任务控制 */}
      <View className='cardBox'>
        <View className='btnRow'>
          <View className={'bigBtn green ' + ((busy || !!active) ? 'off' : '')} onClick={() => !busy && !active && start()}>开始</View>
          <View className={'bigBtn red ' + ((busy || !active) ? 'off' : '')} onClick={() => !busy && active && finish()}>结束</View>
        </View>
        {active ? (
          <View className='statusRow'>
            <Text className='statusOn'>任务进行中 · 开始于 {active.start_time}</Text>
            <Text className='timer'>⏱ {fmtDur(elapsed)}</Text>
          </View>
        ) : (
          <Text className='statusOff'>当前无进行中的任务，点「开始」开启一次</Text>
        )}
        <View className='userLine'>{user.nickname} · {user.channel === 'wechat' ? '微信' : user.channel === 'douyin' ? '抖音' : '普通'}渠道</View>
      </View>

      {/* 录入表单 */}
      <View className={'cardBox ' + (active ? '' : 'dim')}>
        <View className='fLabel'>类别</View>
        <View className='catRow'>
          {(['召唤兽', '环装', '告密'] as const).map(c => (
            <View key={c} className={'catBtn ' + (category === c ? 'catOn' : '')} onClick={() => setCategory(c)}>{c}</View>
          ))}
        </View>

        {category === '召唤兽' && (
          <View className='twoCol'>
            <View className='col'>
              <View className='fLabel'>场景</View>
              <Picker mode='selector' range={scenes.map(s => `${s.name}（${s.pets.length}）`)} value={sceneIdx}
                onChange={e => { setSceneIdx(Number(e.detail.value)); setPetIdx(0) }}>
                <View className='pickerBox'>{curScene ? curScene.name : '选择场景'} <Text className='caret'>▾</Text></View>
              </Picker>
            </View>
            <View className='col'>
              <View className='fLabel'>召唤兽</View>
              <Picker mode='selector' range={curPets.map(p => p.carry_lv ? `${p.name}（${p.carry_lv}级）` : p.name)} value={petIdx}
                onChange={e => setPetIdx(Number(e.detail.value))}>
                <View className='pickerBox'>{curPets[petIdx] ? curPets[petIdx].name : '选择召唤兽'} <Text className='caret'>▾</Text></View>
              </Picker>
            </View>
          </View>
        )}

        {category === '环装' && (
          <View className='twoCol'>
            <View className='col'>
              <View className='fLabel'>环装级别</View>
              <Picker mode='selector' range={RING_LEVELS.map(l => l + '环')} value={ringLvIdx} onChange={e => setRingLvIdx(Number(e.detail.value))}>
                <View className='pickerBox'>{RING_LEVELS[ringLvIdx]}环 <Text className='caret'>▾</Text></View>
              </Picker>
            </View>
            <View className='col'>
              <View className='fLabel'>武器 / 装备</View>
              <Picker mode='selector' range={[...RING_SUBS]} value={ringSubIdx} onChange={e => setRingSubIdx(Number(e.detail.value))}>
                <View className='pickerBox'>{RING_SUBS[ringSubIdx]} <Text className='caret'>▾</Text></View>
              </Picker>
            </View>
          </View>
        )}

        <View className='fLabel'>当前时间</View>
        <View className='timeRow'>
          <Picker mode='time' value={timeHM} onChange={onTimePick}>
            <View className='pickerBox'>{curTime.replace('T', ' ')} <Text className='caret'>▾</Text></View>
          </Picker>
          <View className='nowBtn' onClick={() => setCurTime(nowLocal())}>现在</View>
        </View>

        <View className='fLabel'>坐标 <Text className='fNote'>（可选，纯数字）</Text></View>
        <View className='twoCol'>
          <Input className='numInput' type='number' placeholder='X 轴' value={coordX} onInput={e => setCoordX(numOnly(e.detail.value))} />
          <Input className='numInput' type='number' placeholder='Y 轴' value={coordY} onInput={e => setCoordY(numOnly(e.detail.value))} />
        </View>

        <View className={'submitBtn ' + ((busy || !active) ? 'off' : '')} onClick={() => !busy && active && submit()}>
          {busy ? '处理中…' : '确认录入'}
        </View>
        {!active && <Text className='fNote'>请先点「开始」</Text>}
      </View>

      {/* 本次任务记录 */}
      {active && logs.length > 0 && (
        <View className='cardBox'>
          <View className='listTitle'>本次任务记录（{logs.length}）</View>
          <View className='logHead logRow'>
            <Text className='cCat'>类别</Text><Text className='cName'>项目</Text><Text className='cCoord'>坐标</Text><Text className='cTime'>时间</Text>
          </View>
          {logs.map(l => (
            <View key={l.id} className='logRow'>
              <Text className='cCat sub'>{l.category}</Text>
              <View className='cName'>
                <Text className='logName'>{catchLabel(l)}</Text>
                {l.category === '召唤兽' && !!l.scene && <View className='logScene'>{l.scene}</View>}
              </View>
              <Text className='cCoord'>{l.coord_x == null && l.coord_y == null ? '—' : `${l.coord_x ?? '—'},${l.coord_y ?? '—'}`}</Text>
              <Text className='cTime'>{(l.current_time || '—').replace('T', ' ').slice(5)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
