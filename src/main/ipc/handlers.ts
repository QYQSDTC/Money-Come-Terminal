import { ipcMain } from 'electron'
import { TushareClient } from '../tushare/client'
import { loadStockList, searchStocks, clearStockListCache } from '../tushare/stockList'
import { getToken, setToken, loadConfig, saveConfig, getAIConfig, setAIConfig, type AIConfig } from '../store'
import type { KLineData, Timeframe } from '../../shared/types'
import { fetchMarketOverview, clearMarketCache } from '../market/marketData'
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

  // ---- Real-time Top Stocks ----
  let stockListCache: { ts_code: string; name: string }[] | null = null
  let lastStockListFetch = 0
  
  ipcMain.handle('get-realtime-top-stocks', async (_event, limit: number = 50) => {
    try {
      if (!tushareClient.getToken()) {
        return { success: false, error: '请先配置 Tushare Token' }
      }

      // Get stock list (with cache)
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

      // Get real-time data for all stocks (batch request)
      const tsCodes = stockListCache.map(s => s.ts_code)
      const rtResponse = await tushareClient.getRealTimeDailyBatch(tsCodes)
      
      if (rtResponse.code !== 0 || !rtResponse.data) {
        return { success: false, error: '获取实时数据失败' }
      }

      // Parse real-time data
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
        const amount = Number(obj.amount || 0)
        
        // Calculate metrics
        const changePct = preClose > 0 ? ((close - preClose) / preClose) * 100 : 0
        const amplitude = open > 0 ? ((high - low) / open) * 100 : 0
        const upperShadow = high > 0 ? ((high - Math.max(open, close)) / high) * 100 : 0
        const lowerShadow = low > 0 ? ((Math.min(open, close) - low) / low) * 100 : 0
        
        // Score calculation (0-100)
        let score = 50
        
        // Price change component (0-35 points)
        // Moderate gains score highest, too high or negative score lower
        if (changePct >= 3 && changePct <= 7) score += 35
        else if (changePct > 7 && changePct <= 10) score += 30
        else if (changePct > 1 && changePct < 3) score += 25
        else if (changePct >= -2 && changePct <= 1) score += 10
        else if (changePct > 10) score += 15
        else score += 0
        
        // Volume component (0-25 points)
        // Higher volume relative to typical levels (simplified here)
        const amountScore = Math.min(amount / 100000000, 25)
        score += amountScore
        
        // Amplitude component (0-20 points)
        // Moderate amplitude indicates activity
        if (amplitude >= 3 && amplitude <= 8) score += 20
        else if (amplitude > 8 && amplitude <= 12) score += 15
        else if (amplitude > 1 && amplitude < 3) score += 10
        else if (amplitude > 12) score += 5
        
        // Trend strength (0-20 points)
        // Bullish candle pattern
        if (close > open) {
          score += 10
          if (lowerShadow > upperShadow) score += 10
          else if (upperShadow > 0) score += 5
        } else {
          if (lowerShadow > 2) score += 5
        }
        
        return {
          ts_code: tsCode,
          name,
          close,
          changePct: Number(changePct.toFixed(2)),
          change: Number((close - preClose).toFixed(2)),
          volume: Math.floor(vol / 100), // Convert to lots
          amount: Math.floor(amount / 1000), // Convert to thousands
          amplitude: Number(amplitude.toFixed(2)),
          score: Math.min(100, Math.max(0, Math.floor(score))),
          pre_close: preClose,
          open,
          high,
          low
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
