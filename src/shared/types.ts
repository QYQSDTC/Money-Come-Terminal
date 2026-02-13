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

export type ActiveView = 'dashboard' | 'stock' | 'topstocks'

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

// ==================== Company Info Types ====================

export interface CompanyInfo {
  ts_code: string
  chairman: string         // 法人代表
  reg_capital: string      // 注册资本
  setup_date: string       // 注册日期
  introduction: string     // 公司介绍
  main_business: string    // 主要业务及产品
  business_scope: string   // 经营范围
  employees: number        // 员工人数
}

// ==================== Stock Fundamental Types ====================

export interface QuarterlyFinancial {
  period: string         // e.g. "20250331"
  revenue: number        // 营业收入 (元)
  n_income: number       // 净利润 (元)
  basic_eps: number      // 基本每股收益
}

export interface StockFundamental {
  // From daily_basic: valuation metrics
  total_mv: number       // 总市值 (万元)
  circ_mv: number        // 流通市值 (万元)
  pe: number             // 市盈率
  pe_ttm: number         // 市盈率TTM
  pb: number             // 市净率
  ps_ttm: number         // 市销率TTM
  total_share: number    // 总股本 (万股)
  float_share: number    // 流通股本 (万股)
  // From fina_indicator: key ratios
  roe: number            // 净资产收益率
  roa: number            // 总资产报酬率
  grossprofit_margin: number  // 毛利率
  netprofit_margin: number    // 净利率
  debt_to_assets: number      // 资产负债率
  netprofit_yoy: number       // 净利润同比增长率
  tr_yoy: number              // 营收同比增长率
  // From income: quarterly data
  quarters: QuarterlyFinancial[]
}

// ==================== Real-time Top Stocks Types ====================

export interface RealtimeStock {
  ts_code: string
  name: string
  close: number
  changePct: number
  change: number
  volume: number
  amount: number
  amplitude: number
  score: number
  pre_close: number
  open: number
  high: number
  low: number
  volumeRatio: number      // 量比 (当前成交额/历史平均, 已按盘中时间调整)
  breakoutTag: string      // 突破标签: '强势新高' | '创20日新高' | '平台突破' | '接近突破' | ''
}
