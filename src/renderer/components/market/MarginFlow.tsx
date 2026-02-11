import React from 'react'
import { Tooltip } from 'antd'
import type { MarginData } from '../../../shared/types'

interface MarginFlowProps {
  data: MarginData[]
}

export const MarginFlow: React.FC<MarginFlowProps> = ({ data }) => {
  if (data.length === 0) return null

  const latest = data[data.length - 1]
  const prev = data.length >= 2 ? data[data.length - 2] : null

  // Balance change from previous day
  const balanceChange = prev ? latest.rzrqye - prev.rzrqye : 0
  const isBalanceUp = balanceChange >= 0

  // Net margin buy
  const netBuy = latest.rzjmr
  const isNetBuyPositive = netBuy >= 0

  // Chart: show net margin buy (rzjmr) as bars for last 30 days
  const chartData = data.slice(-30)
  const height = 48
  const values = chartData.map((d) => d.rzjmr)
  const maxAbs = Math.max(...values.map(Math.abs), 0.1)
  const midY = height / 2

  return (
    <div style={{
      background: '#161618',
      border: '1px solid #2a2a30',
      borderRadius: 10,
      padding: '14px 18px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>两融流向</div>
        <Tooltip title={`融资融券余额 ${latest.rzrqye.toFixed(0)}亿`}>
          <div style={{
            fontSize: 11,
            color: isBalanceUp ? '#F92855' : '#2DC08E',
            fontWeight: 600,
            cursor: 'default'
          }}>
            余额 {latest.rzrqye.toFixed(0)}亿
            <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>
              {isBalanceUp ? '↑' : '↓'}{Math.abs(balanceChange).toFixed(1)}亿
            </span>
          </div>
        </Tooltip>
      </div>

      {/* Key metrics row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 12 }}>
        <Tooltip title="融资净买入 = 融资买入额 - 融资偿还额">
          <div style={{ cursor: 'default' }}>
            <span style={{ color: '#8a8a96' }}>融资净买入 </span>
            <span style={{ color: isNetBuyPositive ? '#F92855' : '#2DC08E', fontWeight: 700 }}>
              {isNetBuyPositive ? '+' : ''}{netBuy.toFixed(1)}亿
            </span>
          </div>
        </Tooltip>
        <Tooltip title="融资余额">
          <div style={{ cursor: 'default' }}>
            <span style={{ color: '#8a8a96' }}>融资余额 </span>
            <span style={{ color: '#e8e8ec', fontWeight: 500 }}>{latest.rzye.toFixed(0)}亿</span>
          </div>
        </Tooltip>
        <Tooltip title="融券余额">
          <div style={{ cursor: 'default' }}>
            <span style={{ color: '#8a8a96' }}>融券余额 </span>
            <span style={{ color: '#e8e8ec', fontWeight: 500 }}>{latest.rqye.toFixed(1)}亿</span>
          </div>
        </Tooltip>
      </div>

      {/* Net buy bar chart */}
      <svg width="100%" height={height} viewBox={`0 0 ${chartData.length} ${height}`} preserveAspectRatio="none">
        {/* Zero line */}
        <line x1={0} y1={midY} x2={chartData.length} y2={midY} stroke="#2a2a30" strokeWidth={0.3} />

        {chartData.map((d, i) => {
          const val = d.rzjmr
          const barHeight = (Math.abs(val) / maxAbs) * (height / 2 - 2)
          const isPos = val >= 0
          const y = isPos ? midY - barHeight : midY

          return (
            <rect
              key={d.date}
              x={i + 0.15}
              y={y}
              width={0.7}
              height={Math.max(barHeight, 0.3)}
              fill={isPos ? 'rgba(249, 40, 85, 0.65)' : 'rgba(45, 192, 142, 0.65)'}
              rx={0.15}
            />
          )
        })}
      </svg>

      {/* Date labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: '#5c5c6a' }}>
        <span>{chartData[0]?.date ? `${chartData[0].date.slice(4, 6)}/${chartData[0].date.slice(6, 8)}` : ''}</span>
        <span>融资净买入</span>
        <span>{latest.date ? `${latest.date.slice(4, 6)}/${latest.date.slice(6, 8)}` : ''}</span>
      </div>
    </div>
  )
}
