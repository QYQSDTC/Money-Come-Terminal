import React from 'react'
import type { NorthboundFlow } from '../../../shared/types'

interface NorthboundChartProps {
  data: NorthboundFlow[]
}

export const NorthboundChart: React.FC<NorthboundChartProps> = ({ data }) => {
  if (data.length === 0) return null

  const latest = data[data.length - 1]
  const latestFlowYi = (latest.northMoney / 100).toFixed(1) // 百万 → 亿
  const isPositive = latest.northMoney >= 0

  // Chart dimensions
  const width = 100 // percentage-based rendering
  const height = 80
  const padding = { top: 4, bottom: 4, left: 0, right: 0 }

  const values = data.map((d) => d.northMoney)
  const maxAbs = Math.max(Math.abs(Math.max(...values)), Math.abs(Math.min(...values)), 1)

  const chartWidth = width
  const chartHeight = height - padding.top - padding.bottom
  const midY = padding.top + chartHeight / 2

  return (
    <div style={{
      background: '#161618',
      border: '1px solid #2a2a30',
      borderRadius: 10,
      padding: '16px 18px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>北向资金</div>
        <div style={{
          fontSize: 12,
          color: isPositive ? '#F92855' : '#2DC08E',
          fontWeight: 600
        }}>
          今日 {isPositive ? '+' : ''}{latestFlowYi}亿
        </div>
      </div>

      {/* Area chart */}
      <svg width="100%" height={height} viewBox={`0 0 ${data.length} ${height}`} preserveAspectRatio="none">
        {/* Zero line */}
        <line x1={0} y1={midY} x2={data.length} y2={midY} stroke="#2a2a30" strokeWidth={0.5} />

        {/* Bars */}
        {data.map((d, i) => {
          const val = d.northMoney
          const barHeight = (Math.abs(val) / maxAbs) * (chartHeight / 2)
          const isPos = val >= 0
          const y = isPos ? midY - barHeight : midY

          return (
            <rect
              key={d.date}
              x={i}
              y={y}
              width={0.7}
              height={Math.max(barHeight, 0.5)}
              fill={isPos ? 'rgba(249, 40, 85, 0.7)' : 'rgba(45, 192, 142, 0.7)'}
              rx={0.2}
            />
          )
        })}
      </svg>

      {/* Date range */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#5c5c6a' }}>
        <span>{data[0]?.date ? `${data[0].date.slice(4, 6)}/${data[0].date.slice(6, 8)}` : ''}</span>
        <span>近{data.length}个交易日</span>
        <span>{latest.date ? `${latest.date.slice(4, 6)}/${latest.date.slice(6, 8)}` : ''}</span>
      </div>
    </div>
  )
}
