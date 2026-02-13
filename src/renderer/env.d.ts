/// <reference types="vite/client" />

import type { StockInfo, KLineData, Timeframe, ApiResult, MarketOverview, RealtimeStock } from '../shared/types'

export interface AIConfig {
  apiKey: string
  models: string  // comma-separated
}

declare global {
  interface Window {
    api: {
      getToken: () => Promise<string>
      setToken: (token: string) => Promise<boolean>
      loadStockList: () => Promise<ApiResult<StockInfo[]>>
      searchStocks: (keyword: string) => Promise<StockInfo[]>
      getKLineData: (tsCode: string, timeframe: Timeframe) => Promise<ApiResult<KLineData[]>>
      refreshRealtimeBar: (tsCode: string) => Promise<ApiResult<KLineData>>
      getRecentStocks: () => Promise<string[]>
      addRecentStock: (tsCode: string) => Promise<boolean>
      getMarketOverview: (date?: string) => Promise<ApiResult<MarketOverview>>
      getAIConfig: () => Promise<AIConfig>
      setAIConfig: (config: Partial<AIConfig>) => Promise<boolean>
      analyzeMarket: (marketDataText: string, model?: string) => Promise<ApiResult<{ content: string; model: string; tokens?: number }>>
      getRealtimeTopStocks: (limit?: number) => Promise<ApiResult<RealtimeStock[]>>
    }
  }
}

export {}
