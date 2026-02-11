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
  daily: 10 * 60 * 1000,    // 10 minutes
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

        let response

        if (timeframe === 'daily') {
          const endDate = new Date()
          const startDate = new Date()
          startDate.setDate(startDate.getDate() - 500)
          response = await tushareClient.getDailyData(
            tsCode,
            formatDate(startDate),
            formatDate(endDate)
          )
        } else {
          const freq = timeframe.replace('min', '')
          response = await tushareClient.getMinuteData(tsCode, freq)
        }

        if (response.code !== 0 || !response.data) {
          const apiMsg = response.msg || 'Tushare API 返回错误'
          return {
            success: false,
            error: classifyApiError(apiMsg)
          }
        }

        if (response.data.items.length === 0) {
          return { success: false, error: '无数据返回，请检查股票代码或 Token 权限' }
        }

        const klineData =
          timeframe === 'daily'
            ? parseDailyKLine(response.data.fields, response.data.items)
            : parseMinuteKLine(response.data.fields, response.data.items)

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
}
