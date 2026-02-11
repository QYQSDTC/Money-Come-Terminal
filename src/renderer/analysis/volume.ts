import type { KLineData } from '../../shared/types'

// ==================== OBV (On Balance Volume) ====================
export function calcOBV(data: KLineData[]): (number | null)[] {
  if (data.length === 0) return []

  const result: (number | null)[] = [data[0].volume]
  let obv = data[0].volume

  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) {
      obv += data[i].volume
    } else if (data[i].close < data[i - 1].close) {
      obv -= data[i].volume
    }
    // If equal, OBV stays the same
    result.push(obv)
  }

  return result
}

// ==================== VWAP (Volume Weighted Average Price) ====================
// For intraday: cumulative VWAP resets each day
// For daily: rolling VWAP over specified period
export function calcVWAP(data: KLineData[], period = 20): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sumPV = 0
      let sumV = 0
      for (let j = i - period + 1; j <= i; j++) {
        const typicalPrice = (data[j].high + data[j].low + data[j].close) / 3
        sumPV += typicalPrice * data[j].volume
        sumV += data[j].volume
      }
      result.push(sumV === 0 ? null : sumPV / sumV)
    }
  }

  return result
}

// ==================== Volume Moving Average ====================
export function calcVolMA(data: KLineData[], period = 5): (number | null)[] {
  const volumes = data.map((d) => d.volume)
  const result: (number | null)[] = []

  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += volumes[j]
      }
      result.push(sum / period)
    }
  }

  return result
}

// ==================== OBV Trend Detection ====================
// Returns: 1 (uptrend), -1 (downtrend), 0 (flat)
export function getOBVTrend(obv: (number | null)[], lookback = 10): number {
  const valid = obv.filter((v) => v !== null) as number[]
  if (valid.length < lookback) return 0

  const recent = valid.slice(-lookback)
  let upCount = 0
  let downCount = 0

  for (let i = 1; i < recent.length; i++) {
    if (recent[i] > recent[i - 1]) upCount++
    else if (recent[i] < recent[i - 1]) downCount++
  }

  if (upCount > downCount * 1.5) return 1
  if (downCount > upCount * 1.5) return -1
  return 0
}
