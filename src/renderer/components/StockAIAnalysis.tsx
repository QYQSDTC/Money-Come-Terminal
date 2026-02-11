import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button, Spin, Select, Card, Typography } from 'antd'
import { RobotOutlined, ReloadOutlined, SettingOutlined, SwapOutlined } from '@ant-design/icons'
import type { AnalysisResult, StockInfo, KLineData } from '../../shared/types'
import { MarkdownRenderer } from './MarkdownRenderer'

const { Text } = Typography

// ==================== Data Formatter ====================

function fmt(v: number | null, d = 2): string {
  if (v === null || v === undefined) return '--'
  return v.toFixed(d)
}

function formatStockDataForAI(
  stock: StockInfo,
  data: KLineData[],
  analysis: AnalysisResult
): string {
  const { signal, indicators, tradePlan, supportLevels, resistanceLevels } = analysis
  const last = data[data.length - 1]
  const prev = data.length >= 2 ? data[data.length - 2] : null

  // Recent price action (last 5 bars)
  const recent5 = data.slice(-5).map((d) => {
    const date = new Date(d.timestamp)
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
    const dir = d.close >= d.open ? '阳' : '阴'
    const chg = prev ? ((d.close - d.open) / d.open * 100).toFixed(2) : '--'
    return `${dateStr}: ${dir}线 O=${d.open.toFixed(2)} H=${d.high.toFixed(2)} L=${d.low.toFixed(2)} C=${d.close.toFixed(2)} (${Number(chg) >= 0 ? '+' : ''}${chg}%)`
  }).join('\n  ')

  // Volume trend
  const vol5 = data.slice(-5).reduce((s, d) => s + d.volume, 0) / 5
  const vol20 = data.slice(-20).reduce((s, d) => s + d.volume, 0) / Math.min(20, data.length)
  const volRatio = vol20 > 0 ? (vol5 / vol20).toFixed(2) : '--'

  // MA positions
  const maStatus: string[] = []
  if (indicators.ma5 && indicators.ma10) {
    maStatus.push(indicators.ma5 > indicators.ma10 ? 'MA5 > MA10 (短期多头)' : 'MA5 < MA10 (短期空头)')
  }
  if (indicators.ma10 && indicators.ma20) {
    maStatus.push(indicators.ma10 > indicators.ma20 ? 'MA10 > MA20 (中期多头)' : 'MA10 < MA20 (中期空头)')
  }
  if (indicators.ma20 && indicators.ma60) {
    maStatus.push(indicators.ma20 > indicators.ma60 ? 'MA20 > MA60 (长期多头)' : 'MA20 < MA60 (长期空头)')
  }

  // MACD status
  let macdStatus = '--'
  if (indicators.macd) {
    const { dif, dea, histogram } = indicators.macd
    const cross = dif > dea ? '金叉' : '死叉'
    const bar = histogram > 0 ? '红柱' : '绿柱'
    macdStatus = `DIF=${fmt(dif, 3)} DEA=${fmt(dea, 3)} 柱=${fmt(histogram, 3)} (${cross}, ${bar})`
  }

  // KDJ
  let kdjStatus = '--'
  if (indicators.kdj) {
    const { k, d, j } = indicators.kdj
    const zone = j > 80 ? '超买区' : j < 20 ? '超卖区' : '中性区'
    kdjStatus = `K=${fmt(k, 1)} D=${fmt(d, 1)} J=${fmt(j, 1)} (${zone})`
  }

  // RSI
  let rsiStatus = '--'
  if (indicators.rsi !== null) {
    const zone = indicators.rsi > 70 ? '超买' : indicators.rsi < 30 ? '超卖' : '中性'
    rsiStatus = `${fmt(indicators.rsi, 1)} (${zone})`
  }

  // BOLL
  let bollStatus = '--'
  if (indicators.boll) {
    const { upper, middle, lower } = indicators.boll
    const pos = last.close > upper ? '突破上轨' : last.close < lower ? '跌破下轨' : last.close > middle ? '中轨上方' : '中轨下方'
    bollStatus = `上=${fmt(upper)} 中=${fmt(middle)} 下=${fmt(lower)} 价格${pos}`
  }

  // Support/Resistance
  const srText = [
    ...resistanceLevels.map((r, i) => `阻力${i + 1}: ${r.toFixed(2)}`),
    ...supportLevels.map((s, i) => `支撑${i + 1}: ${s.toFixed(2)}`)
  ].join(' | ')

  // Trade plan
  let planText = '无明确信号'
  if (tradePlan) {
    planText = `方向: ${tradePlan.direction === 'long' ? '做多' : '做空'} | 入场: ${tradePlan.entryPrice.toFixed(2)} | 止损: ${tradePlan.stopLoss.toFixed(2)} | 目标: ${tradePlan.targetPrice.toFixed(2)} | 风险收益比: 1:${tradePlan.riskRewardRatio.toFixed(1)} | 建议仓位: ${tradePlan.positionSizePct.toFixed(1)}%`
  }

  return `## ${stock.name} (${stock.ts_code}) 技术分析数据

### 最新价格
  收盘: ${last.close.toFixed(2)} | 最高: ${last.high.toFixed(2)} | 最低: ${last.low.toFixed(2)}
  数据量: ${data.length}根K线

### 近5日K线
  ${recent5}

### 综合信号: ${signal.total > 0 ? '+' : ''}${signal.total} (${signal.label})
  趋势得分: ${signal.trend}/${signal.trendMax} | 震荡得分: ${signal.oscillator}/${signal.oscillatorMax}
  量能得分: ${signal.volume}/${signal.volumeMax} | 支撑阻力: ${signal.supportResistance}/${signal.supportResistanceMax}

### 均线系统
  MA5=${fmt(indicators.ma5)} MA10=${fmt(indicators.ma10)} MA20=${fmt(indicators.ma20)} MA60=${fmt(indicators.ma60)}
  ${maStatus.join(' | ')}

### MACD
  ${macdStatus}

### KDJ
  ${kdjStatus}

### RSI
  ${rsiStatus}

### 布林带
  ${bollStatus}

### 量能
  近5日均量/近20日均量 = ${volRatio}x
  ATR = ${fmt(indicators.atr, 3)}

### 支撑阻力位
  ${srText || '暂无'}

### 系统交易计划
  ${planText}`
}

// ==================== Component ====================

interface StockAIAnalysisProps {
  stock: StockInfo | null
  data: KLineData[]
  analysis: AnalysisResult | null
}

export const StockAIAnalysis: React.FC<StockAIAnalysisProps> = ({ stock, data, analysis }) => {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([])
  const [usedModel, setUsedModel] = useState<string | null>(null)
  const [tokens, setTokens] = useState<number | null>(null)
  const [aiConfigured, setAiConfigured] = useState(false)
  const prevStockRef = useRef<string | null>(null)
  const configLoadedRef = useRef(false)

  // Load saved AI config on mount
  useEffect(() => {
    if (!configLoadedRef.current) {
      configLoadedRef.current = true
      window.api.getAIConfig().then((cfg) => {
        const models = (cfg.models || 'deepseek-v3.2')
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
        setModelOptions(models.map((m) => ({ value: m, label: m })))
        setModel(models[0] || '')
        setAiConfigured(!!cfg.apiKey)
      })
    }
  }, [])

  // Reset when stock changes
  useEffect(() => {
    if (stock?.ts_code !== prevStockRef.current) {
      setContent(null)
      setError(null)
      setUsedModel(null)
      setTokens(null)
      prevStockRef.current = stock?.ts_code || null
    }
  }, [stock?.ts_code])

  const handleAnalyze = useCallback(async () => {
    if (!stock || !analysis || data.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const prompt = formatStockDataForAI(stock, data, analysis)
      const result = await window.api.analyzeMarket(prompt, model || undefined)

      if (result.success && result.data) {
        setContent(result.data.content)
        setUsedModel(result.data.model)
        setTokens(result.data.tokens || null)
      } else {
        setError(result.error || 'AI 分析失败')
      }
    } catch (e: any) {
      setError(e.message || '未知错误')
    } finally {
      setLoading(false)
    }
  }, [stock, data, analysis, model])

  if (!stock || !analysis) {
    return null
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: content ? 10 : 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RobotOutlined style={{ fontSize: 13, color: '#3b82f6' }} />
          <Text style={{ fontSize: 12, fontWeight: 600, color: '#b0b0b8' }}>AI 趋势分析</Text>
          {usedModel && (
            <span style={{ fontSize: 9, color: '#5c5c6a', padding: '1px 4px', background: '#1e1e22', borderRadius: 3 }}>
              {usedModel}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {modelOptions.length > 0 && (
            <Select
              size="small"
              value={model}
              onChange={(v) => setModel(v)}
              options={modelOptions}
              style={{ width: 130, fontSize: 11 }}
              popupMatchSelectWidth={false}
              suffixIcon={<SwapOutlined style={{ fontSize: 9 }} />}
            />
          )}
          <Button
            size="small"
            type={content ? 'text' : 'primary'}
            icon={content ? <ReloadOutlined spin={loading} /> : <RobotOutlined />}
            onClick={handleAnalyze}
            loading={loading}
            disabled={!aiConfigured && !loading}
            style={{
              borderRadius: 6,
              fontSize: 11,
              ...(content ? { color: '#8a8a96' } : {})
            }}
          >
            {content ? '' : '分析'}
          </Button>
        </div>
      </div>

      {/* Not configured hint */}
      {!aiConfigured && !content && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '12px 0',
          fontSize: 11,
          color: '#5c5c6a'
        }}>
          <SettingOutlined style={{ marginRight: 4 }} />
          请先在设置中配置 AI API Key
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: 8
        }}>
          <Spin size="small" />
          <div style={{ fontSize: 11, color: '#8a8a96' }}>分析 {stock.name} 技术面...</div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(249, 40, 85, 0.08)',
          border: '1px solid rgba(249, 40, 85, 0.2)',
          borderRadius: 6,
          color: '#F92855',
          fontSize: 11,
          marginTop: 8
        }}>
          {error}
          <Button
            type="link"
            size="small"
            onClick={handleAnalyze}
            style={{ color: '#F92855', padding: '0 4px', fontSize: 11 }}
          >
            重试
          </Button>
        </div>
      )}

      {/* Content */}
      {content && !loading && (
        <div style={{
          fontSize: 11,
          color: '#b0b0ba',
          lineHeight: 1.6,
          animation: 'fadeIn 0.3s ease'
        }}>
          <MarkdownRenderer text={content} fontSize={11} />
          {tokens && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #1e1e22', fontSize: 9, color: '#5c5c6a' }}>
              Token: {tokens}
            </div>
          )}
        </div>
      )}

      {/* Initial state - configured but no content */}
      {aiConfigured && !content && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '8px 0 2px',
          fontSize: 11,
          color: '#5c5c6a'
        }}>
          基于技术指标进行 AI 趋势分析
        </div>
      )}
    </div>
  )
}
