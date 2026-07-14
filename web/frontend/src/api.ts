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
export interface CatchLog { id: number; task_id: number; category: string; scene: string; name: string; sub_type: string; coord_x: number | null; coord_y: number | null; current_time: string; created_at: string }

// 场景 → 宝宝 联动数据
export interface ScenePet { id: number; name: string; carry_lv: number }
export interface SceneGroup { id: number; name: string; pets: ScenePet[] }
export async function fetchScenePets(): Promise<SceneGroup[]> {
  const r = await fetch('/api/scene_pets?_=' + Date.now())
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return (await r.json()).scenes
}

async function jsonOrThrow(r: Response) {
  if (!r.ok) {
    let m = 'HTTP ' + r.status
    try { m = (await r.json()).detail || m } catch { /* ignore */ }
    throw new Error(m)
  }
  return r.json()
}

const authHeaders = () => ({ 'X-Auth-Token': getToken() })

export async function startCatchTask(): Promise<{ ok: boolean; id: number; start_time: string }> {
  return jsonOrThrow(await fetch('/api/catch_task/start', { method: 'POST', headers: authHeaders() }))
}
export async function endCatchTask(id: number): Promise<{ ok: boolean; id: number; end_time: string }> {
  return jsonOrThrow(await fetch('/api/catch_task/' + id + '/end', { method: 'POST', headers: authHeaders() }))
}
export async function fetchCatchTasks(): Promise<CatchTask[]> {
  const r = await fetch('/api/catch_tasks?_=' + Date.now(), { headers: authHeaders() })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return (await r.json()).rows
}
export async function addCatchLog(body: { task_id: number; category: string; scene: string; name: string; sub_type: string; coord_x: string; coord_y: string; current_time: string }): Promise<{ ok: boolean; id: number }> {
  return jsonOrThrow(await fetch('/api/catch_log', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }))
}
export async function fetchCatchLogs(taskId?: number): Promise<CatchLog[]> {
  const q = taskId ? ('?task_id=' + taskId) : ('?_=' + Date.now())
  const r = await fetch('/api/catch_logs' + q, { headers: authHeaders() })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return (await r.json()).rows
}

// ---- 用户系统：注册/登录（channel: normal 普通 | wechat 微信 | douyin 抖音）----
export interface AuthUser { id: number; username: string; nickname: string; channel: string }
export const CHANNEL_LABEL: Record<string, string> = { normal: '普通', wechat: '微信', douyin: '抖音' }

const TOKEN_KEY = '__mhxy_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t: string) => { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) }

export async function authRegister(username: string, password: string, nickname: string): Promise<AuthUser> {
  const d = await jsonOrThrow(await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, nickname }) }))
  setToken(d.token)
  return d.user
}
export async function authLogin(username: string, password: string): Promise<AuthUser> {
  const d = await jsonOrThrow(await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }))
  setToken(d.token)
  return d.user
}
export async function sendEmailCode(email: string): Promise<void> {
  await jsonOrThrow(await fetch('/api/auth/send_email_code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }))
}
export async function authRegisterEmail(email: string, code: string, password: string, nickname: string): Promise<AuthUser> {
  const d = await jsonOrThrow(await fetch('/api/auth/register_email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, password, nickname }) }))
  setToken(d.token)
  return d.user
}
export async function authMe(): Promise<AuthUser | null> {
  const t = getToken()
  if (!t) return null
  const r = await fetch('/api/auth/me', { headers: { 'X-Auth-Token': t } })
  if (!r.ok) { if (r.status === 401) setToken(''); return null }
  return (await r.json()).user
}
export async function authLogout(): Promise<void> {
  const t = getToken()
  if (t) await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Auth-Token': t } }).catch(() => { /* ignore */ })
  setToken('')
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
