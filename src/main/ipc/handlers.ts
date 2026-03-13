import { ipcMain } from 'electron'
import { TushareClient } from '../tushare/client'
import { loadStockList, searchStocks, clearStockListCache } from '../tushare/stockList'
import { getToken, setToken, loadConfig, saveConfig, getAIConfig, setAIConfig, type AIConfig } from '../store'
import type { KLineData, Timeframe, CompanyInfo, StockFundamental, QuarterlyFinancial, LimitStock, SentimentLadderData, BoardLevel, DayTrend, SectorRotationData, SectorDaySnapshot, SectorDayRecord, SectorCumRank, SectorMembersResult, SectorMemberStock } from '../../shared/types'
import { fetchMarketOverview, clearMarketCache } from '../market/marketData'
import { ensureHistoryProfiles, getStockProfile, clearProfileCache, getTradingDayProgress } from '../market/historyProfile'
import { analyzeMarket } from '../ai/aiClient'

let tushareClient: TushareClient

// ==================== K-Line Data Cache (Main Process) ====================

interface KLineCacheEntry {
  data: KLineData[]
  timestamp: number
}

const klineCache = new Map<string, KLineCacheEntry>()

const CACHE_TTL: Record<string, number> = {
  daily: 2 * 60 * 1000,     // 2 minutes (real-time daily updates frequently)
  '60min': 3 * 60 * 1000,   // 3 minutes
  '30min': 2 * 60 * 1000,   // 2 minutes
  '15min': 2 * 60 * 1000,   // 2 minutes
  '5min': 1 * 60 * 1000,    // 1 minute
  '1min': 30 * 1000          // 30 seconds
}

function getCachedKLine(key: string, timeframe: string): KLineData[] | null {
  const entry = klineCache.get(key)
  if (!entry) return null
  const ttl = CACHE_TTL[timeframe] || 5 * 60 * 1000
  if (Date.now() - entry.timestamp > ttl) {
    klineCache.delete(key)
    return null
  }
  return entry.data
}

function setCachedKLine(key: string, data: KLineData[]): void {
  klineCache.set(key, { data, timestamp: Date.now() })

  // Evict if too many entries
  if (klineCache.size > 100) {
    const entries = Array.from(klineCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 20; i++) {
      klineCache.delete(entries[i][0])
    }
  }
}

// ==================== Helpers ====================

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function parseDailyKLine(fields: string[], items: any[][]): KLineData[] {
  return items
    .map((item) => {
      const obj: Record<string, any> = {}
      fields.forEach((f, i) => {
        obj[f] = item[i]
      })
      const dateStr = String(obj.trade_date)
      const year = parseInt(dateStr.substring(0, 4))
      const month = parseInt(dateStr.substring(4, 6)) - 1
      const day = parseInt(dateStr.substring(6, 8))
      return {
        timestamp: new Date(year, month, day).getTime(),
        open: Number(obj.open),
        high: Number(obj.high),
        low: Number(obj.low),
        close: Number(obj.close),
        volume: Number(obj.vol),
        amount: Number(obj.amount)
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp)
}

function parseMinuteKLine(fields: string[], items: any[][]): KLineData[] {
  return items
    .map((item) => {
      const obj: Record<string, any> = {}
      fields.forEach((f, i) => {
        obj[f] = item[i]
      })
      return {
        timestamp: new Date(obj.trade_time).getTime(),
        open: Number(obj.open),
        high: Number(obj.high),
        low: Number(obj.low),
        close: Number(obj.close),
        volume: Number(obj.vol),
        amount: Number(obj.amount)
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp)
}

// ==================== Real-time Bar Parser ====================

function parseRealTimeBar(fields: string[], item: any[]): KLineData | null {
  try {
    const obj: Record<string, any> = {}
    fields.forEach((f, i) => {
      obj[f] = item[i]
    })

    // rt_k returns vol in 股 (shares), amount in 元
    // historical daily returns vol in 手 (lots, 1 lot = 100 shares), amount in 千元
    // Normalize rt_k to match historical units: vol → 手, amount → 千元
    const vol = Number(obj.vol || 0) / 100
    const amount = Number(obj.amount || 0) / 1000

    // Use trade_time if available, otherwise use today's date
    let timestamp: number
    if (obj.trade_time) {
      timestamp = new Date(obj.trade_time).getTime()
    } else {
      const now = new Date()
      timestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    }

    // Set timestamp to start of day for date comparison
    const d = new Date(timestamp)
    timestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

    return {
      timestamp,
      open: Number(obj.open || 0),
      high: Number(obj.high || 0),
      low: Number(obj.low || 0),
      close: Number(obj.close || 0),
      volume: vol,
      amount: amount
    }
  } catch (e) {
    console.error('[KLine] Failed to parse real-time bar:', e)
    return null
  }
}

function isSameDate(ts1: number, ts2: number): boolean {
  const d1 = new Date(ts1)
  const d2 = new Date(ts2)
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

// ==================== Sentiment Ladder Logic ====================

interface ParsedLimitStock {
  ts_code: string
  name: string
  industry: string
  close: number
  pct_chg: number
  fc_ratio: number
  fd_amount: number
  first_time: string
  last_time: string
  open_times: number
  strth: number
}

interface SentimentDayData {
  date: string
  limitUp: ParsedLimitStock[]
  limitDown: ParsedLimitStock[]
}

function parseLimitList(resp: any): ParsedLimitStock[] {
  if (!resp?.data?.items?.length) return []
  const fields: string[] = resp.data.fields
  return resp.data.items.map((item: any[]) => {
    const obj: Record<string, any> = {}
    fields.forEach((f, i) => { obj[f] = item[i] })
    return {
      ts_code: String(obj.ts_code || ''),
      name: String(obj.name || ''),
      industry: String(obj.industry || ''),
      close: Number(obj.close || 0),
      pct_chg: Number(obj.pct_chg || 0),
      fc_ratio: Number(obj.fc_ratio || 0),
      fd_amount: Number(obj.fd_amount || 0),
      first_time: String(obj.first_time || ''),
      last_time: String(obj.last_time || ''),
      open_times: Number(obj.open_times || 0),
      strth: Number(obj.strth || 1),
    }
  })
}

function getRecentBusinessDates(count: number): string[] {
  const dates: string[] = []
  const now = new Date()
  // Always include today - if data isn't available yet, it will be skipped
  // during the "upStocks.length > 0" check
  for (let i = 0; dates.length < count && i < 50; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(formatDate(d))
    }
  }
  return dates
}

function getLimitPct(tsCode: string): number {
  if (tsCode.startsWith('30') || tsCode.startsWith('688')) return 20
  return 10
}

/**
 * Compute consecutive board counts (strth) from multi-day data.
 * The API's strth field is often null, so we derive it by checking
 * which stocks appear in limit-up lists across consecutive trading days.
 * dayDataList is ordered newest-first: [0]=latest, [len-1]=oldest.
 */
function computeConsecutiveBoards(dayDataList: SentimentDayData[]): void {
  // Process from oldest to newest
  for (let i = dayDataList.length - 1; i >= 0; i--) {
    const currentDay = dayDataList[i]
    const olderDay = i + 1 < dayDataList.length ? dayDataList[i + 1] : null

    if (!olderDay) {
      // Oldest day - trust API strth if > 1, otherwise keep default 1
      continue
    }

    const prevStocks = new Map<string, number>()
    for (const s of olderDay.limitUp) {
      prevStocks.set(s.ts_code, s.strth)
    }

    for (const stock of currentDay.limitUp) {
      const prevStrth = prevStocks.get(stock.ts_code)
      if (prevStrth !== undefined) {
        stock.strth = prevStrth + 1
      } else {
        stock.strth = 1
      }
    }
  }
}

function computePromotionRate(prevDay: ParsedLimitStock[], currDay: ParsedLimitStock[], prevLevel: number): number {
  const prevAtLevel = prevDay.filter(s => s.strth === prevLevel)
  if (prevAtLevel.length === 0) return 0
  const prevCodes = new Set(prevAtLevel.map(s => s.ts_code))
  const promoted = currDay.filter(s => s.strth === prevLevel + 1 && prevCodes.has(s.ts_code))
  return (promoted.length / prevAtLevel.length) * 100
}

function computeHighPromotion(prevDay: ParsedLimitStock[], currDay: ParsedLimitStock[], minLevel: number): number {
  const prevHigh = prevDay.filter(s => s.strth >= minLevel)
  if (prevHigh.length === 0) return 0
  const prevCodes = new Set(prevHigh.map(s => s.ts_code))
  const promoted = currDay.filter(s => s.strth > minLevel && prevCodes.has(s.ts_code))
  return (promoted.length / prevHigh.length) * 100
}

async function fetchSentimentLadder(client: TushareClient): Promise<SentimentLadderData> {
  const TREND_DAYS = 10
  // Fetch extra days so we can compute consecutive boards accurately
  // (a 10-board stock needs 10 days of history)
  const EXTRA_SEED_DAYS = 10
  const candidateDates = getRecentBusinessDates(TREND_DAYS + EXTRA_SEED_DAYS)

  console.log(`[Sentiment] Fetching limit data for ${candidateDates.length} candidate dates: ${candidateDates.slice(0, 5).join(', ')}...`)

  // Fetch data with controlled concurrency to avoid rate-limiting
  const limitUpResults: (any | null)[] = []
  const limitDownResults: (any | null)[] = []

  // Batch requests: 5 dates at a time
  for (let batch = 0; batch < candidateDates.length; batch += 5) {
    const batchDates = candidateDates.slice(batch, batch + 5)
    const [upBatch, downBatch] = await Promise.all([
      Promise.all(batchDates.map(d => client.getLimitListFull(d, 'U').catch((e) => {
        console.error(`[Sentiment] getLimitListFull(${d}, U) error:`, e?.message || e)
        return null
      }))),
      Promise.all(batchDates.map(d => client.getLimitListFull(d, 'D').catch((e) => {
        console.error(`[Sentiment] getLimitListFull(${d}, D) error:`, e?.message || e)
        return null
      }))),
    ])
    limitUpResults.push(...upBatch)
    limitDownResults.push(...downBatch)
  }

  // Log first non-null response for diagnostics
  const firstUp = limitUpResults.find(r => r != null)
  const firstIdx = limitUpResults.indexOf(firstUp)
  if (firstUp) {
    console.log(`[Sentiment] First valid response (${candidateDates[firstIdx]}, U): code=${firstUp.code}, msg=${firstUp.msg}, fields=${firstUp.data?.fields?.join(',') ?? 'none'}, itemCount=${firstUp.data?.items?.length ?? 0}`)
    // Log a sample strth value from the API
    if (firstUp.data?.items?.length > 0) {
      const strthIdx = firstUp.data.fields?.indexOf('strth')
      const sampleStrth = strthIdx >= 0 ? firstUp.data.items.slice(0, 3).map((item: any[]) => item[strthIdx]) : 'field not found'
      console.log(`[Sentiment] API strth sample values:`, sampleStrth)
    }
  } else {
    console.log(`[Sentiment] All responses returned null (network errors)`)
  }

  // Collect ALL available day data (including extra seed days for consecutive board computation)
  const allDayData: SentimentDayData[] = []
  for (let i = 0; i < candidateDates.length; i++) {
    const upStocks = parseLimitList(limitUpResults[i])
    const downStocks = parseLimitList(limitDownResults[i])
    if (upStocks.length > 0 || downStocks.length > 0) {
      allDayData.push({ date: candidateDates[i], limitUp: upStocks, limitDown: downStocks })
    }
  }

  if (allDayData.length === 0) {
    const errDetail = firstUp ? `API code=${firstUp.code}, msg=${firstUp.msg}` : 'API 无响应'
    throw new Error(`未获取到涨停数据 (${errDetail})，请检查 Tushare Token 是否有 limit_list 接口权限 (需2000积分)`)
  }

  // Compute consecutive board counts from multi-day data
  computeConsecutiveBoards(allDayData)

  // Only keep TREND_DAYS for display (but the extra seed days helped seed strth)
  const dayDataList = allDayData.slice(0, TREND_DAYS)

  // Fetch daily data for broken board detection (use latest available trading day)
  const dailyAllResult = await client.getDailyAll(dayDataList[0].date).catch(() => null)

  const today = dayDataList[0]
  const highestStrth = Math.max(...today.limitUp.map(s => s.strth), 0)
  console.log(`[Sentiment] Latest (${today.date}): ${today.limitUp.length} limit-up, ${today.limitDown.length} limit-down, highest board: ${highestStrth}`)

  // Build ladder
  const ladderMap = new Map<number, ParsedLimitStock[]>()
  for (const stock of today.limitUp) {
    const level = stock.strth || 1
    if (!ladderMap.has(level)) ladderMap.set(level, [])
    ladderMap.get(level)!.push(stock)
  }
  const ladder: BoardLevel[] = Array.from(ladderMap.entries())
    .map(([level, stocks]) => ({
      level,
      stocks: stocks.sort((a, b) => (a.first_time || '99:99').localeCompare(b.first_time || '99:99'))
    }))
    .sort((a, b) => b.level - a.level)

  const highestBoard = ladder.length > 0 ? ladder[0].level : 0

  // Compute broken boards for today
  let breakCount = 0
  const sealCount = today.limitUp.length
  if (dailyAllResult?.data?.items?.length) {
    const fields: string[] = dailyAllResult.data.fields
    const limitUpSet = new Set(today.limitUp.map(s => s.ts_code))

    for (const item of dailyAllResult.data.items) {
      const obj: Record<string, any> = {}
      fields.forEach((f, i) => { obj[f] = item[i] })
      const tsCode = String(obj.ts_code || '')
      if (limitUpSet.has(tsCode)) continue
      const close = Number(obj.close || 0)
      const high = Number(obj.high || 0)
      const pctChg = Number(obj.pct_chg || 0)
      if (close <= 0 || high <= 0) continue

      const preClose = close / (1 + pctChg / 100)
      const limitPct = getLimitPct(tsCode)
      const limitPrice = preClose * (1 + limitPct / 100)

      if (high >= limitPrice * 0.998) {
        breakCount++
      }
    }
  }

  const totalTouched = sealCount + breakCount
  const sealRate = totalTouched > 0 ? (sealCount / totalTouched) * 100 : 0
  const breakRate = totalTouched > 0 ? (breakCount / totalTouched) * 100 : 0

  // Promotion rates
  let todayPromotion1to2 = 0
  let todayHighPromotion = 0
  if (dayDataList.length >= 2) {
    const prevDay = dayDataList[1].limitUp
    todayPromotion1to2 = computePromotionRate(prevDay, today.limitUp, 1)
    todayHighPromotion = computeHighPromotion(prevDay, today.limitUp, 3)
  }

  // Build trend
  const trend: DayTrend[] = []
  for (let i = 0; i < dayDataList.length; i++) {
    const day = dayDataList[i]
    const prevDay = i + 1 < dayDataList.length ? dayDataList[i + 1] : null

    let p1to2 = 0, p2to3 = 0, p3to4 = 0, pHigh = 0
    if (prevDay) {
      p1to2 = computePromotionRate(prevDay.limitUp, day.limitUp, 1)
      p2to3 = computePromotionRate(prevDay.limitUp, day.limitUp, 2)
      p3to4 = computePromotionRate(prevDay.limitUp, day.limitUp, 3)
      pHigh = computeHighPromotion(prevDay.limitUp, day.limitUp, 3)
    }

    let dayBreakCount = 0
    const daySealCount = day.limitUp.length
    if (i === 0) {
      dayBreakCount = breakCount
    } else {
      const stocksWithOpens = day.limitUp.filter(s => s.open_times > 0).length
      dayBreakCount = Math.max(stocksWithOpens, Math.round(daySealCount * 0.2))
    }
    const dayTotal = daySealCount + dayBreakCount
    const dayBreakRate = dayTotal > 0 ? (dayBreakCount / dayTotal) * 100 : 0
    const daySealRate = dayTotal > 0 ? (daySealCount / dayTotal) * 100 : 0

    trend.push({
      date: day.date,
      limitUpCount: day.limitUp.length,
      limitDownCount: day.limitDown.length,
      breakCount: dayBreakCount,
      breakRate: dayBreakRate,
      sealRate: daySealRate,
      promotion1to2: p1to2,
      promotion2to3: p2to3,
      promotion3to4: p3to4,
      promotionHigh: pHigh,
    })
  }

  trend.reverse()

  return {
    date: today.date,
    ladder,
    stats: {
      limitUpCount: sealCount,
      limitDownCount: today.limitDown.length,
      highestBoard,
      sealRate: Math.round(sealRate * 10) / 10,
      breakRate: Math.round(breakRate * 10) / 10,
      breakCount,
      sealCount,
      highBoardPromotionRate: Math.round(todayHighPromotion * 10) / 10,
      promotion1to2: Math.round(todayPromotion1to2 * 10) / 10,
    },
    trend,
  }
}

// ==================== Sector Rotation Logic ====================

async function fetchSectorRotation(client: TushareClient): Promise<SectorRotationData> {
  const DAYS = 20

  // 1. Get concept index list
  const indexResp = await client.getThsIndex('N')
  if (indexResp.code !== 0 || !indexResp.data || indexResp.data.items.length === 0) {
    throw new Error('获取同花顺概念指数列表失败，请确认 Token 有 ths_index 权限 (需5000积分)')
  }

  const indexFields = indexResp.data.fields
  const conceptMap = new Map<string, string>()
  for (const item of indexResp.data.items) {
    const obj: Record<string, any> = {}
    indexFields.forEach((f, i) => { obj[f] = item[i] })
    conceptMap.set(String(obj.ts_code), String(obj.name || ''))
  }
  console.log(`[Sector] Loaded ${conceptMap.size} concept indices`)

  // 2. Fetch daily data for recent trading days
  const candidateDates = getRecentBusinessDates(DAYS + 5)

  const dailyResults: (any | null)[] = []
  for (let batch = 0; batch < candidateDates.length; batch += 5) {
    const batchDates = candidateDates.slice(batch, batch + 5)
    const batchResults = await Promise.all(
      batchDates.map(d => client.getThsDaily(d).catch((e) => {
        console.error(`[Sector] getThsDaily(${d}) error:`, e?.message || e)
        return null
      }))
    )
    dailyResults.push(...batchResults)
  }

  // 3. Parse into per-date maps: ts_code -> { pct_change, close }
  interface DayEntry { ts_code: string; pct_change: number; close: number }
  const dayMaps: { date: string; entries: Map<string, DayEntry> }[] = []

  for (let i = 0; i < candidateDates.length && dayMaps.length < DAYS; i++) {
    const resp = dailyResults[i]
    if (!resp?.data?.items?.length) continue

    const fields: string[] = resp.data.fields
    const entries = new Map<string, DayEntry>()
    for (const item of resp.data.items) {
      const obj: Record<string, any> = {}
      fields.forEach((f, idx) => { obj[f] = item[idx] })
      const code = String(obj.ts_code || '')
      if (!conceptMap.has(code)) continue
      entries.set(code, {
        ts_code: code,
        pct_change: Number(obj.pct_change || 0),
        close: Number(obj.close || 0),
      })
    }
    if (entries.size > 0) {
      dayMaps.push({ date: candidateDates[i], entries })
    }
  }

  if (dayMaps.length === 0) {
    throw new Error('未获取到板块行情数据')
  }

  console.log(`[Sector] Got data for ${dayMaps.length} trading days, latest: ${dayMaps[0].date}`)

  // 4. Build daily top 5
  const dailyTop5: SectorDaySnapshot[] = dayMaps.map(day => {
    const sorted = Array.from(day.entries.values())
      .sort((a, b) => b.pct_change - a.pct_change)
      .slice(0, 5)
    return {
      date: day.date,
      top5: sorted.map(s => ({
        ts_code: s.ts_code,
        name: conceptMap.get(s.ts_code) || s.ts_code,
        pct_change: Math.round(s.pct_change * 100) / 100,
        close: s.close,
      })),
    }
  })

  // 5. Build cumulative rankings (5d / 10d / 20d)
  // Gather all concept codes that appear in the data
  const allCodes = new Set<string>()
  for (const day of dayMaps) {
    for (const code of day.entries.keys()) allCodes.add(code)
  }

  const cumRanking: SectorCumRank[] = []
  for (const code of allCodes) {
    const name = conceptMap.get(code) || code
    let cum5 = 0, cum10 = 0, cum20 = 0
    // dayMaps[0] is newest; compute cumulative from the close prices
    // Use compound: (latest_close / ref_close - 1) * 100
    const latestEntry = dayMaps[0]?.entries.get(code)
    if (!latestEntry || latestEntry.close <= 0) continue

    const latestClose = latestEntry.close

    const getRefClose = (daysBack: number): number => {
      const idx = Math.min(daysBack, dayMaps.length - 1)
      const entry = dayMaps[idx]?.entries.get(code)
      return entry && entry.close > 0 ? entry.close : 0
    }

    const ref5 = getRefClose(5)
    const ref10 = getRefClose(10)
    const ref20 = getRefClose(dayMaps.length - 1)

    if (ref5 > 0) cum5 = ((latestClose / ref5) - 1) * 100
    if (ref10 > 0) cum10 = ((latestClose / ref10) - 1) * 100
    if (ref20 > 0) cum20 = ((latestClose / ref20) - 1) * 100

    cumRanking.push({
      ts_code: code,
      name,
      pct_5d: Math.round(cum5 * 100) / 100,
      pct_10d: Math.round(cum10 * 100) / 100,
      pct_20d: Math.round(cum20 * 100) / 100,
    })
  }

  // Sort by 5d cumulative desc by default
  cumRanking.sort((a, b) => b.pct_5d - a.pct_5d)

  return {
    date: dayMaps[0].date,
    dailyTop5,
    cumRanking,
  }
}

// ==================== Sector Members (Treemap) ====================

const sectorMemberCache = new Map<string, { data: SectorMembersResult; ts: number }>()
const MEMBER_CACHE_TTL = 5 * 60 * 1000

async function fetchSectorMembers(
  client: TushareClient,
  sectorCode: string,
  sectorName: string,
  tradeDate: string
): Promise<SectorMembersResult> {
  const cacheKey = `${sectorCode}_${tradeDate}`
  const cached = sectorMemberCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < MEMBER_CACHE_TTL) {
    return cached.data
  }

  const memberResp = await client.getThsMember(sectorCode)
  if (memberResp.code !== 0 || !memberResp.data || memberResp.data.items.length === 0) {
    throw new Error(`获取板块 ${sectorName} 成分股失败 (code=${memberResp.code}, msg=${memberResp.msg})`)
  }

  const memberFields = memberResp.data.fields
  console.log(`[SectorMember] ths_member fields: [${memberFields.join(', ')}], items: ${memberResp.data.items.length}`)
  if (memberResp.data.items.length > 0) {
    console.log(`[SectorMember] sample item:`, JSON.stringify(memberResp.data.items[0]))
  }

  const memberCodes = new Set<string>()
  const nameMap = new Map<string, string>()
  for (const item of memberResp.data.items) {
    const obj: Record<string, any> = {}
    memberFields.forEach((f, i) => { obj[f] = item[i] })
    // ths_member may use 'code' or 'con_code' for the stock code field
    const code = String(obj.code || obj.con_code || obj.stk_code || '')
    const name = String(obj.name || obj.con_name || obj.stk_name || '')
    if (code) {
      memberCodes.add(code)
      nameMap.set(code, name)
    }
  }
  console.log(`[SectorMember] parsed ${memberCodes.size} member codes, sample: ${Array.from(memberCodes).slice(0, 3).join(', ')}`)

  const dailyResp = await client.getDailyAll(tradeDate)
  if (dailyResp.code !== 0 || !dailyResp.data) {
    throw new Error('获取日线行情失败')
  }

  console.log(`[SectorMember] daily fields: [${dailyResp.data.fields.join(', ')}], items: ${dailyResp.data.items.length}`)

  const dailyFields = dailyResp.data.fields
  const stocks: SectorMemberStock[] = []
  for (const item of dailyResp.data.items) {
    const obj: Record<string, any> = {}
    dailyFields.forEach((f, i) => { obj[f] = item[i] })
    const code = String(obj.ts_code || '')
    if (!memberCodes.has(code)) continue
    stocks.push({
      ts_code: code,
      name: nameMap.get(code) || code,
      pct_chg: Number(obj.pct_chg || 0),
      close: Number(obj.close || 0),
      amount: Number(obj.amount || 0),
    })
  }

  console.log(`[SectorMember] matched ${stocks.length} stocks from daily data`)

  stocks.sort((a, b) => b.pct_chg - a.pct_chg)
  const topN = stocks.slice(0, 20)

  const result: SectorMembersResult = {
    sector_name: sectorName,
    date: tradeDate,
    stocks: topN,
  }

  sectorMemberCache.set(cacheKey, { data: result, ts: Date.now() })

  if (sectorMemberCache.size > 50) {
    const entries = Array.from(sectorMemberCache.entries())
      .sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < 20; i++) sectorMemberCache.delete(entries[i][0])
  }

  return result
}

// ==================== Error Classification ====================

function classifyApiError(error: any): string {
  const msg = String(error?.message || error || '')
  const lower = msg.toLowerCase()

  if (lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('network')) {
    return '网络连接超时，请检查网络后重试'
  }
  if (lower.includes('token') || lower.includes('认证') || lower.includes('auth')) {
    return 'Token 验证失败，请检查 Token 是否正确'
  }
  if (lower.includes('权限') || lower.includes('permission')) {
    return '接口权限不足，日线需要 2000+ 积分，分钟数据需单独开通'
  }

  return msg || '请求失败'
}

// ==================== IPC Handlers ====================

export function registerIpcHandlers(): void {
  const token = getToken()
  tushareClient = new TushareClient(token)

  // ---- Token ----
  ipcMain.handle('get-token', () => getToken())

  ipcMain.handle('set-token', (_event, newToken: string) => {
    setToken(newToken)
    tushareClient.setToken(newToken)
    clearStockListCache()
    klineCache.clear() // Clear data cache when token changes
    clearMarketCache()
    clearProfileCache()
    return true
  })

  // ---- Stock Search ----
  ipcMain.handle('load-stock-list', async () => {
    try {
      const list = await loadStockList(tushareClient)
      return { success: true, data: list }
    } catch (e: any) {
      return { success: false, error: classifyApiError(e) }
    }
  })

  ipcMain.handle('search-stocks', (_event, keyword: string) => {
    return searchStocks(keyword)
  })

  // ---- K-line Data ----
  ipcMain.handle(
    'get-kline-data',
    async (_event, tsCode: string, timeframe: Timeframe) => {
      try {
        if (!tushareClient.getToken()) {
          return { success: false, error: '请先配置 Tushare Token' }
        }

        // Check main-process cache
        const cacheKey = `${tsCode}:${timeframe}`
        const cached = getCachedKLine(cacheKey, timeframe)
        if (cached) {
          return { success: true, data: cached }
        }

        let klineData: KLineData[]

        if (timeframe === 'daily') {
          // Fetch historical daily data + real-time today's data in parallel
          const endDate = new Date()
          const startDate = new Date()
          startDate.setDate(startDate.getDate() - 500)

          const [histResponse, rtResponse] = await Promise.all([
            tushareClient.getDailyData(tsCode, formatDate(startDate), formatDate(endDate)),
            tushareClient.getRealTimeDaily(tsCode).catch(() => null) // Don't fail if rt_k unavailable
          ])

          if (histResponse.code !== 0 || !histResponse.data) {
            const apiMsg = histResponse.msg || 'Tushare API 返回错误'
            return { success: false, error: classifyApiError(apiMsg) }
          }

          klineData = parseDailyKLine(histResponse.data.fields, histResponse.data.items)

          // Merge real-time today's bar if available
          if (rtResponse && rtResponse.code === 0 && rtResponse.data && rtResponse.data.items.length > 0) {
            const rtBar = parseRealTimeBar(rtResponse.data.fields, rtResponse.data.items[0])
            if (rtBar && rtBar.volume > 0) {
              // Check if the last historical bar is the same date as rt bar
              const lastHist = klineData.length > 0 ? klineData[klineData.length - 1] : null
              const sameDay = lastHist && isSameDate(lastHist.timestamp, rtBar.timestamp)

              if (sameDay) {
                // Replace the last bar with real-time data (more up-to-date)
                klineData[klineData.length - 1] = rtBar
              } else {
                // Append as a new bar (today hasn't been settled yet in historical)
                klineData.push(rtBar)
              }
              console.log(`[KLine] Merged real-time bar for ${tsCode}: close=${rtBar.close}`)
            }
          }
        } else {
          const freq = timeframe.replace('min', '')
          const response = await tushareClient.getMinuteData(tsCode, freq)

          if (response.code !== 0 || !response.data) {
            const apiMsg = response.msg || 'Tushare API 返回错误'
            return { success: false, error: classifyApiError(apiMsg) }
          }

          if (response.data.items.length === 0) {
            return { success: false, error: '无数据返回，请检查股票代码或 Token 权限' }
          }

          klineData = parseMinuteKLine(response.data.fields, response.data.items)
        }

        if (klineData.length === 0) {
          return { success: false, error: '无数据返回，请检查股票代码或 Token 权限' }
        }

        // Cache the result
        setCachedKLine(cacheKey, klineData)

        return { success: true, data: klineData }
      } catch (e: any) {
        return { success: false, error: classifyApiError(e) }
      }
    }
  )

  // ---- Recent Stocks ----
  ipcMain.handle('get-recent-stocks', () => {
    return loadConfig().recentStocks || []
  })

  ipcMain.handle('add-recent-stock', (_event, tsCode: string) => {
    const config = loadConfig()
    const recent = config.recentStocks || []
    const filtered = recent.filter((s) => s !== tsCode)
    filtered.unshift(tsCode)
    saveConfig({ recentStocks: filtered.slice(0, 10) })
    return true
  })

  // ---- Market Dashboard ----
  ipcMain.handle('get-market-overview', async (_event, date?: string) => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: '请先配置 Tushare Token' }
      }
      const overview = await fetchMarketOverview(tushareClient, date)
      return { success: true, data: overview }
    } catch (e: any) {
      return { success: false, error: classifyApiError(e) }
    }
  })

  // ---- Real-time Bar (lightweight, no cache) ----
  ipcMain.handle('refresh-realtime-bar', async (_event, tsCode: string) => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: 'No token' }
      }
      const rtResponse = await tushareClient.getRealTimeDaily(tsCode)
      if (rtResponse.code !== 0 || !rtResponse.data || rtResponse.data.items.length === 0) {
        return { success: false, error: 'No real-time data' }
      }
      const rtBar = parseRealTimeBar(rtResponse.data.fields, rtResponse.data.items[0])
      if (!rtBar || rtBar.volume <= 0) {
        return { success: false, error: 'Invalid real-time bar' }
      }
      return { success: true, data: rtBar }
    } catch (e: any) {
      return { success: false, error: e.message || 'Real-time fetch failed' }
    }
  })

  // ---- Company Info (cached in memory, rarely changes) ----
  const companyInfoCache = new Map<string, CompanyInfo>()

  ipcMain.handle('get-stock-company', async (_event, tsCode: string) => {
    const cached = companyInfoCache.get(tsCode)
    if (cached) return { success: true, data: cached }

    try {
      const resp = await tushareClient.getStockCompany(tsCode)
      if (resp.code === 0 && resp.data && resp.data.items.length > 0) {
        const fields = resp.data.fields
        const item = resp.data.items[0]
        const obj: Record<string, any> = {}
        fields.forEach((f, i) => { obj[f] = item[i] })

        const info: CompanyInfo = {
          ts_code: String(obj.ts_code || ''),
          chairman: String(obj.chairman || ''),
          reg_capital: String(obj.reg_capital || ''),
          setup_date: String(obj.setup_date || ''),
          introduction: String(obj.introduction || ''),
          main_business: String(obj.main_business || ''),
          business_scope: String(obj.business_scope || ''),
          employees: Number(obj.employees || 0)
        }

        companyInfoCache.set(tsCode, info)
        return { success: true, data: info }
      }
      return { success: false, error: '未找到公司信息' }
    } catch (e: any) {
      return { success: false, error: e.message || '获取公司信息失败' }
    }
  })

  // ---- Stock Fundamental Data (cached 5 min) ----
  const fundamentalCache = new Map<string, { data: StockFundamental; timestamp: number }>()
  const FUNDAMENTAL_TTL = 5 * 60 * 1000

  ipcMain.handle('get-stock-fundamental', async (_event, tsCode: string) => {
    // Check cache
    const cached = fundamentalCache.get(tsCode)
    if (cached && Date.now() - cached.timestamp < FUNDAMENTAL_TTL) {
      return { success: true, data: cached.data }
    }

    try {
      // Fetch all 3 data sources in parallel
      const [basicResp, incomeResp, finaResp] = await Promise.all([
        tushareClient.getDailyBasic(tsCode).catch(() => null),
        tushareClient.getIncome(tsCode).catch(() => null),
        tushareClient.getFinaIndicator(tsCode).catch(() => null)
      ])

      // Parse daily_basic (take latest row)
      let total_mv = 0, circ_mv = 0, pe = 0, pe_ttm = 0, pb = 0, ps_ttm = 0, total_share = 0, float_share = 0
      if (basicResp && basicResp.code === 0 && basicResp.data && basicResp.data.items.length > 0) {
        const fields = basicResp.data.fields
        const item = basicResp.data.items[0]
        const obj: Record<string, any> = {}
        fields.forEach((f, i) => { obj[f] = item[i] })
        total_mv = Number(obj.total_mv || 0)
        circ_mv = Number(obj.circ_mv || 0)
        pe = Number(obj.pe || 0)
        pe_ttm = Number(obj.pe_ttm || 0)
        pb = Number(obj.pb || 0)
        ps_ttm = Number(obj.ps_ttm || 0)
        total_share = Number(obj.total_share || 0)
        float_share = Number(obj.float_share || 0)
      }

      // Parse fina_indicator (take latest row)
      let roe = 0, roa = 0, grossprofit_margin = 0, netprofit_margin = 0, debt_to_assets = 0, netprofit_yoy = 0, tr_yoy = 0
      if (finaResp && finaResp.code === 0 && finaResp.data && finaResp.data.items.length > 0) {
        const fields = finaResp.data.fields
        const item = finaResp.data.items[0]
        const obj: Record<string, any> = {}
        fields.forEach((f, i) => { obj[f] = item[i] })
        roe = Number(obj.roe || 0)
        roa = Number(obj.roa || 0)
        grossprofit_margin = Number(obj.grossprofit_margin || 0)
        netprofit_margin = Number(obj.netprofit_margin || 0)
        debt_to_assets = Number(obj.debt_to_assets || 0)
        netprofit_yoy = Number(obj.netprofit_yoy || 0)
        tr_yoy = Number(obj.tr_yoy || 0)
      }

      // Parse income (last 8 quarters, deduplicated by end_date)
      const quarters: QuarterlyFinancial[] = []
      if (incomeResp && incomeResp.code === 0 && incomeResp.data && incomeResp.data.items.length > 0) {
        const fields = incomeResp.data.fields
        const seen = new Set<string>()
        for (const item of incomeResp.data.items) {
          const obj: Record<string, any> = {}
          fields.forEach((f, i) => { obj[f] = item[i] })
          const period = String(obj.end_date || '')
          if (!period || seen.has(period)) continue
          seen.add(period)
          quarters.push({
            period,
            revenue: Number(obj.revenue || 0),
            n_income: Number(obj.n_income_attr_p || 0),
            basic_eps: Number(obj.basic_eps || 0)
          })
          if (quarters.length >= 8) break
        }
        // Sort by period descending (most recent first)
        quarters.sort((a, b) => b.period.localeCompare(a.period))
      }

      const result: StockFundamental = {
        total_mv, circ_mv, pe, pe_ttm, pb, ps_ttm, total_share, float_share,
        roe, roa, grossprofit_margin, netprofit_margin, debt_to_assets, netprofit_yoy, tr_yoy,
        quarters
      }

      fundamentalCache.set(tsCode, { data: result, timestamp: Date.now() })
      return { success: true, data: result }
    } catch (e: any) {
      console.error('[Fundamental] Error:', e)
      return { success: false, error: e.message || '获取基本面数据失败' }
    }
  })

  // ---- AI Config ----
  ipcMain.handle('get-ai-config', () => {
    return getAIConfig()
  })

  ipcMain.handle('set-ai-config', (_event, config: Partial<AIConfig>) => {
    setAIConfig(config)
    return true
  })

  // ---- AI Analysis ----
  ipcMain.handle('analyze-market', async (_event, marketDataText: string, model?: string) => {
    try {
      const aiConfig = getAIConfig()
      const useModel = model || aiConfig.models.split(',')[0]?.trim() || 'deepseek-v3.2'
      const result = await analyzeMarket(aiConfig.apiKey, useModel, marketDataText)
      return { success: true, data: result }
    } catch (e: any) {
      return { success: false, error: e.message || 'AI 分析失败' }
    }
  })

  // ---- Sentiment Ladder ----
  ipcMain.handle('get-sentiment-ladder', async () => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: '请先配置 Tushare Token' }
      }
      const data = await fetchSentimentLadder(tushareClient)
      return { success: true, data }
    } catch (e: any) {
      console.error('[Sentiment] Error:', e)
      return { success: false, error: classifyApiError(e) }
    }
  })

  // ---- Sector Rotation ----
  ipcMain.handle('get-sector-rotation', async () => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: '请先配置 Tushare Token' }
      }
      const data = await fetchSectorRotation(tushareClient)
      return { success: true, data }
    } catch (e: any) {
      console.error('[Sector] Error:', e)
      return { success: false, error: classifyApiError(e) }
    }
  })

  // ---- Sector Members (for treemap heatmap) ----
  ipcMain.handle('get-sector-members', async (_event, sectorCode: string, sectorName: string, tradeDate: string) => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: '请先配置 Tushare Token' }
      }
      const data = await fetchSectorMembers(tushareClient, sectorCode, sectorName, tradeDate)
      return { success: true, data }
    } catch (e: any) {
      console.error('[SectorMember] Error:', e)
      return { success: false, error: classifyApiError(e) }
    }
  })

  // ---- Real-time Top Stocks (Breakout Scoring) ----
  let stockListCache: { ts_code: string; name: string }[] | null = null
  let lastStockListFetch = 0
  
  ipcMain.handle('get-realtime-top-stocks', async (_event, limit: number = 50) => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: '请先配置 Tushare Token' }
      }

      // Get stock list (with cache, 24h)
      const now = Date.now()
      if (!stockListCache || now - lastStockListFetch > 24 * 60 * 60 * 1000) {
        const stockResp = await tushareClient.getStockBasic()
        if (stockResp.code !== 0 || !stockResp.data) {
          return { success: false, error: '获取股票列表失败' }
        }
        stockListCache = stockResp.data.items.map((item: any[]) => ({
          ts_code: item[0],
          name: item[2]
        }))
        lastStockListFetch = now
      }

      // Trigger history profile building in background (non-blocking, fire-and-forget)
      // First call of the day will start async build; subsequent calls use cached profiles
      ensureHistoryProfiles(tushareClient).catch(err => {
        console.error('[TopStocks] History profile build error:', err)
      })

      // Get real-time data for all stocks (batch request)
      const tsCodes = stockListCache.map(s => s.ts_code)
      const rtResponse = await tushareClient.getRealTimeDailyBatch(tsCodes)
      
      if (rtResponse.code !== 0 || !rtResponse.data) {
        return { success: false, error: '获取实时数据失败' }
      }

      // Trading day progress for volume ratio time adjustment
      const dayProgress = getTradingDayProgress()

      // Parse real-time data and compute breakout scores
      const fields = rtResponse.data.fields
      const stocks = rtResponse.data.items.map((item: any[]) => {
        const obj: Record<string, any> = {}
        fields.forEach((f, i) => { obj[f] = item[i] })
        
        const tsCode = String(obj.ts_code)
        const name = String(obj.name || '')
        const open = Number(obj.open || 0)
        const high = Number(obj.high || 0)
        const low = Number(obj.low || 0)
        const close = Number(obj.close || 0)
        const preClose = Number(obj.pre_close || 0)
        const vol = Number(obj.vol || 0)
        const amount = Number(obj.amount || 0) // 元 (rt_k 单位)
        
        // Basic metrics
        const changePct = preClose > 0 ? ((close - preClose) / preClose) * 100 : 0
        const amplitude = open > 0 ? ((high - low) / open) * 100 : 0

        // Get history profile (may be null if not yet built)
        const profile = getStockProfile(tsCode)

        // ================================================================
        // 突破评分系统 v2 — 连续计分, 比例归一化
        // 每个维度使用线性插值/对数函数, 避免离散阈值导致的同分聚集
        // 理论满分 110, 按比例映射到 0~100, 需全维度卓越才能接近满分
        // ================================================================

        // 按盘中时间推算全日成交额 (用于量比和成交额评分)
        const adjustedAmountYuan = dayProgress > 0 ? amount / dayProgress : amount

        // ====== 1. 位置突破 (0~30) — 核心维度, 连续 ======
        let positionScore = 0
        let breakoutTag = ''

        if (profile && profile.high_20d > 0) {
          const breakoutPct = ((close - profile.high_20d) / profile.high_20d) * 100

          if (breakoutPct >= 0) {
            // 创20日新高: 基础22分 + 每超出1%加2.5分, 上限30
            positionScore = Math.min(30, 22 + breakoutPct * 2.5)
            breakoutTag = breakoutPct >= 2 ? '强势新高' : '创20日新高'
          } else if (profile.consolidation_high > 0 && close > profile.consolidation_high) {
            // 平台突破: 基础16分 + 每超出1%加2.5分, 上限21
            const consolidationPct = ((close - profile.consolidation_high) / profile.consolidation_high) * 100
            positionScore = Math.min(21, 16 + consolidationPct * 2.5)
            breakoutTag = '平台突破'
          } else {
            // 在20日区间内: 按相对位置连续打分 0~15
            const range = profile.high_20d - profile.low_20d
            if (range > 0) {
              const position = (close - profile.low_20d) / range
              positionScore = Math.round(position * 15)
              if (position >= 0.9) breakoutTag = '接近突破'
            }
          }
        } else {
          // Fallback: 无历史画像, 按涨幅连续打分
          if (changePct > 0) positionScore = Math.min(20, Math.round(changePct * 2.5))
        }

        // ====== 2. 量能异动 (0~25) — 连续线性 ======
        let volumeScore = 0
        let volumeRatio = 0

        if (profile && profile.avg_amount_5d > 0) {
          const adjustedAmountQianYuan = adjustedAmountYuan / 1000
          volumeRatio = Number((adjustedAmountQianYuan / profile.avg_amount_5d).toFixed(2))

          // 连续: 量比0.5→0分, 1.0→5分, 1.5→10分, 2.0→15分, 3.0→25分
          volumeScore = Math.min(25, Math.max(0, Math.round((volumeRatio - 0.5) * 10)))

          // 20日量比持续放量奖励 (连续 0~3)
          if (profile.avg_amount_20d > 0) {
            const ratio20 = adjustedAmountQianYuan / profile.avg_amount_20d
            if (ratio20 >= 1.5) {
              volumeScore = Math.min(25, volumeScore + Math.min(3, Math.round((ratio20 - 1.5) * 2)))
            }
          }
        } else {
          // Fallback: 连续
          volumeScore = Math.min(25, Math.round(adjustedAmountYuan / 100000000 * 8))
        }

        // ====== 3. 成交额规模 (0~10) — 对数连续 ======
        // log2 曲线: 5000万≈2, 1亿≈3, 2亿≈5, 5亿≈8, 10亿≈10
        let amountScore = 0
        const amountYi = adjustedAmountYuan / 100000000  // 转为亿元
        if (amountYi > 0) {
          amountScore = Math.min(10, Math.max(0, Math.round(Math.log2(amountYi + 1) * 3)))
        }

        // ====== 4. 价格强度 (0~20) — 连续 ======
        let priceScore = 0

        // 涨幅: 连续打分 (每1%涨幅≈1.5分, 上限12)
        if (changePct > 0) {
          priceScore += Math.min(12, Math.round(changePct * 1.5))
        }

        // 收盘价在日内高低点的相对位置: 连续 0~8
        const dayRange = high - low
        if (dayRange > 0) {
          const highCloseRatio = (close - low) / dayRange
          priceScore += Math.round(highCloseRatio * 8)
        }
        priceScore = Math.min(20, priceScore)

        // ====== 5. 均线形态 (0~15) ======
        let maScore = 0

        if (profile && profile.ma5 > 0 && profile.ma10 > 0 && profile.ma20 > 0) {
          // 多头排列: ma5 > ma10 > ma20
          if (profile.ma5 > profile.ma10 && profile.ma10 > profile.ma20) maScore += 8
          else if (profile.ma5 > profile.ma10) maScore += 5
          else if (profile.ma5 > profile.ma20) maScore += 3

          // 价格站上均线 — 连续: 按超出幅度打分
          const aboveMa5 = close > profile.ma5 ? Math.min(1, (close - profile.ma5) / profile.ma5 * 20) : 0
          const aboveMa10 = close > profile.ma10 ? Math.min(1, (close - profile.ma10) / profile.ma10 * 15) : 0
          const aboveMa20 = close > profile.ma20 ? Math.min(1, (close - profile.ma20) / profile.ma20 * 10) : 0
          maScore += Math.round((aboveMa5 + aboveMa10 + aboveMa20) / 3 * 7)

          maScore = Math.min(15, maScore)
        } else {
          if (changePct > 0) maScore = Math.min(5, Math.round(changePct))
        }

        // ====== 6. K线质量 (0~10) — 连续 ======
        let candleScore = 0
        const bodySize = Math.abs(close - open)
        const totalSize = high - low

        if (totalSize > 0 && close > open) { // 仅阳线加分
          const bodyRatio = bodySize / totalSize
          const upperShadowRatio = (high - close) / totalSize

          // 实体占比: 连续 0~6
          candleScore += Math.round(bodyRatio * 6)

          // 上影线惩罚: 无上影=4分, 上影越长越少, 连续 0~4
          candleScore += Math.round(Math.max(0, 1 - upperShadowRatio * 3) * 4)
        }
        candleScore = Math.min(10, candleScore)

        // ====== 最终得分 — 比例归一化 ======
        // 理论满分: 30+25+10+20+15+10 = 110
        // 按比例映射到 0~100, 需全维度极致才能接近100
        const rawTotal = positionScore + volumeScore + amountScore + priceScore + maScore + candleScore
        const score = Math.min(100, Math.max(0, Math.round(rawTotal * 100 / 110)))

        return {
          ts_code: tsCode,
          name,
          close,
          changePct: Number(changePct.toFixed(2)),
          change: Number((close - preClose).toFixed(2)),
          volume: Math.floor(vol / 100), // 转换为手
          amount: Math.floor(amount / 10000), // 转换为万元 (formatAmount 期望万元)
          amplitude: Number(amplitude.toFixed(2)),
          score,
          pre_close: preClose,
          open,
          high,
          low,
          volumeRatio,
          breakoutTag
        }
      })

      // Sort by score descending and take top N
      const topStocks = stocks
        .filter(s => s.volume > 0 && s.close > 0) // Filter out invalid data
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      return { success: true, data: topStocks }
    } catch (e: any) {
      console.error('[TopStocks] Error:', e)
      return { success: false, error: e.message || '获取实时数据失败' }
    }
  })
}
