import Taro from '@tarojs/taro'

// 流量主开通后，在后台创建「激励视频」广告位，把 ID 填到这里（形如 adunit-xxxxxxxxxxxx）
export const AD_UNIT_ID = 'adunit-你的激励视频广告位ID'

const isPlaceholder = AD_UNIT_ID.indexOf('你的') >= 0
let adInstance: any = null

// 展示激励视频广告；看完返回 true，中途退出返回 false
export function showRewardAd(): Promise<boolean> {
  return new Promise((resolve) => {
    // 占位ID 或不支持广告的环境 → 直接放行，方便开发预览
    if (isPlaceholder || typeof (Taro as any).createRewardedVideoAd !== 'function') {
      Taro.showToast({ title: '开发模式：已解锁', icon: 'none' })
      resolve(true)
      return
    }
    if (!adInstance) {
      adInstance = (Taro as any).createRewardedVideoAd({ adUnitId: AD_UNIT_ID })
      adInstance.onError((e: any) => console.warn('激励视频广告出错', e))
    }
    const onClose = (res: any) => {
      adInstance.offClose(onClose)
      resolve(res ? !!res.isEnded : true)   // isEnded=true 表示完整看完
    }
    adInstance.onClose(onClose)
    adInstance.show().catch(() => {
      // 没加载好就重新拉取再播
      adInstance.load()
        .then(() => adInstance.show())
        .catch(() => {
          adInstance.offClose(onClose)
          Taro.showToast({ title: '广告加载失败，请重试', icon: 'none' })
          resolve(false)
        })
    })
  })
}
