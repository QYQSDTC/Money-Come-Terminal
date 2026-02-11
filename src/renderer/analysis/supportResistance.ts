import type { KLineData } from '../../shared/types'

// ==================== Pivot Point Detection ====================
interface PivotPoint {
  index: number
  price: number
  type: 'high' | 'low'
}

function findPivots(data: KLineData[], lookback = 5): PivotPoint[] {
  const pivots: PivotPoint[] = []

  for (let i = lookback; i < data.length - lookback; i++) {
    let isHigh = true
    let isLow = true

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (data[j].high >= data[i].high) isHigh = false
      if (data[j].low <= data[i].low) isLow = false
    }

    if (isHigh) {
      pivots.push({ index: i, price: data[i].high, type: 'high' })
    }
    if (isLow) {
      pivots.push({ index: i, price: data[i].low, type: 'low' })
    }
  }

  return pivots
}

// ==================== Price Level Clustering ====================
function clusterPriceLevels(
  prices: number[],
  tolerance = 0.02
): number[] {
  if (prices.length === 0) return []

  const sorted = [...prices].sort((a, b) => a - b)
  const clusters: number[][] = [[sorted[0]]]

  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1]
    const clusterAvg = lastCluster.reduce((s, v) => s + v, 0) / lastCluster.length

    if (Math.abs(sorted[i] - clusterAvg) / clusterAvg < tolerance) {
      lastCluster.push(sorted[i])
    } else {
      clusters.push([sorted[i]])
    }
  }

  // Return cluster averages, weighted by cluster size
  return clusters
    .filter((c) => c.length >= 2) // At least 2 touches
    .map((c) => c.reduce((s, v) => s + v, 0) / c.length)
    .sort((a, b) => a - b)
}

// ==================== Support & Resistance Levels ====================
export interface SRLevels {
  support: number[]
  resistance: number[]
}

export function calcSupportResistance(
  data: KLineData[],
  lookback = 5,
  tolerance = 0.015
): SRLevels {
  if (data.length < lookback * 3) {
    return { support: [], resistance: [] }
  }

  const pivots = findPivots(data, lookback)
  const currentPrice = data[data.length - 1].close

  const highPrices = pivots.filter((p) => p.type === 'high').map((p) => p.price)
  const lowPrices = pivots.filter((p) => p.type === 'low').map((p) => p.price)

  // Cluster both high and low pivots
  const allLevels = clusterPriceLevels([...highPrices, ...lowPrices], tolerance)

  // Classify as support or resistance based on current price
  const support = allLevels
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a) // Nearest support first
    .slice(0, 3)

  const resistance = allLevels
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b) // Nearest resistance first
    .slice(0, 3)

  return { support, resistance }
}

// ==================== Price Position Score ====================
// Returns score based on position relative to support/resistance
// Positive: near support (potential bounce), Negative: near resistance (potential rejection)
export function calcSRScore(
  currentPrice: number,
  sr: SRLevels,
  volumeIncreasing: boolean
): number {
  if (sr.support.length === 0 && sr.resistance.length === 0) return 0

  let score = 0

  // Check proximity to nearest support
  if (sr.support.length > 0) {
    const nearestSupport = sr.support[0]
    const distToSupport = (currentPrice - nearestSupport) / currentPrice

    if (distToSupport < 0.02 && distToSupport >= 0) {
      // Within 2% above support
      score += volumeIncreasing ? 10 : 5
    }
  }

  // Check proximity to nearest resistance
  if (sr.resistance.length > 0) {
    const nearestResistance = sr.resistance[0]
    const distToResistance = (nearestResistance - currentPrice) / currentPrice

    if (distToResistance < 0.02 && distToResistance >= 0) {
      // Within 2% below resistance
      score -= volumeIncreasing ? 5 : 10
    }
  }

  return Math.max(-10, Math.min(10, score))
}
