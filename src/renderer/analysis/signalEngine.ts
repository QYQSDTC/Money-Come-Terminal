import type {
  KLineData,
  AnalysisResult,
  SignalScore,
  SignalLevel,
  TradePlanData,
  IndicatorValues
} from '../../shared/types'
import { calcMA, calcMACD, calcRSI, calcKDJ, calcBOLL } from './indicators'
import { calcOBV, calcVWAP, getOBVTrend } from './volume'
import { calcATR, calcATRStopLoss, calcPositionSize } from './atr'
import { calcSupportResistance, calcSRScore } from './supportResistance'

// ==================== Helper: get last valid value ====================
function lastValid<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i]
  }
  return null
}

function lastN<T>(arr: (T | null)[], n: number): T[] {
  const result: T[] = []
  for (let i = arr.length - 1; i >= 0 && result.length < n; i--) {
    if (arr[i] !== null) result.unshift(arr[i]!)
  }
  return result
}

// ==================== Trend Score (max ±40) ====================
function calcTrendScore(data: KLineData[]): number {
  let score = 0
  const ma = calcMA(data)
  const macd = calcMACD(data)

  // --- MA alignment (max ±20) ---
  const ma5 = lastValid(ma.ma5)
  const ma10 = lastValid(ma.ma10)
  const ma20 = lastValid(ma.ma20)

  if (ma5 !== null && ma10 !== null && ma20 !== null) {
    if (ma5 > ma10 && ma10 > ma20) {
      // Bullish alignment
      score += 20
    } else if (ma5 < ma10 && ma10 < ma20) {
      // Bearish alignment
      score -= 20
    } else if (ma5 > ma10) {
      score += 10
    } else if (ma5 < ma10) {
      score -= 10
    }
  }

  // --- MACD (max ±20) ---
  const lastDIF = lastN(macd.dif, 3)
  const lastDEA = lastN(macd.dea, 3)
  const lastHist = lastN(macd.histogram, 3)

  if (lastDIF.length >= 2 && lastDEA.length >= 2) {
    const prevDIF = lastDIF[lastDIF.length - 2]
    const currDIF = lastDIF[lastDIF.length - 1]
    const prevDEA = lastDEA[lastDEA.length - 2]
    const currDEA = lastDEA[lastDEA.length - 1]

    // Golden cross
    if (prevDIF <= prevDEA && currDIF > currDEA) {
      score += 20
    }
    // Death cross
    else if (prevDIF >= prevDEA && currDIF < currDEA) {
      score -= 20
    }
    // Histogram direction confirmation
    else if (lastHist.length >= 2) {
      const histTrend = lastHist[lastHist.length - 1] - lastHist[lastHist.length - 2]
      if (histTrend > 0 && currDIF > currDEA) score += 10
      else if (histTrend < 0 && currDIF < currDEA) score -= 10
    }
  }

  return Math.max(-40, Math.min(40, score))
}

// ==================== Oscillator Score (max ±30) ====================
function calcOscillatorScore(data: KLineData[]): number {
  let score = 0

  // --- RSI (max ±15) ---
  const rsi = calcRSI(data, 14)
  const lastRSI = lastN(rsi, 3)

  if (lastRSI.length >= 2) {
    const currRSI = lastRSI[lastRSI.length - 1]
    const prevRSI = lastRSI[lastRSI.length - 2]

    if (currRSI < 30 && currRSI > prevRSI) {
      // Oversold and recovering
      score += 15
    } else if (currRSI > 70 && currRSI < prevRSI) {
      // Overbought and declining
      score -= 15
    } else if (currRSI < 40 && currRSI > prevRSI) {
      score += 8
    } else if (currRSI > 60 && currRSI < prevRSI) {
      score -= 8
    }
  }

  // --- KDJ (max ±15) ---
  const kdj = calcKDJ(data)
  const lastK = lastN(kdj.k, 3)
  const lastD = lastN(kdj.d, 3)

  if (lastK.length >= 2 && lastD.length >= 2) {
    const prevK = lastK[lastK.length - 2]
    const currK = lastK[lastK.length - 1]
    const prevD = lastD[lastD.length - 2]
    const currD = lastD[lastD.length - 1]

    // KDJ golden cross in oversold zone
    if (prevK <= prevD && currK > currD && currK < 30) {
      score += 15
    }
    // KDJ death cross in overbought zone
    else if (prevK >= prevD && currK < currD && currK > 70) {
      score -= 15
    }
    // Regular crossovers
    else if (prevK <= prevD && currK > currD) {
      score += 8
    } else if (prevK >= prevD && currK < currD) {
      score -= 8
    }
  }

  return Math.max(-30, Math.min(30, score))
}

// ==================== Volume Score (max ±20) ====================
function calcVolumeScore(data: KLineData[]): number {
  let score = 0

  // --- OBV trend (max ±10) ---
  const obv = calcOBV(data)
  const obvTrend = getOBVTrend(obv)

  const priceUp = data.length >= 2 && data[data.length - 1].close > data[data.length - 2].close

  if (obvTrend === 1 && priceUp) {
    score += 10 // Volume confirms uptrend
  } else if (obvTrend === -1 && !priceUp) {
    score -= 10 // Volume confirms downtrend
  } else if (obvTrend === 1 && !priceUp) {
    score += 5 // Accumulation (bullish divergence)
  } else if (obvTrend === -1 && priceUp) {
    score -= 5 // Distribution (bearish divergence)
  }

  // --- VWAP position (max ±10) ---
  const vwap = calcVWAP(data, 20)
  const lastVWAP = lastValid(vwap)
  const currentPrice = data[data.length - 1].close

  if (lastVWAP !== null) {
    if (currentPrice > lastVWAP) {
      score += 10
    } else {
      score -= 10
    }
  }

  return Math.max(-20, Math.min(20, score))
}

// ==================== Signal Level Classification ====================
function classifySignal(total: number): { level: SignalLevel; label: string } {
  if (total > 60) return { level: 'strong_buy', label: '强烈买入' }
  if (total > 30) return { level: 'buy', label: '建议买入' }
  if (total > -30) return { level: 'neutral', label: '观望' }
  if (total > -60) return { level: 'sell', label: '建议卖出' }
  return { level: 'strong_sell', label: '强烈卖出' }
}

// ==================== Collect Latest Indicator Values ====================
function collectIndicators(data: KLineData[]): IndicatorValues {
  const ma = calcMA(data)
  const macd = calcMACD(data)
  const rsi = calcRSI(data, 14)
  const kdj = calcKDJ(data)
  const boll = calcBOLL(data)
  const obv = calcOBV(data)
  const vwap = calcVWAP(data, 20)
  const atr = calcATR(data, 14)

  const lastDIF = lastValid(macd.dif)
  const lastDEA = lastValid(macd.dea)
  const lastHist = lastValid(macd.histogram)
  const lastK = lastValid(kdj.k)
  const lastD = lastValid(kdj.d)
  const lastJ = lastValid(kdj.j)
  const lastUpper = lastValid(boll.upper)
  const lastMiddle = lastValid(boll.middle)
  const lastLower = lastValid(boll.lower)

  return {
    ma5: lastValid(ma.ma5),
    ma10: lastValid(ma.ma10),
    ma20: lastValid(ma.ma20),
    ma60: lastValid(ma.ma60),
    macd:
      lastDIF !== null && lastDEA !== null && lastHist !== null
        ? { dif: lastDIF, dea: lastDEA, histogram: lastHist }
        : null,
    rsi: lastValid(rsi),
    kdj:
      lastK !== null && lastD !== null && lastJ !== null
        ? { k: lastK, d: lastD, j: lastJ }
        : null,
    boll:
      lastUpper !== null && lastMiddle !== null && lastLower !== null
        ? { upper: lastUpper, middle: lastMiddle, lower: lastLower }
        : null,
    obv: lastValid(obv),
    vwap: lastValid(vwap),
    atr: lastValid(atr)
  }
}

// ==================== Generate Trade Plan ====================
function generateTradePlan(
  data: KLineData[],
  signal: SignalScore,
  sr: { support: number[]; resistance: number[] }
): TradePlanData | null {
  if (signal.level === 'neutral') return null

  const currentPrice = data[data.length - 1].close
  const atrStop = calcATRStopLoss(data)
  if (!atrStop) return null

  const isBullish = signal.total > 0
  const direction: 'long' | 'short' = isBullish ? 'long' : 'short'

  let stopLoss: number
  let targetPrice: number

  if (isBullish) {
    stopLoss = atrStop.longStopLoss
    // Target: nearest resistance or 2:1 R/R
    const riskAmount = currentPrice - stopLoss
    targetPrice =
      sr.resistance.length > 0 && sr.resistance[0] > currentPrice + riskAmount
        ? sr.resistance[0]
        : currentPrice + riskAmount * 2
  } else {
    stopLoss = atrStop.shortStopLoss
    const riskAmount = stopLoss - currentPrice
    targetPrice =
      sr.support.length > 0 && sr.support[0] < currentPrice - riskAmount
        ? sr.support[0]
        : currentPrice - riskAmount * 2
  }

  const riskRewardRatio =
    Math.abs(targetPrice - currentPrice) / Math.abs(currentPrice - stopLoss)

  const positionSizePct = calcPositionSize(currentPrice, stopLoss) * 100

  return {
    entryPrice: currentPrice,
    stopLoss: Math.round(stopLoss * 100) / 100,
    targetPrice: Math.round(targetPrice * 100) / 100,
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    positionSizePct: Math.round(positionSizePct * 10) / 10,
    atrValue: Math.round(atrStop.atrValue * 1000) / 1000,
    direction
  }
}

// ==================== Main Analysis Function ====================
export function runAnalysis(data: KLineData[]): AnalysisResult | null {
  if (data.length < 60) return null

  // Calculate dimension scores
  const trendScore = calcTrendScore(data)
  const oscillatorScore = calcOscillatorScore(data)
  const volumeScore = calcVolumeScore(data)

  // Support/resistance
  const sr = calcSupportResistance(data)
  const currentPrice = data[data.length - 1].close

  // Volume trend for SR scoring
  const volumeIncreasing =
    data.length >= 5 &&
    data[data.length - 1].volume >
      (data[data.length - 2].volume + data[data.length - 3].volume) / 2

  const srScore = calcSRScore(currentPrice, sr, volumeIncreasing)

  // Total score
  const total = trendScore + oscillatorScore + volumeScore + srScore
  const { level, label } = classifySignal(total)

  const signal: SignalScore = {
    total,
    trend: trendScore,
    trendMax: 40,
    oscillator: oscillatorScore,
    oscillatorMax: 30,
    volume: volumeScore,
    volumeMax: 20,
    supportResistance: srScore,
    supportResistanceMax: 10,
    level,
    label
  }

  // Collect indicator values
  const indicators = collectIndicators(data)

  // Generate trade plan
  const tradePlan = generateTradePlan(data, signal, sr)

  return {
    signal,
    tradePlan,
    indicators,
    supportLevels: sr.support,
    resistanceLevels: sr.resistance
  }
}
