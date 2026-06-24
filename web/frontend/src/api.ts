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
export interface Overview {
  generated_at: string
  served_at: string
  regions: Region[]
  items: Item[]
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
