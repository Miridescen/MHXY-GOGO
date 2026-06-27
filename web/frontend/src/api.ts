// 后端接口类型 + 请求 + 比价纯函数（与 UI 无关，便于复用/将来小程序）

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
  latestDate: string
  prices: Record<string, PriceCell>   // key = serverid
  low: LowInfo
  historyLow: number
  points: string
  trendColor: string
}
export interface RoleCell { price: number; server: string; daqu: string; link: string }
export interface Roles {
  date: string | null
  categories: string[]
  ages: { code: number; name: string }[]
  matrix: Record<string, Record<string, RoleCell>>
}
export interface RoleClothes {
  date: string | null
  clothes: string[]
  genders: string[]
  levels: string[]
  matrix: Record<string, Record<string, Record<string, RoleCell>>>  // 锦衣 → 性别 → 等级 → cell
}
export interface RoleMounts {
  date: string | null
  mounts: string[]
  genders: string[]
  levels: string[]
  matrix: Record<string, Record<string, Record<string, RoleCell>>>  // 坐骑 → 性别 → 等级 → cell
}
export interface EquipCell {
  类型: string | null; 特技: string | null; 等级: number; 年限: number
  price: number; server: string; daqu: string; link: string
}
export interface EquipSel { name: string; options: string[] }
export interface EquipGroup { key: string; label: string; sel: EquipSel[]; levels: number[]; cells: EquipCell[] }
export interface Equip { date: string | null; ages: { code: number; name: string }[]; groups: EquipGroup[] }
export interface Overview {
  generated_at: string
  served_at: string
  regions: Region[]
  items: Item[]
  roles: Roles
  roleClothes: RoleClothes
  roleMounts: RoleMounts
  equip: Equip
}

export async function fetchOverview(): Promise<Overview> {
  const r = await fetch('/api/overview?_=' + Date.now())
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

// ---- 比价纯函数 ----
export const fmt = (n: number) => '¥' + Number(n).toLocaleString('en-US')

export function serveridOf(region: Region | undefined, server: string): number | null {
  const s = region?.servers.find(x => x.name === server)
  return s ? s.serverid : null
}
export function serverCell(it: Item, sid: number | null): PriceCell | null {
  return sid != null ? (it.prices[String(sid)] || null) : null
}
