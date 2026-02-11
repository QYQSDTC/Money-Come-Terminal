import { TushareClient } from '../tushare/client'
import type {
  IndexQuote,
  MarketBreadth,
  NorthboundFlow,
  MarginData,
  MarketStats,
  MarketOverview
} from '../../shared/types'

// ==================== Constants ====================

const MAJOR_INDICES = [
  { ts_code: '000001.SH', name: '上证指数' },
  { ts_code: '399001.SZ', name: '深证成指' },
  { ts_code: '399006.SZ', name: '创业板指' },
  { ts_code: '000688.SH', name: '科创50' }
]

// GEM (创业板 300xxx) and STAR (科创板 688xxx) have ±20% limits
function isGemOrStar(tsCode: string): boolean {
  return tsCode.startsWith('300') || tsCode.startsWith('688')
}

// ==================== Cache ====================

interface MarketCacheEntry {
  data: MarketOverview
  timestamp: number
}

const marketCache = new Map<string, MarketCacheEntry>()
const MARKET_CACHE_TTL = 30 * 60 * 1000 // 30 minutes for daily data

function getCached(date: string): MarketOverview | null {
  const entry = marketCache.get(date)
  if (!entry) return null
  if (Date.now() - entry.timestamp > MARKET_CACHE_TTL) {
    marketCache.delete(date)
    return null
  }
  return entry.data
}

function setCache(date: string, data: MarketOverview): void {
  marketCache.set(date, { data, timestamp: Date.now() })
  // Keep max 10 entries
  if (marketCache.size > 10) {
    const oldest = Array.from(marketCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    marketCache.delete(oldest[0][0])
  }
}

// ==================== Helpers ====================

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function parseRow(fields: string[], item: any[]): Record<string, any> {
  const obj: Record<string, any> = {}
  fields.forEach((f, i) => { obj[f] = item[i] })
  return obj
}

function getRecentTradeDate(): string {
  const now = new Date()
  // If before 15:30, use previous day; if weekend, go back further
  const hour = now.getHours()
  if (hour < 16) {
    now.setDate(now.getDate() - 1)
  }
  // Skip weekends
  while (now.getDay() === 0 || now.getDay() === 6) {
    now.setDate(now.getDate() - 1)
  }
  return formatDate(now)
}

// ==================== Fetch Functions ====================

async function fetchIndices(
  client: TushareClient,
  endDate: string
): Promise<IndexQuote[]> {
  const startDate30 = new Date()
  startDate30.setDate(startDate30.getDate() - 60) // 60 calendar days for ~30 trading days
  const startStr = formatDate(startDate30)

  const results: IndexQuote[] = []

  for (const idx of MAJOR_INDICES) {
    try {
      const resp = await client.getIndexDaily(idx.ts_code, startStr, endDate)
      if (resp.code !== 0 || !resp.data || resp.data.items.length === 0) continue

      const rows = resp.data.items.map((item) => parseRow(resp.data!.fields, item))
      rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))

      const latest = rows[rows.length - 1]
      const history = rows.map((r) => ({
        date: String(r.trade_date),
        close: Number(r.close)
      }))

      results.push({
        ts_code: idx.ts_code,
        name: idx.name,
        close: Number(latest.close),
        open: Number(latest.open),
        high: Number(latest.high),
        low: Number(latest.low),
        pre_close: Number(latest.pre_close),
        change: Number(latest.change),
        pct_chg: Number(latest.pct_chg),
        vol: Number(latest.vol),
        amount: Number(latest.amount),
        history
      })
    } catch (e) {
      console.error(`[Market] Failed to fetch index ${idx.ts_code}:`, e)
    }
  }

  return results
}

async function fetchBreadth(
  client: TushareClient,
  tradeDate: string
): Promise<MarketBreadth> {
  const defaultBreadth: MarketBreadth = {
    date: tradeDate,
    advanceCount: 0,
    declineCount: 0,
    flatCount: 0,
    limitUpCount: 0,
    limitDownCount: 0,
    totalCount: 0
  }

  try {
    const resp = await client.getDailyAll(tradeDate)
    if (resp.code !== 0 || !resp.data || resp.data.items.length === 0) {
      return defaultBreadth
    }

    const rows = resp.data.items.map((item) => parseRow(resp.data!.fields, item))
    let advance = 0, decline = 0, flat = 0, limitUp = 0, limitDown = 0

    for (const r of rows) {
      const pctChg = Number(r.pct_chg)
      const tsCode = String(r.ts_code)

      if (pctChg > 0) advance++
      else if (pctChg < 0) decline++
      else flat++

      const limitThreshold = isGemOrStar(tsCode) ? 19.5 : 9.5
      if (pctChg >= limitThreshold) limitUp++
      else if (pctChg <= -limitThreshold) limitDown++
    }

    return {
      date: tradeDate,
      advanceCount: advance,
      declineCount: decline,
      flatCount: flat,
      limitUpCount: limitUp,
      limitDownCount: limitDown,
      totalCount: rows.length
    }
  } catch (e) {
    console.error('[Market] Failed to fetch breadth:', e)
    return defaultBreadth
  }
}

async function fetchNorthbound(
  client: TushareClient,
  endDate: string
): Promise<NorthboundFlow[]> {
  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 60)
    const resp = await client.getMoneyflowHSGT(formatDate(startDate), endDate)
    if (resp.code !== 0 || !resp.data) return []

    const rows = resp.data.items.map((item) => parseRow(resp.data!.fields, item))
    rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)))

    const parsed = rows.map((r) => ({
      date: String(r.trade_date),
      hgt: Number(r.hgt || 0),
      sgt: Number(r.sgt || 0),
      northMoney: Number(r.north_money || 0)
    }))

    // Auto-detect unit: Tushare docs say 百万元, but some data may be in 万元.
    // Typical daily net flow is -200亿 to +200亿 = -20000 to +20000 百万元.
    // If we see values > 50000, the data is likely in 万元 → normalize to 百万元.
    const maxAbs = Math.max(...parsed.map((d) => Math.abs(d.northMoney)))
    if (maxAbs > 50000) {
      const scale = 100 // 万元 → 百万元
      console.log(`[Market] Northbound data appears to be in 万元 (max=${maxAbs}), normalizing by /${scale}`)
      for (const d of parsed) {
        d.hgt = d.hgt / scale
        d.sgt = d.sgt / scale
        d.northMoney = d.northMoney / scale
      }
    }

    return parsed
  } catch (e) {
    console.error('[Market] Failed to fetch northbound:', e)
    return []
  }
}

async function fetchMargin(
  client: TushareClient,
  endDate: string
): Promise<MarginData[]> {
  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 60) // ~30 trading days
    const resp = await client.getMargin(formatDate(startDate), endDate)
    if (resp.code !== 0 || !resp.data) return []

    const rows = resp.data.items.map((item) => parseRow(resp.data!.fields, item))

    // Group by date and sum SSE + SZSE
    const byDate = new Map<string, { rzye: number; rzmre: number; rzche: number; rqye: number; rzrqye: number }>()

    for (const r of rows) {
      const date = String(r.trade_date)
      const existing = byDate.get(date) || { rzye: 0, rzmre: 0, rzche: 0, rqye: 0, rzrqye: 0 }
      // Tushare margin data is in 元, convert to 亿
      const YI = 100_000_000
      existing.rzye += Number(r.rzye || 0) / YI
      existing.rzmre += Number(r.rzmre || 0) / YI
      existing.rzche += Number(r.rzche || 0) / YI
      existing.rqye += Number(r.rqye || 0) / YI
      existing.rzrqye += Number(r.rzrqye || 0) / YI
      byDate.set(date, existing)
    }

    const result: MarginData[] = []
    for (const [date, vals] of byDate) {
      result.push({
        date,
        rzye: vals.rzye,
        rzmre: vals.rzmre,
        rzche: vals.rzche,
        rzjmr: vals.rzmre - vals.rzche, // net margin buy
        rqye: vals.rqye,
        rzrqye: vals.rzrqye
      })
    }

    result.sort((a, b) => a.date.localeCompare(b.date))
    return result
  } catch (e) {
    console.error('[Market] Failed to fetch margin:', e)
    return []
  }
}

async function fetchMarketStats(
  client: TushareClient,
  tradeDate: string
): Promise<MarketStats[]> {
  try {
    const resp = await client.getDailyInfo(tradeDate)
    if (resp.code !== 0 || !resp.data) return []

    const rows = resp.data.items.map((item) => parseRow(resp.data!.fields, item))

    // Filter key market segments
    const targets = ['SH_A', 'SZ_MAIN', 'SZ_GEM', 'SH_STAR']
    return rows
      .filter((r) => targets.includes(String(r.ts_code)))
      .map((r) => ({
        ts_code: String(r.ts_code),
        name: String(r.ts_name || r.ts_code),
        pe: Number(r.pe || 0),
        totalMv: Number(r.total_mv || 0),
        amount: Number(r.amount || 0),
        vol: Number(r.vol || 0),
        comCount: Number(r.com_count || 0),
        tr: Number(r.tr || 0)
      }))
  } catch (e) {
    console.error('[Market] Failed to fetch market stats:', e)
    return []
  }
}

// ==================== Main Function ====================

export async function fetchMarketOverview(
  client: TushareClient,
  date?: string
): Promise<MarketOverview> {
  const tradeDate = date || getRecentTradeDate()

  // Check cache
  const cached = getCached(tradeDate)
  if (cached) {
    console.log(`[Market] Using cached data for ${tradeDate}`)
    return cached
  }

  console.log(`[Market] Fetching market overview for ${tradeDate}...`)

  // Fetch all data in parallel
  const [indices, breadth, northbound, margin, stats] = await Promise.all([
    fetchIndices(client, tradeDate),
    fetchBreadth(client, tradeDate),
    fetchNorthbound(client, tradeDate),
    fetchMargin(client, tradeDate),
    fetchMarketStats(client, tradeDate)
  ])

  const overview: MarketOverview = {
    date: tradeDate,
    indices,
    breadth,
    northbound,
    margin,
    stats
  }

  // Cache the result
  setCache(tradeDate, overview)
  console.log(`[Market] Market overview ready: ${indices.length} indices, ${breadth.totalCount} stocks, ${northbound.length} northbound days, ${margin.length} margin days`)

  return overview
}

export function clearMarketCache(): void {
  marketCache.clear()
}
