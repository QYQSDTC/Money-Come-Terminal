import React from 'react'
import { Tooltip } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, PauseOutlined } from '@ant-design/icons'
import type { MarketBreadth } from '../../../shared/types'

interface BreadthBarProps {
  breadth: MarketBreadth
}

export const BreadthBar: React.FC<BreadthBarProps> = ({ breadth }) => {
  const total = breadth.advanceCount + breadth.declineCount + breadth.flatCount
  if (total === 0) return null

  const advPct = (breadth.advanceCount / total) * 100
  const flatPct = (breadth.flatCount / total) * 100
  const decPct = (breadth.declineCount / total) * 100

  return (
    <div style={{
      background: '#161618',
      border: '1px solid #2a2a30',
      borderRadius: 10,
      padding: '16px 18px'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec', marginBottom: 12 }}>
        涨跌分布
      </div>

      {/* Numbers row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
        <Tooltip title={`上涨 ${breadth.advanceCount} 家 (${advPct.toFixed(1)}%)`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F92855', cursor: 'default' }}>
            <ArrowUpOutlined style={{ fontSize: 11 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>{breadth.advanceCount}</span>
          </div>
        </Tooltip>

        <Tooltip title={`平盘 ${breadth.flatCount} 家 (${flatPct.toFixed(1)}%)`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8a8a96', cursor: 'default' }}>
            <PauseOutlined style={{ fontSize: 11 }} />
            <span style={{ fontWeight: 600 }}>{breadth.flatCount}</span>
          </div>
        </Tooltip>

        <Tooltip title={`下跌 ${breadth.declineCount} 家 (${decPct.toFixed(1)}%)`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2DC08E', cursor: 'default' }}>
            <ArrowDownOutlined style={{ fontSize: 11 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>{breadth.declineCount}</span>
          </div>
        </Tooltip>
      </div>

      {/* Stacked bar */}
      <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 2 }}>
        <div style={{
          width: `${advPct}%`,
          background: 'linear-gradient(90deg, #F92855, #ff6b81)',
          borderRadius: '4px 0 0 4px',
          transition: 'width 0.6s ease'
        }} />
        <div style={{
          width: `${flatPct}%`,
          background: '#3a3a42',
          transition: 'width 0.6s ease'
        }} />
        <div style={{
          width: `${decPct}%`,
          background: 'linear-gradient(90deg, #34d399, #2DC08E)',
          borderRadius: '0 4px 4px 0',
          transition: 'width 0.6s ease'
        }} />
      </div>

      {/* Limit counts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <Tooltip title="涨停家数">
            <span style={{ color: '#F92855' }}>
              涨停 <span style={{ fontWeight: 700 }}>{breadth.limitUpCount}</span>
            </span>
          </Tooltip>
          <Tooltip title="跌停家数">
            <span style={{ color: '#2DC08E' }}>
              跌停 <span style={{ fontWeight: 700 }}>{breadth.limitDownCount}</span>
            </span>
          </Tooltip>
        </div>
        <span style={{ color: '#5c5c6a' }}>
          共 {total} 只
        </span>
      </div>
    </div>
  )
}
