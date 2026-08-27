import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  fetchLedgerRoles, addLedgerRole, deleteLedgerRole, fetchLedgerEntries, addLedgerEntry, deleteLedgerEntry, fmt, ensureLogin,
  type LedgerRole, type LedgerEntry, type AuthUser
} from '../../utils/api'
import './index.scss'

const numOnly = (v: string) => v.replace(/[^\d.]/g, '').slice(0, 12)

export default function LedgerPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [roles, setRoles] = useState<LedgerRole[]>([])
  const [sel, setSel] = useState(0)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [kind, setKind] = useState<'income' | 'expense'>('income')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const toast = (title: string, icon: 'none' | 'success' = 'none') => Taro.showToast({ title, icon })

  const loadRoles = (keep?: number) => fetchLedgerRoles().then(rs => {
    setRoles(rs)
    setSel(prev => { const want = keep ?? prev; return rs.some(r => r.id === want) ? want : (rs[0] ? rs[0].id : 0) })
  }).catch(() => { /* ignore */ })

  useEffect(() => {
    ensureLogin().then(u => { setUser(u); if (u) loadRoles() }).finally(() => setAuthReady(true))
  }, [])
  useEffect(() => { if (sel) fetchLedgerEntries(sel).then(setEntries).catch(() => { /* ignore */ }); else setEntries([]) }, [sel])

  const cur = roles.find(r => r.id === sel) || null

  const doAddRole = () => {
    Taro.showModal({ title: '新增角色', editable: true, placeholderText: '角色名，如 大号' } as any).then((r: any) => {
      if (!r.confirm) return
      const n = (r.content || '').trim(); if (!n) return
      addLedgerRole(n).then(() => fetchLedgerRoles()).then(rs => {
        setRoles(rs); const a = rs.find(x => x.name === n); if (a) setSel(a.id)
      }).catch(e => toast((e as Error).message))
    })
  }
  const doDelRole = (r: LedgerRole) => {
    Taro.showModal({ title: '删除角色', content: `删除「${r.name}」？其下 ${r.count} 条记账会一并删除` }).then(res => {
      if (!res.confirm) return
      deleteLedgerRole(r.id).then(() => loadRoles()).then(() => toast('已删除', 'success')).catch(e => toast((e as Error).message))
    })
  }
  const doAddEntry = () => {
    if (!sel) { toast('请先添加/选择角色'); return }
    const a = Number(amount)
    if (amount === '' || !isFinite(a) || a < 0) { toast('请输入有效金额'); return }
    setBusy(true)
    addLedgerEntry({ role_id: sel, kind, amount: a, note: note.trim() }).then(() => {
      setAmount(''); setNote('')
      return Promise.all([fetchLedgerEntries(sel).then(setEntries), loadRoles(sel)])
    }).then(() => toast('已记一笔', 'success')).catch(e => toast((e as Error).message)).then(() => setBusy(false))
  }
  const doDelEntry = (id: number) => {
    deleteLedgerEntry(id).then(() => Promise.all([fetchLedgerEntries(sel).then(setEntries), loadRoles(sel)])).catch(e => toast((e as Error).message))
  }

  if (!authReady) return <View className='page'><View className='cardBox loginTip'>登录中…</View></View>
  if (!user) return (
    <View className='page'>
      <View className='cardBox loginTip'>
        <View className='loginTitle'>自动登录失败</View>
        <View className='loginDesc'>记账需登录后使用（每位用户的角色和记账相互独立）</View>
      </View>
    </View>
  )

  return (
    <View className='page'>
      {/* 角色 */}
      <View className='cardBox'>
        <View className='barTitle'>角色</View>
        <ScrollView scrollX className='roleScroll'>
          {roles.map(r => (
            <View key={r.id} className={'roleChip ' + (r.id === sel ? 'roleOn' : '')} onClick={() => setSel(r.id)}>
              <Text>{r.name}</Text>
              <Text className='delX' onClick={e => { e.stopPropagation(); doDelRole(r) }}>×</Text>
            </View>
          ))}
          <View className='roleChip roleAdd' onClick={doAddRole}>＋ 角色</View>
        </ScrollView>
      </View>

      {!cur ? (
        <View className='cardBox emptyTip'>先添加一个角色开始记账</View>
      ) : (
        <View>
          {/* 汇总 */}
          <View className='sumRow'>
            <View className='sumCell'><Text className='sumLabel'>总收入</Text><Text className='sumVal inc'>{fmt(cur.income)}</Text></View>
            <View className='sumCell'><Text className='sumLabel'>总支出</Text><Text className='sumVal exp'>{fmt(cur.expense)}</Text></View>
            <View className='sumCell'><Text className='sumLabel'>净额</Text><Text className={'sumVal ' + (cur.net >= 0 ? 'inc' : 'exp')}>{fmt(cur.net)}</Text></View>
          </View>

          {/* 记一笔 */}
          <View className='cardBox'>
            <View className='barTitle'>给「{cur.name}」记一笔</View>
            <View className='kindRow'>
              <View className={'kindBtn ' + (kind === 'income' ? 'kindInc' : '')} onClick={() => setKind('income')}>收入</View>
              <View className={'kindBtn ' + (kind === 'expense' ? 'kindExp' : '')} onClick={() => setKind('expense')}>支出</View>
            </View>
            <View className='fLabel'>金额</View>
            <Input className='numInput' type='digit' placeholder='0.00' value={amount} onInput={e => setAmount(numOnly(e.detail.value))} />
            <View className='fLabel'>备注（可选）</View>
            <Input className='numInput' placeholder='如 卖装备 / 买兽决' value={note} onInput={e => setNote(e.detail.value)} />
            <View className={'submitBtn ' + (busy ? 'off' : '')} onClick={() => !busy && doAddEntry()}>{busy ? '记录中…' : '记一笔'}</View>
          </View>

          {/* 明细 */}
          <View className='cardBox'>
            <View className='barTitle'>明细（{entries.length}）</View>
            {entries.length === 0
              ? <Text className='emptyLine'>还没有记录，上面记第一笔吧</Text>
              : entries.map(en => (
                <View key={en.id} className='entryRow'>
                  <Text className={'eTag ' + (en.kind === 'income' ? 'tInc' : 'tExp')}>{en.kind === 'income' ? '收入' : '支出'}</Text>
                  <Text className={'eAmt ' + (en.kind === 'income' ? 'inc' : 'exp')}>{en.kind === 'income' ? '+' : '−'}{fmt(en.amount)}</Text>
                  <Text className='eNote'>{en.note || '—'}</Text>
                  <Text className='eTime'>{(en.created_at || '').slice(5, 16)}</Text>
                  <Text className='delX2' onClick={() => doDelEntry(en.id)}>×</Text>
                </View>
              ))}
          </View>
        </View>
      )}
    </View>
  )
}
