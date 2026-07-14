import Taro from '@tarojs/taro'

// 生产：广州腾讯云（dogfever.cn，已备案+HTTPS）。
// 小程序后台「服务器域名」需把 https://dogfever.cn 加进 request 合法域名。
export const API_BASE = 'https://dogfever.cn'

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

// ---- 场景记录（与网站一致：大任务 + 每次抓到；场景/召唤兽联动）----
export interface CatchTask { id: number; start_time: string; end_time: string | null; created_at: string; catches: number }
export interface CatchLog { id: number; task_id: number; category: string; scene: string; name: string; sub_type: string; coord_x: number | null; coord_y: number | null; current_time: string; created_at: string }
export interface ScenePet { id: number; name: string; carry_lv: number }
export interface SceneGroup { id: number; name: string; pets: ScenePet[] }

// ---- 登录态（token 存本地；请求统一带 X-Auth-Token）----
export interface AuthUser { id: number; username: string; nickname: string; channel: string }
const TOKEN_KEY = 'mhxy_token'
export const getToken = (): string => Taro.getStorageSync(TOKEN_KEY) || ''
export const setToken = (t: string) => { if (t) Taro.setStorageSync(TOKEN_KEY, t); else Taro.removeStorageSync(TOKEN_KEY) }

function req<T>(path: string, method: 'GET' | 'POST' = 'GET', data?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    Taro.request({
      url: API_BASE + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as T)
        else reject(new Error((res.data as any)?.detail || 'HTTP ' + res.statusCode))
      },
      fail: (e) => reject(new Error(e.errMsg || '网络错误'))
    })
  })
}

// 小程序静默登录：wx.login/tt.login 的 code 给后端换 openid，自动创建 微信/抖音 渠道账号
export async function mpLogin(): Promise<AuthUser> {
  const res = await Taro.login()
  if (!res.code) throw new Error('获取登录 code 失败')
  const platform = process.env.TARO_ENV === 'tt' ? 'douyin' : 'wechat'
  const d = await req<{ ok: boolean; token: string; user: AuthUser }>('/api/auth/mp_login', 'POST', { code: res.code, platform })
  setToken(d.token)
  return d.user
}

// 确保已登录：有 token 先验有效性，无效/没有则静默登录；失败返回 null
export async function ensureLogin(): Promise<AuthUser | null> {
  if (getToken()) {
    try { return (await req<{ ok: boolean; user: AuthUser }>('/api/auth/me')).user }
    catch { setToken('') }
  }
  try { return await mpLogin() } catch { return null }
}

export const fetchScenePets = () => req<{ scenes: SceneGroup[] }>('/api/scene_pets?_=' + Date.now()).then(d => d.scenes)
export const fetchCatchTasks = () => req<{ rows: CatchTask[] }>('/api/catch_tasks?_=' + Date.now()).then(d => d.rows)
export const startCatchTask = () => req<{ ok: boolean; id: number; start_time: string }>('/api/catch_task/start', 'POST')
export const endCatchTask = (id: number) => req<{ ok: boolean; id: number; end_time: string }>(`/api/catch_task/${id}/end`, 'POST')
export const fetchCatchLogs = (taskId: number) => req<{ rows: CatchLog[] }>(`/api/catch_logs?task_id=${taskId}&_=${Date.now()}`).then(d => d.rows)
export const addCatchLog = (body: { task_id: number; category: string; scene: string; name: string; sub_type: string; coord_x: string; coord_y: string; current_time: string }) =>
  req<{ ok: boolean; id: number }>('/api/catch_log', 'POST', body)

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
