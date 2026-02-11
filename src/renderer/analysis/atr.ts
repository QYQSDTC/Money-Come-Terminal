import type { KLineData } from '../../shared/types'

// ==================== ATR (Average True Range) ====================
export function calcATR(data: KLineData[], period = 14): (number | null)[] {
  if (data.length < 2) return data.map(() => null)

  const trueRanges: number[] = []

  // First TR = High - Low
  trueRanges.push(data[0].high - data[0].low)

  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    )
    trueRanges.push(tr)
  }

  const result: (number | null)[] = []
  let atr: number | null = null

  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += trueRanges[j]
      atr = sum / period
      result.push(atr)
    } else {
      atr = (atr! * (period - 1) + trueRanges[i]) / period
      result.push(atr)
    }
  }

  return result
}

// ==================== ATR Stop Loss ====================
export interface ATRStopLoss {
  longStopLoss: number // Stop loss for long position
  shortStopLoss: number // Stop loss for short position
  atrValue: number
}

export function calcATRStopLoss(
  data: KLineData[],
  atrMultiplier = 2,
  atrPeriod = 14
): ATRStopLoss | null {
  const atrValues = calcATR(data, atrPeriod)
  const lastATR = atrValues[atrValues.length - 1]

  if (lastATR === null || data.length === 0) return null

  const lastClose = data[data.length - 1].close

  return {
    longStopLoss: lastClose - lastATR * atrMultiplier,
    shortStopLoss: lastClose + lastATR * atrMultiplier,
    atrValue: lastATR
  }
}

// ==================== Position Size based on ATR ====================
// Kelly-inspired: risk no more than 2% of portfolio per trade
export function calcPositionSize(
  entryPrice: number,
  stopLoss: number,
  riskPercentage = 0.02
): number {
  const riskPerShare = Math.abs(entryPrice - stopLoss)
  if (riskPerShare === 0) return 0

  // Position size as percentage of portfolio
  const positionPct = (riskPercentage * entryPrice) / riskPerShare
  return Math.min(positionPct, 0.25) // Cap at 25%
}
