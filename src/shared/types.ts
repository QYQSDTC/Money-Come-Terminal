// ==================== Stock Data Types ====================

export interface StockInfo {
  ts_code: string
  symbol: string
  name: string
  area?: string
  industry?: string
  list_date?: string
}

export interface KLineData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
}

export type Timeframe = '1min' | '5min' | '15min' | '30min' | '60min' | 'daily'

// ==================== Signal Types ====================

export type SignalLevel = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'

export interface SignalScore {
  total: number // -100 to +100
  trend: number
  trendMax: number
  oscillator: number
  oscillatorMax: number
  volume: number
  volumeMax: number
  supportResistance: number
  supportResistanceMax: number
  level: SignalLevel
  label: string
}

export interface TradePlanData {
  entryPrice: number
  stopLoss: number
  targetPrice: number
  riskRewardRatio: number
  positionSizePct: number
  atrValue: number
  direction: 'long' | 'short' | 'neutral'
}

export interface IndicatorValues {
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  macd: { dif: number; dea: number; histogram: number } | null
  rsi: number | null
  kdj: { k: number; d: number; j: number } | null
  boll: { upper: number; middle: number; lower: number } | null
  obv: number | null
  vwap: number | null
  atr: number | null
}

export interface AnalysisResult {
  signal: SignalScore
  tradePlan: TradePlanData | null
  indicators: IndicatorValues
  supportLevels: number[]
  resistanceLevels: number[]
}

// ==================== IPC Types ====================

export interface ApiResult<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface TushareConfig {
  token: string
}

// ==================== Market Dashboard Types ====================

export type ActiveView = 'dashboard' | 'stock'

export interface IndexQuote {
  ts_code: string
  name: string
  close: number
  open: number
  high: number
  low: number
  pre_close: number
  change: number
  pct_chg: number
  vol: number
  amount: number
  history: { date: string; close: number }[]
}

export interface MarketBreadth {
  date: string
  advanceCount: number
  declineCount: number
  flatCount: number
  limitUpCount: number
  limitDownCount: number
  totalCount: number
}

export interface NorthboundFlow {
  date: string
  hgt: number
  sgt: number
  northMoney: number
}

export interface MarketStats {
  ts_code: string
  name: string
  pe: number
  totalMv: number
  amount: number
  vol: number
  comCount: number
  tr: number
}

export type SentimentLevel = 'freezing' | 'cold' | 'neutral' | 'warm' | 'hot'

export interface SentimentComponent {
  name: string
  value: number
  weight: number
}

export interface SentimentScore {
  total: number
  level: SentimentLevel
  label: string
  components: SentimentComponent[]
}

export interface MarginData {
  date: string
  rzye: number      // 融资余额 (亿元)
  rzmre: number     // 融资买入额 (亿元)
  rzche: number     // 融资偿还额 (亿元)
  rzjmr: number     // 融资净买入 (亿元) = rzmre - rzche
  rqye: number      // 融券余额 (亿元)
  rzrqye: number    // 融资融券余额 (亿元)
}

export interface MarketOverview {
  date: string
  indices: IndexQuote[]
  breadth: MarketBreadth
  northbound: NorthboundFlow[]
  margin: MarginData[]   // recent 30 days
  stats: MarketStats[]
}
