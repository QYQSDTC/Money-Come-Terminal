/**
 * 历史数据画像模块
 * 
 * 为实时榜单突破评分提供历史参照数据：
 * - N日最高/最低价（用于判断创新高/平台突破）
 * - N日平均成交额（用于计算量比）
 * - 均线值（用于判断多头排列）
 * - 震荡区间上下沿（用于判断平台突破）
 * 
 * 数据每交易日构建一次，使用 getDailyAll 批量获取全市场历史日线。
 */

import { TushareClient } from '../tushare/client'

// ==================== Types ====================

export interface StockHistoryProfile {
  high_5d: number          // 5日最高价
  high_10d: number         // 10日最高价
  high_20d: number         // 20日最高价
  low_20d: number          // 20日最低价
  avg_amount_5d: number    // 5日平均成交额 (千元, Tushare daily API 单位)
  avg_amount_20d: number   // 20日平均成交额 (千元)
  ma5: number              // 5日均线
  ma10: number             // 10日均线
  ma20: number             // 20日均线
  consolidation_high: number  // 震荡区间上沿 (跳过最近3日, 取4~20日最高)
  consolidation_low: number   // 震荡区间下沿 (跳过最近3日, 取4~20日最低)
}

interface DailyBar {
  open: number
  high: number
  low: number
  close: number
  vol: number
  amount: number  // 千元
}

// ==================== Module State ====================

let profileCache = new Map<string, StockHistoryProfile>()
let profileCacheDate = ''
let profileBuildPromise: Promise<void> | null = null

// ==================== Utility ====================

function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 生成最近 N 个工作日日期 (不含今日, 从昨天向前推)
 * 跳过周六日, 但无法跳过节假日 (节假日会返回空数据, 自动忽略)
 */
function getRecentWeekdayDates(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setDate(d.getDate() - 1) // 从昨天开始

  let attempts = 0
  while (dates.length < count && attempts < count * 2) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      dates.push(`${y}${m}${dd}`)
    }
    d.setDate(d.getDate() - 1)
    attempts++
  }

  return dates
}

/**
 * 获取某一日全市场日线数据
 */
async function fetchDailyForDate(
  client: TushareClient,
  date: string
): Promise<Map<string, DailyBar>> {
  const stocks = new Map<string, DailyBar>()

  try {
    const resp = await client.getDailyAll(date)
    if (resp.code === 0 && resp.data && resp.data.items.length > 0) {
      const fields = resp.data.fields
      for (const item of resp.data.items) {
        const obj: Record<string, any> = {}
        fields.forEach((f, i) => { obj[f] = item[i] })

        const close = Number(obj.close || 0)
        if (close <= 0) continue

        stocks.set(String(obj.ts_code), {
          open: Number(obj.open || 0),
          high: Number(obj.high || 0),
          low: Number(obj.low || 0),
          close,
          vol: Number(obj.vol || 0),
          amount: Number(obj.amount || 0)
        })
      }
    }
  } catch (err: any) {
    console.error(`[HistoryProfile] Failed to fetch date=${date}:`, err.message)
  }

  return stocks
}

// ==================== Profile Builder ====================

/**
 * 构建全市场历史画像
 * 拉取最近 ~20 个交易日的全市场日线, 计算每只股票的历史指标
 */
async function buildProfiles(client: TushareClient): Promise<void> {
  console.log('[HistoryProfile] Building history profiles...')
  const startTime = Date.now()

  // 生成最近 30 个工作日 (足够覆盖 20 个交易日 + 节假日)
  const dates = getRecentWeekdayDates(30)

  // 分批拉取, 每批 3 个日期并行, 批间间隔 250ms 防限频
  const tradingDays: { date: string; stocks: Map<string, DailyBar> }[] = []
  const BATCH_SIZE = 3

  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(d => fetchDailyForDate(client, d).then(stocks => ({ date: d, stocks })))
    )

    for (const r of results) {
      if (r.stocks.size > 0) {
        tradingDays.push(r)
      }
    }

    // 已拿到足够交易日, 提前终止
    if (tradingDays.length >= 20) break

    // 批间延迟
    if (i + BATCH_SIZE < dates.length) {
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }

  // 按日期降序排列 (最近的在前)
  tradingDays.sort((a, b) => b.date.localeCompare(a.date))
  const days = tradingDays.slice(0, 20)

  if (days.length === 0) {
    console.warn('[HistoryProfile] No historical data fetched')
    return
  }

  console.log(`[HistoryProfile] Fetched ${days.length} trading days (${days[days.length - 1].date} ~ ${days[0].date})`)

  // 收集所有股票代码
  const allCodes = new Set<string>()
  for (const day of days) {
    for (const code of day.stocks.keys()) {
      allCodes.add(code)
    }
  }

  // 逐股构建画像
  const newCache = new Map<string, StockHistoryProfile>()

  for (const code of allCodes) {
    // 按日期从近到远收集该股票的日线数据
    const data: DailyBar[] = []
    for (const day of days) {
      const bar = day.stocks.get(code)
      if (bar && bar.close > 0) {
        data.push(bar)
      }
    }

    if (data.length < 3) continue // 数据太少, 跳过

    const d5 = data.slice(0, Math.min(5, data.length))
    const d10 = data.slice(0, Math.min(10, data.length))
    const d20 = data.slice(0, Math.min(20, data.length))

    // N日最高/最低
    const high_5d = Math.max(...d5.map(d => d.high))
    const high_10d = Math.max(...d10.map(d => d.high))
    const high_20d = Math.max(...d20.map(d => d.high))
    const low_20d = Math.min(...d20.map(d => d.low))

    // 平均成交额 (千元)
    const avg_amount_5d = d5.reduce((s, d) => s + d.amount, 0) / d5.length
    const avg_amount_20d = d20.reduce((s, d) => s + d.amount, 0) / d20.length

    // 均线
    const ma5 = d5.reduce((s, d) => s + d.close, 0) / d5.length
    const ma10 = d10.reduce((s, d) => s + d.close, 0) / d10.length
    const ma20 = d20.reduce((s, d) => s + d.close, 0) / d20.length

    // 震荡区间: 跳过最近 3 日 (可能正在突破), 用 4~20 日数据
    const consolidationData = data.slice(3, 20)
    const consolidation_high = consolidationData.length > 0
      ? Math.max(...consolidationData.map(d => d.high))
      : high_20d
    const consolidation_low = consolidationData.length > 0
      ? Math.min(...consolidationData.map(d => d.low))
      : low_20d

    newCache.set(code, {
      high_5d, high_10d, high_20d, low_20d,
      avg_amount_5d, avg_amount_20d,
      ma5, ma10, ma20,
      consolidation_high, consolidation_low
    })
  }

  profileCache = newCache
  profileCacheDate = getTodayStr()

  console.log(`[HistoryProfile] Built ${newCache.size} profiles in ${Date.now() - startTime}ms`)
}

// ==================== Public API ====================

/**
 * 确保历史画像已构建 (每日构建一次)
 * 首次调用时在后台异步构建, 不阻塞主流程
 */
export async function ensureHistoryProfiles(client: TushareClient): Promise<void> {
  const today = getTodayStr()

  // 缓存有效
  if (profileCacheDate === today && profileCache.size > 0) {
    return
  }

  // 已在构建中, 等待
  if (profileBuildPromise) {
    return profileBuildPromise
  }

  // 发起构建
  profileBuildPromise = buildProfiles(client)
    .catch(err => {
      console.error('[HistoryProfile] Build failed:', err)
    })
    .finally(() => {
      profileBuildPromise = null
    })

  return profileBuildPromise
}

/**
 * 获取某只股票的历史画像 (可能为 null, 如画像未构建完成)
 */
export function getStockProfile(tsCode: string): StockHistoryProfile | null {
  return profileCache.get(tsCode) || null
}

/**
 * 画像是否已就绪
 */
export function isProfileReady(): boolean {
  return profileCache.size > 0
}

/**
 * 清除画像缓存 (Token 变更时调用)
 */
export function clearProfileCache(): void {
  profileCache.clear()
  profileCacheDate = ''
  profileBuildPromise = null
}

/**
 * 计算 A 股盘中时间进度 (0~1)
 * 用于调整盘中成交额, 使其与历史全日成交额可比
 * 
 * A 股交易时间: 9:30-11:30 (120min) + 13:00-15:00 (120min) = 240min
 */
export function getTradingDayProgress(): number {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const totalMin = h * 60 + m

  if (totalMin < 9 * 60 + 30) return 0.05 // 盘前, 给最小值避免除零
  if (totalMin >= 15 * 60) return 1        // 收盘后

  let elapsed = 0
  if (totalMin <= 11 * 60 + 30) {
    // 上午盘: 9:30 ~ 11:30
    elapsed = totalMin - (9 * 60 + 30)
  } else if (totalMin < 13 * 60) {
    // 午休: 上午盘结束
    elapsed = 120
  } else {
    // 下午盘: 13:00 ~ 15:00
    elapsed = 120 + (totalMin - 13 * 60)
  }

  return Math.max(0.05, Math.min(1, elapsed / 240))
}
