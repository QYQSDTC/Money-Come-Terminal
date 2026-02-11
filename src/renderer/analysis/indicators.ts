import type { KLineData } from '../../shared/types'

// ==================== SMA ====================
export function calcSMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += values[j]
      }
      result.push(sum / period)
    }
  }
  return result
}

// ==================== EMA ====================
export function calcEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const multiplier = 2 / (period + 1)
  let ema: number | null = null

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[j]
      ema = sum / period
      result.push(ema)
    } else {
      ema = (values[i] - ema!) * multiplier + ema!
      result.push(ema)
    }
  }
  return result
}

// ==================== MA Set ====================
export interface MAResult {
  ma5: (number | null)[]
  ma10: (number | null)[]
  ma20: (number | null)[]
  ma60: (number | null)[]
}

export function calcMA(data: KLineData[]): MAResult {
  const closes = data.map((d) => d.close)
  return {
    ma5: calcSMA(closes, 5),
    ma10: calcSMA(closes, 10),
    ma20: calcSMA(closes, 20),
    ma60: calcSMA(closes, 60)
  }
}

// ==================== MACD (12, 26, 9) ====================
export interface MACDResult {
  dif: (number | null)[]
  dea: (number | null)[]
  histogram: (number | null)[]
}

export function calcMACD(
  data: KLineData[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const closes = data.map((d) => d.close)
  const emaFast = calcEMA(closes, fastPeriod)
  const emaSlow = calcEMA(closes, slowPeriod)

  // DIF = EMA(fast) - EMA(slow)
  const dif: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      dif.push(emaFast[i]! - emaSlow[i]!)
    } else {
      dif.push(null)
    }
  }

  // DEA = EMA(DIF, signal)
  const validDif: number[] = dif.filter((v) => v !== null) as number[]
  const deaRaw = calcEMA(validDif, signalPeriod)

  // Align DEA back with the full array
  const dea: (number | null)[] = []
  const histogram: (number | null)[] = []
  let deaIdx = 0

  for (let i = 0; i < dif.length; i++) {
    if (dif[i] === null) {
      dea.push(null)
      histogram.push(null)
    } else {
      const deaVal = deaRaw[deaIdx] ?? null
      dea.push(deaVal)
      if (deaVal !== null) {
        histogram.push((dif[i]! - deaVal) * 2)
      } else {
        histogram.push(null)
      }
      deaIdx++
    }
  }

  return { dif, dea, histogram }
}

// ==================== RSI ====================
export function calcRSI(data: KLineData[], period = 14): (number | null)[] {
  const closes = data.map((d) => d.close)
  const result: (number | null)[] = [null]

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? -change : 0)
  }

  let avgGain = 0
  let avgLoss = 0

  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(null)
      avgGain += gains[i]
      avgLoss += losses[i]
    } else if (i === period - 1) {
      avgGain = (avgGain + gains[i]) / period
      avgLoss = (avgLoss + losses[i]) / period
      if (avgLoss === 0) {
        result.push(100)
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss))
      }
    } else {
      avgGain = (avgGain * (period - 1) + gains[i]) / period
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period
      if (avgLoss === 0) {
        result.push(100)
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss))
      }
    }
  }

  return result
}

// ==================== KDJ (9, 3, 3) - Chinese Standard ====================
export interface KDJResult {
  k: (number | null)[]
  d: (number | null)[]
  j: (number | null)[]
}

export function calcKDJ(data: KLineData[], period = 9): KDJResult {
  const k: (number | null)[] = []
  const d: (number | null)[] = []
  const j: (number | null)[] = []

  let prevK = 50
  let prevD = 50

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      k.push(null)
      d.push(null)
      j.push(null)
    } else {
      let highestHigh = -Infinity
      let lowestLow = Infinity
      for (let p = i - period + 1; p <= i; p++) {
        highestHigh = Math.max(highestHigh, data[p].high)
        lowestLow = Math.min(lowestLow, data[p].low)
      }

      const rsv =
        highestHigh === lowestLow
          ? 50
          : ((data[i].close - lowestLow) / (highestHigh - lowestLow)) * 100

      const curK = (2 / 3) * prevK + (1 / 3) * rsv
      const curD = (2 / 3) * prevD + (1 / 3) * curK
      const curJ = 3 * curK - 2 * curD

      k.push(curK)
      d.push(curD)
      j.push(curJ)

      prevK = curK
      prevD = curD
    }
  }

  return { k, d, j }
}

// ==================== Bollinger Bands (20, 2) ====================
export interface BOLLResult {
  upper: (number | null)[]
  middle: (number | null)[]
  lower: (number | null)[]
}

export function calcBOLL(data: KLineData[], period = 20, multiplier = 2): BOLLResult {
  const closes = data.map((d) => d.close)
  const middle = calcSMA(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) {
      upper.push(null)
      lower.push(null)
    } else {
      let sumSqDiff = 0
      for (let j = i - period + 1; j <= i; j++) {
        sumSqDiff += Math.pow(closes[j] - middle[i]!, 2)
      }
      const stdDev = Math.sqrt(sumSqDiff / period)
      upper.push(middle[i]! + multiplier * stdDev)
      lower.push(middle[i]! - multiplier * stdDev)
    }
  }

  return { upper, middle, lower }
}
