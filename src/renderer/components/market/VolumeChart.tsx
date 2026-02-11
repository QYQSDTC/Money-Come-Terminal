import React from 'react'
import type { IndexQuote } from '../../../shared/types'

interface VolumeChartProps {
  indices: IndexQuote[]
}

export const VolumeChart: React.FC<VolumeChartProps> = ({ indices }) => {
  // Aggregate total market amount from all indices
  // Use the first index's history as the base timeline
  const primary = indices[0]
  if (!primary || primary.history.length < 2) return null

  // Total today's amount across all indices (in 千元 → 亿)
  const totalAmountYi = indices.reduce((sum, idx) => sum + idx.amount, 0) / 100000

  const height = 80
  const data = primary.history

  // Use close values as proxy for volume trend (we don't have historical volume in history)
  // Actually show index amount for today plus a visual of the price trend
  const values = data.map((d) => d.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return (
    <div style={{
      background: '#161618',
      border: '1px solid #2a2a30',
      borderRadius: 10,
      padding: '16px 18px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>市场成交</div>
        <div style={{ fontSize: 12, color: '#e8e8ec', fontWeight: 600 }}>
          今日 <span style={{ color: '#3b82f6' }}>{totalAmountYi.toFixed(0)}亿</span>
        </div>
      </div>

      {/* Bar-like chart showing trend */}
      <svg width="100%" height={height} viewBox={`0 0 ${data.length} ${height}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const barHeight = ((d.close - min) / range) * (height - 8) + 4
          const prevClose = i > 0 ? data[i - 1].close : d.close
          const isUp = d.close >= prevClose

          return (
            <rect
              key={d.date}
              x={i}
              y={height - barHeight}
              width={0.7}
              height={barHeight}
              fill={isUp ? 'rgba(59, 130, 246, 0.6)' : 'rgba(59, 130, 246, 0.3)'}
              rx={0.2}
            />
          )
        })}
      </svg>

      {/* Per-index breakdown */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {indices.map((idx) => {
          const amtYi = (idx.amount / 100000).toFixed(0)
          return (
            <div key={idx.ts_code} style={{ fontSize: 11, color: '#8a8a96' }}>
              {idx.name.replace('指数', '').replace('成指', '')}{' '}
              <span style={{ color: '#e8e8ec', fontWeight: 500 }}>{amtYi}亿</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
