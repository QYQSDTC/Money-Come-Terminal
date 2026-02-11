import React from 'react'
import { Tooltip } from 'antd'
import type { SentimentScore } from '../../../shared/types'

interface SentimentGaugeProps {
  sentiment: SentimentScore
}

const LEVEL_CONFIG: Record<string, { color: string; bgColor: string }> = {
  freezing: { color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  cold: { color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.1)' },
  neutral: { color: '#8a8a96', bgColor: 'rgba(138, 138, 150, 0.1)' },
  warm: { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  hot: { color: '#F92855', bgColor: 'rgba(249, 40, 85, 0.1)' }
}

function GaugeArc({ score, color }: { score: number; color: string }) {
  // SVG gauge - semicircular arc from 180° to 0°
  const size = 160
  const cx = size / 2
  const cy = size / 2 + 10
  const radius = 60
  const strokeWidth = 10

  // Arc goes from -180° (left) to 0° (right), score maps 0-100
  const startAngle = Math.PI
  const endAngle = Math.PI - (score / 100) * Math.PI

  const startX = cx + radius * Math.cos(startAngle)
  const startY = cy - radius * Math.sin(startAngle)
  const endX = cx + radius * Math.cos(endAngle)
  const endY = cy - radius * Math.sin(endAngle)

  const largeArc = score > 50 ? 1 : 0

  return (
    <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
      {/* Background arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="#2a2a30"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Score arc */}
      {score > 0 && (
        <path
          d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ transition: 'all 0.8s ease' }}
        />
      )}
      {/* Score text */}
      <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize="28" fontWeight="700" fontFamily="system-ui">
        {score}
      </text>
    </svg>
  )
}

export const SentimentGauge: React.FC<SentimentGaugeProps> = ({ sentiment }) => {
  const config = LEVEL_CONFIG[sentiment.level] || LEVEL_CONFIG.neutral

  return (
    <div style={{
      background: config.bgColor,
      border: `1px solid ${config.color}33`,
      borderRadius: 10,
      padding: '16px 18px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec', marginBottom: 4 }}>
        情绪指数
      </div>

      <GaugeArc score={sentiment.total} color={config.color} />

      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: config.color,
        marginTop: -4,
        marginBottom: 12
      }}>
        {sentiment.label}
      </div>

      {/* Component breakdown */}
      <div style={{ textAlign: 'left' }}>
        {sentiment.components.map((comp) => (
          <Tooltip
            key={comp.name}
            title={`权重 ${(comp.weight * 100).toFixed(0)}%，得分 ${comp.value.toFixed(0)}`}
            placement="left"
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '3px 0',
              fontSize: 11,
              color: '#8a8a96',
              cursor: 'default'
            }}>
              <span>{comp.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '55%' }}>
                <div style={{
                  flex: 1,
                  height: 4,
                  background: '#1e1e22',
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${comp.value}%`,
                    height: '100%',
                    background: comp.value >= 60 ? '#F92855' : comp.value >= 40 ? '#8a8a96' : '#3b82f6',
                    borderRadius: 2,
                    transition: 'width 0.6s ease'
                  }} />
                </div>
                <span style={{ fontVariantNumeric: 'tabular-nums', width: 24, textAlign: 'right', fontSize: 10 }}>
                  {comp.value.toFixed(0)}
                </span>
              </div>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
