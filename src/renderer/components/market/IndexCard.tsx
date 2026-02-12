import React, { useId } from 'react'
import type { IndexQuote } from '../../../shared/types'

interface IndexCardProps {
  index: IndexQuote
}

function MiniSparkline({ data, isUp }: { data: { date: string; close: number }[]; isUp: boolean }) {
  const gradId = useId()
  if (data.length < 2) return null

  const values = data.map((d) => d.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const height = 32
  // Use a viewBox with a fixed logical width; the SVG itself stretches to 100%
  const vW = 200
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * vW
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })

  const color = isUp ? '#F92855' : '#2DC08E'

  return (
    <svg
      viewBox={`0 0 ${vW} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height, marginTop: 8 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon
        points={`0,${height} ${points.join(' ')} ${vW},${height}`}
        fill={`url(#${gradId})`}
      />
      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export const IndexCard: React.FC<IndexCardProps> = ({ index }) => {
  const isUp = index.pct_chg >= 0
  const color = isUp ? '#F92855' : '#2DC08E'
  const bgColor = isUp ? 'rgba(249, 40, 85, 0.06)' : 'rgba(45, 192, 142, 0.06)'
  const borderColor = isUp ? 'rgba(249, 40, 85, 0.2)' : 'rgba(45, 192, 142, 0.2)'

  // Format amount: in 亿
  const amountYi = (index.amount / 100000).toFixed(0)

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: '14px 16px 10px',
        minWidth: 170,
        flex: 1,
        transition: 'all 0.25s ease',
        cursor: 'default'
      }}
      className="market-index-card"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>{index.name}</div>
        <div
          style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 4,
            background: isUp ? 'rgba(249, 40, 85, 0.15)' : 'rgba(45, 192, 142, 0.15)',
            color,
            fontWeight: 600
          }}
        >
          {isUp ? '+' : ''}{index.pct_chg.toFixed(2)}%
        </div>
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {index.close.toFixed(2)}
      </div>

      <div style={{ fontSize: 11, color: '#8a8a96', marginTop: 4 }}>
        {isUp ? '+' : ''}{index.change.toFixed(2)}
        <span style={{ marginLeft: 12 }}>额 {amountYi}亿</span>
      </div>

      <MiniSparkline data={index.history} isUp={isUp} />
    </div>
  )
}
