import React from 'react'
import { Card, Tag, Typography, Divider, Tooltip } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  DashboardOutlined
} from '@ant-design/icons'
import type { AnalysisResult, SignalLevel } from '../../shared/types'

const { Text } = Typography

interface SignalDashboardProps {
  analysis: AnalysisResult | null
}

const signalColors: Record<SignalLevel, string> = {
  strong_buy: '#F92855',
  buy: '#ff6b81',
  neutral: '#6b6b78',
  sell: '#34d399',
  strong_sell: '#2DC08E'
}

const signalBgColors: Record<SignalLevel, string> = {
  strong_buy: 'rgba(249, 40, 85, 0.10)',
  buy: 'rgba(255, 107, 129, 0.08)',
  neutral: 'rgba(107, 107, 120, 0.08)',
  sell: 'rgba(52, 211, 153, 0.08)',
  strong_sell: 'rgba(45, 192, 142, 0.10)'
}

const signalGlowColors: Record<SignalLevel, string> = {
  strong_buy: '0 0 24px rgba(249, 40, 85, 0.2)',
  buy: 'none',
  neutral: 'none',
  sell: 'none',
  strong_sell: '0 0 24px rgba(45, 192, 142, 0.2)'
}

function ScoreBar({
  label,
  value,
  max,
  tooltip
}: {
  label: string
  value: number
  max: number
  tooltip?: string
}) {
  const percent = Math.abs(value) / max * 100
  const isPositive = value >= 0

  return (
    <Tooltip title={tooltip} placement="left" mouseEnterDelay={0.6}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <Text style={{ fontSize: 12, color: '#8a8a96' }}>{label}</Text>
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isPositive ? '#F92855' : '#2DC08E',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {value > 0 ? '+' : ''}{value} / {max}
          </Text>
        </div>
        <div className="score-bar-track">
          <div
            className={`score-bar-fill ${isPositive ? 'positive' : 'negative'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </Tooltip>
  )
}

function formatNum(v: number | null, decimals = 2): string {
  if (v === null || v === undefined) return '--'
  return v.toFixed(decimals)
}

function IndicatorRow({
  label,
  value,
  color
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
      <Text style={{ fontSize: 12, color: '#8a8a96' }}>{label}</Text>
      <Text
        className="data-value"
        style={{ fontSize: 12, color: color || '#e8e8ec', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
    </div>
  )
}

export const SignalDashboard: React.FC<SignalDashboardProps> = ({ analysis }) => {
  if (!analysis) {
    return (
      <Card
        size="small"
        className="signal-card"
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#5c5c6a' }}>
          <DashboardOutlined style={{ fontSize: 28, marginBottom: 10, display: 'block', opacity: 0.4 }} />
          <Text style={{ color: '#5c5c6a', fontSize: 13 }}>加载数据后显示信号分析</Text>
        </div>
      </Card>
    )
  }

  const { signal, indicators } = analysis
  const color = signalColors[signal.level]
  const bgColor = signalBgColors[signal.level]
  const glowShadow = signalGlowColors[signal.level]

  return (
    <div className="fade-in">
      {/* Signal Score Card */}
      <Card
        size="small"
        className="signal-card"
        styles={{ body: { padding: 16 } }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0',
            background: bgColor,
            borderRadius: 10,
            marginBottom: 18,
            boxShadow: glowShadow,
            transition: 'all 0.4s ease'
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color,
              lineHeight: 1.2,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-1px'
            }}
          >
            {signal.total > 0 ? '+' : ''}{signal.total}
          </div>
          <Tag
            color={color}
            style={{
              fontSize: 14,
              padding: '2px 18px',
              marginTop: 10,
              border: 'none',
              fontWeight: 600
            }}
          >
            {signal.total > 0 && <ArrowUpOutlined />}
            {signal.total < 0 && <ArrowDownOutlined />}
            {signal.total === 0 && <MinusOutlined />}
            {' '}{signal.label}
          </Tag>
        </div>

        {/* Dimension Scores */}
        <ScoreBar
          label="趋势 (MA/MACD)"
          value={signal.trend}
          max={signal.trendMax}
          tooltip="均线排列 + MACD 金叉死叉"
        />
        <ScoreBar
          label="震荡 (RSI/KDJ)"
          value={signal.oscillator}
          max={signal.oscillatorMax}
          tooltip="RSI 超买超卖 + KDJ 交叉"
        />
        <ScoreBar
          label="量能 (OBV/VWAP)"
          value={signal.volume}
          max={signal.volumeMax}
          tooltip="OBV 趋势确认 + VWAP 位置"
        />
        <ScoreBar
          label="支撑阻力"
          value={signal.supportResistance}
          max={signal.supportResistanceMax}
          tooltip="价格相对支撑阻力位位置"
        />
      </Card>

      {/* Indicator Values Card */}
      <Card
        title={<Text style={{ fontSize: 13, color: '#b0b0b8' }}>当前指标值</Text>}
        size="small"
        className="signal-card"
        styles={{ body: { padding: '8px 12px' } }}
      >
        <div style={{ fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 14px' }}>
            <IndicatorRow label="MA5" value={formatNum(indicators.ma5)} />
            <IndicatorRow label="MA10" value={formatNum(indicators.ma10)} />
            <IndicatorRow label="MA20" value={formatNum(indicators.ma20)} />
            <IndicatorRow label="MA60" value={formatNum(indicators.ma60)} />
          </div>

          <Divider style={{ margin: '8px 0', borderColor: '#2a2a30' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 14px' }}>
            <IndicatorRow
              label="RSI"
              value={formatNum(indicators.rsi, 1)}
              color={
                indicators.rsi !== null
                  ? indicators.rsi > 70 ? '#2DC08E' : indicators.rsi < 30 ? '#F92855' : undefined
                  : undefined
              }
            />
            <IndicatorRow label="ATR" value={formatNum(indicators.atr, 3)} />
            {indicators.kdj && (
              <IndicatorRow
                label="K/D/J"
                value={`${formatNum(indicators.kdj.k, 1)}/${formatNum(indicators.kdj.d, 1)}/${formatNum(indicators.kdj.j, 1)}`}
              />
            )}
            {indicators.macd && (
              <IndicatorRow
                label="MACD"
                value={formatNum(indicators.macd.histogram, 3)}
                color={indicators.macd.histogram > 0 ? '#F92855' : '#2DC08E'}
              />
            )}
          </div>

          {indicators.boll && (
            <>
              <Divider style={{ margin: '8px 0', borderColor: '#2a2a30' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px 8px' }}>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#5c5c6a', display: 'block' }}>BOLL上</Text>
                  <Text className="data-value" style={{ fontSize: 12 }}>{formatNum(indicators.boll.upper)}</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#5c5c6a', display: 'block' }}>BOLL中</Text>
                  <Text className="data-value" style={{ fontSize: 12 }}>{formatNum(indicators.boll.middle)}</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#5c5c6a', display: 'block' }}>BOLL下</Text>
                  <Text className="data-value" style={{ fontSize: 12 }}>{formatNum(indicators.boll.lower)}</Text>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Support / Resistance */}
      {(analysis.supportLevels.length > 0 || analysis.resistanceLevels.length > 0) && (
        <Card
          title={<Text style={{ fontSize: 13, color: '#b0b0b8' }}>支撑 / 阻力位</Text>}
          size="small"
          className="signal-card"
          styles={{ body: { padding: '8px 12px' } }}
        >
          <div style={{ fontSize: 12 }}>
            {analysis.resistanceLevels.map((r, i) => (
              <div
                key={`r-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2px 0'
                }}
              >
                <Text style={{ color: '#8a8a96' }}>阻力{i + 1}</Text>
                <Text className="data-value" style={{ color: '#2DC08E', fontVariantNumeric: 'tabular-nums' }}>
                  {r.toFixed(2)}
                </Text>
              </div>
            ))}
            {analysis.resistanceLevels.length > 0 && analysis.supportLevels.length > 0 && (
              <Divider style={{ margin: '4px 0', borderColor: '#2a2a30' }} />
            )}
            {analysis.supportLevels.map((s, i) => (
              <div
                key={`s-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2px 0'
                }}
              >
                <Text style={{ color: '#8a8a96' }}>支撑{i + 1}</Text>
                <Text className="data-value" style={{ color: '#F92855', fontVariantNumeric: 'tabular-nums' }}>
                  {s.toFixed(2)}
                </Text>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
