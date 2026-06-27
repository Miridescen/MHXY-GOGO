import Taro from '@tarojs/taro'

// 开发期：连现有老服务器（开发者工具需勾「不校验合法域名」）。
// 备案通过后改成： https://dogfever.cn
export const API_BASE = 'https://43-106-131-65.nip.io:8090'

// ---- 后端 /api/overview 返回的数据类型（与网站一致）----
export interface ServerRef { name: string; serverid: number }
export interface Region { daqu: string; product: number; servers: ServerRef[] }
export interface PriceCell { price: number; link: string }
export interface LowInfo { serverid: number; price: number; link: string; daqu: string; server: string }
export interface Item {
  id: number
  name: string
  cat: string
  icon: string
  iconBg: string
  iconFg: string
  prices: Record<string, PriceCell>   // key = serverid
  low: LowInfo
}
export interface RoleCell { price: number; server: string; daqu: string; link: string }
export interface Roles {
  date: string | null
  categories: string[]
  ages: { code: number; name: string }[]
  matrix: Record<string, Record<string, RoleCell>>
}
export interface Carry {
  date: string | null
  genders: string[]
  levels: string[]
  matrix: Record<string, Record<string, Record<string, RoleCell>>>
}
export interface RoleClothes extends Carry { clothes: string[] }
export interface RoleMounts extends Carry { mounts: string[] }
export interface EquipCell {
  类型: string | null; 特技: string | null; 等级: number; 年限: number
  price: number; server: string; daqu: string; link: string
}
export interface EquipSel { name: string; options: string[] }
export interface EquipGroup { key: string; label: string; sel: EquipSel[]; levels: number[]; cells: EquipCell[] }
export interface Equip { date: string | null; ages: { code: number; name: string }[]; groups: EquipGroup[] }
export interface Overview {
  generated_at: string
  regions: Region[]
  items: Item[]
  roles: Roles
  roleClothes: RoleClothes
  roleMounts: RoleMounts
  equip: Equip
}

export function fetchOverview(): Promise<Overview> {
  return new Promise((resolve, reject) => {
    Taro.request({
      url: API_BASE + '/api/overview?_=' + Date.now(),
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data as Overview)
        else reject(new Error('HTTP ' + res.statusCode))
      },
      fail: (e) => reject(new Error(e.errMsg || '网络错误'))
    })
  })
}

// ---- 纯函数 ----
export function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return ''
  const v = Math.round(Number(n) * 100) / 100
  const neg = v < 0
  const parts = Math.abs(v).toString().split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return '¥' + (neg ? '-' : '') + parts.join('.')
}

export function serveridOf(region: Region | undefined, server: string): number | null {
  const s = region?.servers.find(x => x.name === server)
  return s ? s.serverid : null
}

// 点击商品/单元格：小程序不能随意外跳网页，改为复制藏宝阁链接
export function copyLink(link: string) {
  if (!link) return
  Taro.setClipboardData({
    data: link,
    success: () => Taro.showToast({ title: '链接已复制，去藏宝阁粘贴查看', icon: 'none', duration: 2000 })
  })
}
