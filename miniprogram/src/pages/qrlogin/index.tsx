import { View, Text } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { ensureLogin, qrConfirm } from '../../utils/api'
import './index.scss'

export default function QrLogin() {
  const router = useRouter()
  const scene = router.params.scene || ''
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')
  const [msg, setMsg] = useState('')

  const confirm = async () => {
    if (!scene) { setMsg('缺少二维码参数，请在网页重新扫码'); setStatus('err'); return }
    setStatus('busy')
    const u = await ensureLogin()   // 静默登录：拿到本人 wx_openid 账号
    if (!u) { setMsg('登录失败，请重试'); setStatus('err'); return }
    try {
      await qrConfirm(scene)
      setStatus('done')
    } catch (e) {
      setMsg((e as Error).message || '确认失败'); setStatus('err')
    }
  }

  return (
    <View className='page'>
      <View className='card'>
        {status === 'done' ? (
          <View>
            <View className='ok'>✅ 已确认</View>
            <View className='desc'>网页已登录，回到电脑上查看即可。此页可关闭。</View>
          </View>
        ) : status === 'err' ? (
          <View>
            <View className='title'>登录失败</View>
            <View className='desc'>{msg}</View>
            <View className='btn' onClick={() => { setStatus('idle'); setMsg('') }}>重试</View>
          </View>
        ) : (
          <View>
            <View className='title'>确认在网页登录？</View>
            <View className='desc'>确认后，电脑网页将以你的账号登录，可查看你的场景记录、物品价格等数据。</View>
            <View className={'btn ' + (status === 'busy' ? 'off' : '')} onClick={() => status !== 'busy' && confirm()}>
              {status === 'busy' ? '确认中…' : '确认登录'}
            </View>
            <View className='tip'>不是你本人操作的，请勿确认，直接关闭本页。</View>
          </View>
        )}
      </View>
    </View>
  )
}
