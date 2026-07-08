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

// ---- 抓宝宝：大任务(catch_task) + 每次抓到(catch_log) ----
export interface CatchTask { id: number; start_time: string; end_time: string | null; created_at: string; catches: number }
export interface CatchLog { id: number; task_id: number; pet_type: string; coord: string; current_time: string; created_at: string }

async function jsonOrThrow(r: Response) {
  if (!r.ok) {
    let m = 'HTTP ' + r.status
    try { m = (await r.json()).detail || m } catch { /* ignore */ }
    throw new Error(m)
  }
  return r.json()
}

export async function startCatchTask(): Promise<{ ok: boolean; id: number; start_time: string }> {
  return jsonOrThrow(await fetch('/api/catch_task/start', { method: 'POST' }))
}
export async function endCatchTask(id: number): Promise<{ ok: boolean; id: number; end_time: string }> {
  return jsonOrThrow(await fetch('/api/catch_task/' + id + '/end', { method: 'POST' }))
}
export async function fetchCatchTasks(): Promise<CatchTask[]> {
  const r = await fetch('/api/catch_tasks?_=' + Date.now())
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return (await r.json()).rows
}
export async function addCatchLog(body: { task_id: number; pet_type: string; coord: string; current_time: string }): Promise<{ ok: boolean; id: number }> {
  return jsonOrThrow(await fetch('/api/catch_log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
}
export async function fetchCatchLogs(taskId?: number): Promise<CatchLog[]> {
  const q = taskId ? ('?task_id=' + taskId) : ('?_=' + Date.now())
  const r = await fetch('/api/catch_logs' + q)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return (await r.json()).rows
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
