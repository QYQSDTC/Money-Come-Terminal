import React from 'react'
import { Tooltip } from 'antd'
import type { MarketStats } from '../../../shared/types'

interface MarketStatsRowProps {
  stats: MarketStats[]
}

function StatItem({ label, value, unit, tooltip }: { label: string; value: string; unit?: string; tooltip?: string }) {
  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 12px',
      minWidth: 80,
      cursor: 'default'
    }}>
      <div style={{ fontSize: 11, color: '#8a8a96', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8ec', fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span style={{ fontSize: 10, color: '#5c5c6a', marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  )

  return tooltip ? (
    <Tooltip title={tooltip} placement="top">
      {content}
    </Tooltip>
  ) : content
}

export const MarketStatsRow: React.FC<MarketStatsRowProps> = ({ stats }) => {
  if (stats.length === 0) return null

  // Aggregate stats
  const totalMv = stats.reduce((sum, s) => sum + s.totalMv, 0)
  const totalComCount = stats.reduce((sum, s) => sum + s.comCount, 0)
  const totalAmount = stats.reduce((sum, s) => sum + s.amount, 0)

  // Format total market value: 万亿
  const totalMvWanYi = (totalMv / 10000000000).toFixed(1)
  const totalAmountYi = (totalAmount / 100000).toFixed(0)

  return (
    <div style={{
      background: '#161618',
      border: '1px solid #2a2a30',
      borderRadius: 10,
      padding: '12px 16px'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec', marginBottom: 8 }}>
        市场统计
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around' }}>
        <StatItem label="总市值" value={totalMvWanYi} unit="万亿" tooltip="A股总市值" />
        <StatItem label="上市公司" value={totalComCount.toLocaleString()} unit="家" />
        <StatItem label="总成交额" value={totalAmountYi} unit="亿" />

        {stats.map((s) => (
          <StatItem
            key={s.ts_code}
            label={`${s.name} PE`}
            value={s.pe ? s.pe.toFixed(1) : '--'}
            tooltip={`${s.name} 市盈率 (加权平均)`}
          />
        ))}

        {stats.filter(s => s.tr > 0).map((s) => (
          <StatItem
            key={`${s.ts_code}-tr`}
            label={`${s.name} 换手`}
            value={s.tr ? `${s.tr.toFixed(2)}%` : '--'}
            tooltip={`${s.name} 换手率`}
          />
        ))}
      </div>
    </div>
  )
}
