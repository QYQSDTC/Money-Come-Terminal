import type {
  MarketOverview,
  SentimentScore,
  SentimentLevel,
  SentimentComponent
} from '../../shared/types'

// ==================== Normalization Helpers ====================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ==================== Component Scorers ====================

/**
 * Advance/Decline Ratio: ratio of advancing stocks (0-100)
 */
function scoreAdvanceDecline(overview: MarketOverview): number {
  const { advanceCount, declineCount, flatCount } = overview.breadth
  const total = advanceCount + declineCount + flatCount
  if (total === 0) return 50
  return clamp((advanceCount / total) * 100, 0, 100)
}

/**
 * Limit Up Rate: scaled by typical range (0-3% of market = full score)
 */
function scoreLimitUp(overview: MarketOverview): number {
  const { limitUpCount, totalCount } = overview.breadth
  if (totalCount === 0) return 0
  const rate = limitUpCount / totalCount
  // 0% → 0, 1% → 33, 2% → 67, 3%+ → 100
  return clamp(rate / 0.03 * 100, 0, 100)
}

/**
 * Limit Down Penalty: inverse - more limit downs = lower score
 */
function scoreLimitDown(overview: MarketOverview): number {
  const { limitDownCount, totalCount } = overview.breadth
  if (totalCount === 0) return 100
  const rate = limitDownCount / totalCount
  // 0% → 100, 1% → 67, 2% → 33, 3%+ → 0
  return clamp(100 - (rate / 0.03 * 100), 0, 100)
}

/**
 * Index Trend: average pct_chg of major indices, normalized to 0-100
 * Range: -3% → 0, 0% → 50, +3% → 100
 */
function scoreIndexTrend(overview: MarketOverview): number {
  if (overview.indices.length === 0) return 50
  const avgChg = overview.indices.reduce((sum, idx) => sum + idx.pct_chg, 0) / overview.indices.length
  // -3% maps to 0, +3% maps to 100
  return clamp((avgChg + 3) / 6 * 100, 0, 100)
}

/**
 * Northbound Capital Flow: today's net inflow normalized
 * Range: -100亿 → 0, 0 → 50, +100亿 → 100 (northMoney is in 百万元, so ±10000)
 */
function scoreNorthbound(overview: MarketOverview): number {
  if (overview.northbound.length === 0) return 50
  const latest = overview.northbound[overview.northbound.length - 1]
  const flow = latest.northMoney // in 百万元
  // ±10000百万 = ±100亿
  return clamp((flow + 10000) / 20000 * 100, 0, 100)
}

/**
 * Volume vs 20-day average: today's total index volume relative to recent average
 * If indices have history, use the last 20 days of data
 */
function scoreVolume(overview: MarketOverview): number {
  if (overview.indices.length === 0) return 50

  // Use the first index (上证) as volume proxy
  const idx = overview.indices[0]
  if (!idx || idx.vol === 0) return 50

  // We don't have historical volume directly; use amount from northbound as proxy
  // Or simply score based on current volume level
  // A typical approach: volume > 1.5x average = hot, < 0.5x = cold
  // Without historical volume, score 50 (neutral)
  // This will be enhanced when we have volume history
  return 50
}

// ==================== Sentiment Classification ====================

function classifySentiment(score: number): { level: SentimentLevel; label: string } {
  if (score >= 80) return { level: 'hot', label: '沸点' }
  if (score >= 60) return { level: 'warm', label: '活跃' }
  if (score >= 40) return { level: 'neutral', label: '正常' }
  if (score >= 20) return { level: 'cold', label: '低迷' }
  return { level: 'freezing', label: '冰点' }
}

// ==================== Main Function ====================

export function computeSentiment(overview: MarketOverview): SentimentScore {
  const components: SentimentComponent[] = [
    { name: '涨跌比', value: scoreAdvanceDecline(overview), weight: 0.25 },
    { name: '涨停率', value: scoreLimitUp(overview), weight: 0.15 },
    { name: '跌停率', value: scoreLimitDown(overview), weight: 0.15 },
    { name: '指数趋势', value: scoreIndexTrend(overview), weight: 0.20 },
    { name: '北向资金', value: scoreNorthbound(overview), weight: 0.15 },
    { name: '成交量', value: scoreVolume(overview), weight: 0.10 }
  ]

  const total = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0)
  )

  const { level, label } = classifySentiment(total)

  return { total, level, label, components }
}
