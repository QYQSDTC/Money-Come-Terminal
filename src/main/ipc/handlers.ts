import { ipcMain } from 'electron'
import { TushareClient } from '../tushare/client'
import { loadStockList, searchStocks, clearStockListCache } from '../tushare/stockList'
import { getToken, setToken, loadConfig, saveConfig, getAIConfig, setAIConfig, type AIConfig } from '../store'
import type { KLineData, Timeframe, CompanyInfo, StockFundamental, QuarterlyFinancial } from '../../shared/types'
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
