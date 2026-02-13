import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Token
  getToken: (): Promise<string> => ipcRenderer.invoke('get-token'),
  setToken: (token: string): Promise<boolean> => ipcRenderer.invoke('set-token', token),

  // Stock search
  loadStockList: () => ipcRenderer.invoke('load-stock-list'),
  searchStocks: (keyword: string) => ipcRenderer.invoke('search-stocks', keyword),

  // K-line data
  getKLineData: (tsCode: string, timeframe: string) =>
    ipcRenderer.invoke('get-kline-data', tsCode, timeframe),

  // Recent stocks
  getRecentStocks: (): Promise<string[]> => ipcRenderer.invoke('get-recent-stocks'),
  addRecentStock: (tsCode: string): Promise<boolean> =>
    ipcRenderer.invoke('add-recent-stock', tsCode),

  // Market dashboard
  getMarketOverview: (date?: string) =>
    ipcRenderer.invoke('get-market-overview', date),

  // Real-time bar refresh (lightweight, no cache)
  refreshRealtimeBar: (tsCode: string) =>
    ipcRenderer.invoke('refresh-realtime-bar', tsCode),

  // AI config
  getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
  setAIConfig: (config: { apiKey?: string; models?: string }) =>
    ipcRenderer.invoke('set-ai-config', config),

  // AI analysis
  analyzeMarket: (marketDataText: string, model?: string) =>
    ipcRenderer.invoke('analyze-market', marketDataText, model),

  // Real-time top stocks
  getRealtimeTopStocks: (limit?: number) =>
    ipcRenderer.invoke('get-realtime-top-stocks', limit),
})
