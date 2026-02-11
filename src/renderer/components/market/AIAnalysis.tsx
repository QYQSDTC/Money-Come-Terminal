import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button, Spin, Select, Tooltip } from 'antd'
import {
  RobotOutlined,
  ReloadOutlined,
  SettingOutlined,
  SwapOutlined
} from '@ant-design/icons'
import type { MarketOverview, SentimentScore } from '../../../shared/types'
import { MarkdownRenderer } from '../MarkdownRenderer'

function formatMarketDataText(data: MarketOverview, sentiment: SentimentScore): string {
  const dateFormatted = `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}`

  const indexLines = data.indices.map((idx) => {
    const dir = idx.pct_chg >= 0 ? '↑' : '↓'
    const amountYi = (idx.amount / 100000).toFixed(0)
    return `  ${idx.name}: ${idx.close.toFixed(2)} (${dir}${Math.abs(idx.pct_chg).toFixed(2)}%) 成交${amountYi}亿`
  }).join('\n')

  const total = data.breadth.advanceCount + data.breadth.declineCount + data.breadth.flatCount
  const advPct = total > 0 ? ((data.breadth.advanceCount / total) * 100).toFixed(1) : '0'
  const decPct = total > 0 ? ((data.breadth.declineCount / total) * 100).toFixed(1) : '0'

  const latestNB = data.northbound.length > 0 ? data.northbound[data.northbound.length - 1] : null
  const nbFlowYi = latestNB ? (latestNB.northMoney / 100).toFixed(1) : '--'
  const nbDir = latestNB && latestNB.northMoney >= 0 ? '净流入' : '净流出'

  const recentNB = data.northbound.slice(-5).map((d) => {
    const yi = (d.northMoney / 100).toFixed(1)
    const dateStr = `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`
    return `${dateStr}: ${Number(yi) >= 0 ? '+' : ''}${yi}亿`
  }).join(', ')

  const sentimentComponents = sentiment.components.map((c) =>
    `${c.name}: ${c.value.toFixed(0)}/100`
  ).join(', ')

  // Margin data
  const latestMargin = data.margin.length > 0 ? data.margin[data.margin.length - 1] : null
  const prevMargin = data.margin.length >= 2 ? data.margin[data.margin.length - 2] : null
  let marginText = '  数据暂无'
  if (latestMargin) {
    const balanceChg = prevMargin ? latestMargin.rzrqye - prevMargin.rzrqye : 0
    const recentMargin = data.margin.slice(-5).map((d) => {
      const dateStr = `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`
      return `${dateStr}: ${d.rzjmr >= 0 ? '+' : ''}${d.rzjmr.toFixed(1)}亿`
    }).join(', ')

    marginText = `  融资融券余额: ${latestMargin.rzrqye.toFixed(0)}亿 (${balanceChg >= 0 ? '+' : ''}${balanceChg.toFixed(1)}亿)
  融资余额: ${latestMargin.rzye.toFixed(0)}亿 | 融券余额: ${latestMargin.rqye.toFixed(1)}亿
  今日融资净买入: ${latestMargin.rzjmr >= 0 ? '+' : ''}${latestMargin.rzjmr.toFixed(1)}亿
  近5日融资净买入: ${recentMargin}`
  }

  return `## A股市场数据 (${dateFormatted})

### 主要指数
${indexLines}

### 涨跌分布
  上涨: ${data.breadth.advanceCount}家 (${advPct}%) | 下跌: ${data.breadth.declineCount}家 (${decPct}%) | 平盘: ${data.breadth.flatCount}家
  涨停: ${data.breadth.limitUpCount}家 | 跌停: ${data.breadth.limitDownCount}家 | 总计: ${total}只

### 北向资金
  今日: ${nbDir} ${Math.abs(Number(nbFlowYi))}亿
  近5日: ${recentNB}

### 两融数据
${marginText}

### 情绪指数: ${sentiment.total}/100 (${sentiment.label})
  分项: ${sentimentComponents}`
}

// ==================== Component ====================

interface AIAnalysisProps {
  data: MarketOverview
  sentiment: SentimentScore
}

export const AIAnalysis: React.FC<AIAnalysisProps> = ({ data, sentiment }) => {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([])
  const [usedModel, setUsedModel] = useState<string | null>(null)
  const [tokens, setTokens] = useState<number | null>(null)
  const [aiConfigured, setAiConfigured] = useState(false)
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

  const handleAnalyze = useCallback(async () => {
    setLoading(true)
    setError(null)
    setContent(null)

    try {
      const marketText = formatMarketDataText(data, sentiment)
      const result = await window.api.analyzeMarket(marketText, model || undefined)

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
  }, [data, sentiment, model])

  return (
    <div style={{
      background: '#161618',
      border: '1px solid #2a2a30',
      borderRadius: 10,
      padding: '16px 18px',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: content ? 12 : 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RobotOutlined style={{ fontSize: 14, color: '#3b82f6' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>AI 市场分析</span>
          {usedModel && (
            <span style={{ fontSize: 10, color: '#5c5c6a', padding: '1px 6px', background: '#1e1e22', borderRadius: 4 }}>
              {usedModel}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {modelOptions.length > 0 && (
            <Select
              size="small"
              value={model}
              onChange={(v) => setModel(v)}
              options={modelOptions}
              style={{ width: 160 }}
              popupMatchSelectWidth={false}
              suffixIcon={<SwapOutlined style={{ fontSize: 10 }} />}
            />
          )}
          <Tooltip title={content ? '重新分析' : '开始 AI 分析'}>
            <Button
              size="small"
              type={content ? 'text' : 'primary'}
              icon={content ? <ReloadOutlined spin={loading} /> : <RobotOutlined />}
              onClick={handleAnalyze}
              loading={loading}
              disabled={!aiConfigured && !loading}
              style={{
                borderRadius: 6,
                ...(content ? { color: '#8a8a96' } : {})
              }}
            >
              {content ? '' : '分析'}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Not configured hint */}
      {!aiConfigured && !content && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '16px 0 8px',
          fontSize: 12,
          color: '#5c5c6a'
        }}>
          <SettingOutlined style={{ marginRight: 6 }} />
          请先在设置中配置 AI API Key
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 0',
          gap: 12
        }}>
          <Spin />
          <div style={{ fontSize: 12, color: '#8a8a96' }}>AI 正在分析市场数据...</div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(249, 40, 85, 0.08)',
          border: '1px solid rgba(249, 40, 85, 0.2)',
          borderRadius: 8,
          color: '#F92855',
          fontSize: 12,
          marginTop: 12
        }}>
          {error}
          <Button
            type="link"
            size="small"
            onClick={handleAnalyze}
            style={{ color: '#F92855', padding: '0 4px', fontSize: 12 }}
          >
            重试
          </Button>
        </div>
      )}

      {/* Content */}
      {content && !loading && (
        <div style={{
          fontSize: 12,
          color: '#b0b0ba',
          lineHeight: 1.7,
          animation: 'fadeIn 0.3s ease'
        }}>
          <MarkdownRenderer text={content} fontSize={12} />

          {/* Footer */}
          {tokens && (
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #1e1e22', fontSize: 10, color: '#5c5c6a' }}>
              Token 消耗: {tokens}
            </div>
          )}
        </div>
      )}

      {/* Initial state - configured but no content */}
      {aiConfigured && !content && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '12px 0 4px',
          fontSize: 12,
          color: '#5c5c6a'
        }}>
          点击「分析」按钮，AI 将基于当前大盘数据给出专业分析
        </div>
      )}
    </div>
  )
}
