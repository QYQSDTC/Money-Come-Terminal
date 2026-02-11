import React from 'react'
import { Card, Typography, Divider, Tag, Tooltip } from 'antd'
import {
  AimOutlined,
  StopOutlined,
  RiseOutlined,
  FundOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { AnalysisResult } from '../../shared/types'

const { Text } = Typography

interface TradePlanProps {
  analysis: AnalysisResult | null
}

export const TradePlan: React.FC<TradePlanProps> = ({ analysis }) => {
  if (!analysis?.tradePlan) {
    return (
      <Card
        title={<Text style={{ fontSize: 13, color: '#b0b0b8' }}>交易计划</Text>}
        size="small"
        className="signal-card"
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ textAlign: 'center', color: '#5c5c6a', padding: '12px 0' }}>
          <FileTextOutlined style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.4 }} />
          <Text style={{ color: '#5c5c6a', fontSize: 12 }}>当前无交易信号</Text>
        </div>
      </Card>
    )
  }

  const { tradePlan } = analysis
  const isLong = tradePlan.direction === 'long'
  const dirColor = isLong ? '#F92855' : '#2DC08E'
  const dirLabel = isLong ? '做多' : '做空'

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, color: '#b0b0b8' }}>交易计划</Text>
          <Tag
            color={dirColor}
            style={{ border: 'none', fontSize: 11, fontWeight: 600, margin: 0 }}
          >
            {dirLabel}
          </Tag>
        </div>
      }
      size="small"
      className="signal-card"
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ fontSize: 13 }} className="fade-in">
        {/* Entry Price */}
        <div className="trade-plan-item">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AimOutlined style={{ color: '#3b82f6' }} />
            <Text style={{ color: '#8a8a96' }}>入场价</Text>
          </span>
          <Text
            strong
            className="data-value"
            style={{ fontSize: 15, color: '#e8e8ec', fontVariantNumeric: 'tabular-nums' }}
          >
            {tradePlan.entryPrice.toFixed(2)}
          </Text>
        </div>

        {/* Stop Loss */}
        <div className="trade-plan-item">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StopOutlined style={{ color: '#ef4444' }} />
            <Text style={{ color: '#8a8a96' }}>止损位</Text>
          </span>
          <Tooltip title={`ATR(${tradePlan.atrValue.toFixed(3)}) × 2`} placement="left">
            <div style={{ textAlign: 'right' }}>
              <Text
                strong
                className="data-value"
                style={{
                  fontSize: 15,
                  color: isLong ? '#2DC08E' : '#F92855',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {tradePlan.stopLoss.toFixed(2)}
              </Text>
              <br />
              <Text style={{ fontSize: 10, color: '#5c5c6a' }}>
                ATR × 2
              </Text>
            </div>
          </Tooltip>
        </div>

        {/* Target Price */}
        <div className="trade-plan-item">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RiseOutlined style={{ color: '#22c55e' }} />
            <Text style={{ color: '#8a8a96' }}>目标位</Text>
          </span>
          <Text
            strong
            className="data-value"
            style={{
              fontSize: 15,
              color: isLong ? '#F92855' : '#2DC08E',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {tradePlan.targetPrice.toFixed(2)}
          </Text>
        </div>

        <Divider style={{ margin: '8px 0', borderColor: '#2a2a30' }} />

        {/* Risk/Reward */}
        <div className="trade-plan-item">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FundOutlined style={{ color: '#f59e0b' }} />
            <Text style={{ color: '#8a8a96' }}>风险收益比</Text>
          </span>
          <Text
            className="data-value"
            style={{
              color: tradePlan.riskRewardRatio >= 2 ? '#22c55e' : '#f59e0b',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            1 : {tradePlan.riskRewardRatio.toFixed(1)}
          </Text>
        </div>

        {/* Position Size */}
        <div className="trade-plan-item">
          <Text style={{ color: '#8a8a96' }}>建议仓位</Text>
          <Text
            strong
            className="data-value"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {tradePlan.positionSizePct.toFixed(1)}%
          </Text>
        </div>
      </div>
    </Card>
  )
}
