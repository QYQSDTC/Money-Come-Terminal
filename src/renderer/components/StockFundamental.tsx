import React, { useEffect, useState, useRef } from 'react'
import { Spin } from 'antd'
import { FundOutlined, ReloadOutlined, BankOutlined } from '@ant-design/icons'
import type { StockInfo, StockFundamental as StockFundamentalType } from '../../shared/types'

// ==================== Helpers ====================

function formatMv(wanYuan: number): string {
  if (!wanYuan || wanYuan <= 0) return '--'
  const yi = wanYuan / 10000
  if (yi >= 10000) return (yi / 10000).toFixed(2) + '万亿'
  if (yi >= 1) return yi.toFixed(2) + '亿'
  return wanYuan.toFixed(0) + '万'
}

function formatShare(wanGu: number): string {
  if (!wanGu || wanGu <= 0) return '--'
  const yi = wanGu / 10000
  if (yi >= 1) return yi.toFixed(2) + '亿股'
  return wanGu.toFixed(0) + '万股'
}

function formatRevenue(yuan: number): string {
  if (!yuan) return '--'
  const abs = Math.abs(yuan)
  const sign = yuan < 0 ? '-' : ''
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(2) + '亿'
  if (abs >= 10000) return sign + (abs / 10000).toFixed(0) + '万'
  return sign + abs.toFixed(0)
}

function formatPct(v: number): string {
  if (v === 0 || v === null || v === undefined) return '--'
  return v.toFixed(2) + '%'
}

function formatRatio(v: number): string {
  if (v === 0 || v === null || v === undefined) return '--'
  return v.toFixed(2)
}

function formatPeriod(p: string): string {
  if (p.length !== 8) return p
  const y = p.substring(0, 4)
  const m = p.substring(4, 6)
  if (m === '03') return `${y}Q1`
  if (m === '06') return `${y}H1`
  if (m === '09') return `${y}Q3`
  if (m === '12') return `${y}年报`
  return `${y}/${m}`
}

function pctColor(v: number): string {
  if (v > 0) return '#F92855'
  if (v < 0) return '#2DC08E'
  return '#a0a0b0'
}

// ==================== Component ====================

interface Props {
  stock: StockInfo | null
}

export const StockFundamental: React.FC<Props> = ({ stock }) => {
  const [data, setData] = useState<StockFundamentalType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevStockRef = useRef<string | null>(null)

  const fetchData = async (tsCode: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await (window as any).api.getStockFundamental(tsCode)
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || '获取基本面数据失败')
      }
    } catch (e: any) {
      setError(e.message || '请求失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (stock?.ts_code && stock.ts_code !== prevStockRef.current) {
      prevStockRef.current = stock.ts_code
      setData(null)
      fetchData(stock.ts_code)
    }
  }, [stock?.ts_code])

  if (!stock) return null

  if (loading && !data) {
    return (
      <div style={s.centerBox}>
        <Spin size="small" />
        <div style={{ fontSize: 11, color: '#8a8a96', marginTop: 8 }}>加载基本面数据...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={s.centerBox}>
        <div style={{ fontSize: 12, color: '#F92855', marginBottom: 8 }}>{error}</div>
        <button style={s.retryBtn} onClick={() => fetchData(stock.ts_code)}>
          <ReloadOutlined style={{ marginRight: 4 }} />重试
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{ padding: '4px 0' }}>
      {/* ---- Section: Valuation ---- */}
      <div style={s.sectionHeader}>
        <BankOutlined style={{ fontSize: 12, color: '#3b82f6' }} />
        <span style={s.sectionTitle}>估值指标</span>
        <button
          style={s.refreshBtn}
          onClick={() => fetchData(stock.ts_code)}
          disabled={loading}
        >
          <ReloadOutlined spin={loading} style={{ fontSize: 10 }} />
        </button>
      </div>
      <div style={s.cardGrid}>
        <MetricCard label="总市值" value={formatMv(data.total_mv)} />
        <MetricCard label="流通市值" value={formatMv(data.circ_mv)} />
        <MetricCard label="PE(TTM)" value={formatRatio(data.pe_ttm)} highlight={data.pe_ttm > 0 && data.pe_ttm < 30} />
        <MetricCard label="PB" value={formatRatio(data.pb)} highlight={data.pb > 0 && data.pb < 3} />
        <MetricCard label="PS(TTM)" value={formatRatio(data.ps_ttm)} />
        <MetricCard label="总股本" value={formatShare(data.total_share)} />
      </div>

      {/* ---- Section: Financial Ratios ---- */}
      <div style={{ ...s.sectionHeader, marginTop: 14 }}>
        <FundOutlined style={{ fontSize: 12, color: '#feca57' }} />
        <span style={s.sectionTitle}>财务指标</span>
      </div>
      <div style={s.ratioGrid}>
        <RatioRow label="ROE" value={formatPct(data.roe)} color={pctColor(data.roe)} />
        <RatioRow label="ROA" value={formatPct(data.roa)} color={pctColor(data.roa)} />
        <RatioRow label="毛利率" value={formatPct(data.grossprofit_margin)} />
        <RatioRow label="净利率" value={formatPct(data.netprofit_margin)} color={pctColor(data.netprofit_margin)} />
        <RatioRow label="资产负债率" value={formatPct(data.debt_to_assets)} warn={data.debt_to_assets > 70} />
        <RatioRow label="净利润同比" value={formatPct(data.netprofit_yoy)} color={pctColor(data.netprofit_yoy)} />
        <RatioRow label="营收同比" value={formatPct(data.tr_yoy)} color={pctColor(data.tr_yoy)} />
      </div>

      {/* ---- Section: Quarterly Bar Chart ---- */}
      {data.quarters.length > 0 && (
        <>
          <div style={{ ...s.sectionHeader, marginTop: 14 }}>
            <FundOutlined style={{ fontSize: 12, color: '#48dbfb' }} />
            <span style={s.sectionTitle}>季度财报</span>
          </div>
          <QuarterlyBarChart quarters={[...data.quarters].reverse()} />
        </>
      )}
    </div>
  )
}

// ==================== Sub-components ====================

const MetricCard: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={s.card}>
    <div style={s.cardLabel}>{label}</div>
    <div style={{
      ...s.cardValue,
      color: highlight ? '#feca57' : '#e8e8ec'
    }}>{value}</div>
  </div>
)

const RatioRow: React.FC<{ label: string; value: string; color?: string; warn?: boolean }> = ({ label, value, color, warn }) => (
  <div style={s.ratioRow}>
    <span style={s.ratioLabel}>{label}</span>
    <span style={{
      ...s.ratioValue,
      color: warn ? '#F92855' : color || '#b0b0ba'
    }}>{value}</span>
  </div>
)

// ---- Quarterly Bar Chart ----

import type { QuarterlyFinancial } from '../../shared/types'

const CHART_HEIGHT = 120
const REVENUE_COLOR = '#3b82f6'
const INCOME_POS_COLOR = '#F92855'
const INCOME_NEG_COLOR = '#2DC08E'

const QuarterlyBarChart: React.FC<{ quarters: QuarterlyFinancial[] }> = ({ quarters }) => {
  if (quarters.length === 0) return null

  // Find max absolute value across both revenue and income for scaling
  const maxRevenue = Math.max(...quarters.map(q => Math.abs(q.revenue)), 1)
  const maxIncome = Math.max(...quarters.map(q => Math.abs(q.n_income)), 1)

  return (
    <div style={s.chartContainer}>
      {/* Legend */}
      <div style={s.chartLegend}>
        <span style={s.legendItem}>
          <span style={{ ...s.legendDot, background: REVENUE_COLOR }} />营收
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.legendDot, background: INCOME_POS_COLOR }} />净利润
        </span>
      </div>

      {/* Revenue chart */}
      <div style={s.chartLabel}>营收</div>
      <div style={s.barRow}>
        {quarters.map((q) => {
          const pct = maxRevenue > 0 ? (Math.abs(q.revenue) / maxRevenue) * 100 : 0
          return (
            <div key={q.period + '-rev'} style={s.barCol}>
              <div style={s.barValueLabel}>{formatRevenue(q.revenue)}</div>
              <div style={s.barTrack}>
                <div style={{
                  ...s.bar,
                  height: `${Math.max(pct, 2)}%`,
                  background: REVENUE_COLOR,
                  opacity: 0.85
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Net income diverging chart (positive up, negative down) */}
      <div style={{ ...s.chartLabel, marginTop: 10 }}>净利润</div>
      {(() => {
        const maxPos = Math.max(...quarters.map(q => q.n_income >= 0 ? q.n_income : 0), 1)
        const maxNeg = Math.max(...quarters.map(q => q.n_income < 0 ? Math.abs(q.n_income) : 0), 1)
        const hasPositive = quarters.some(q => q.n_income > 0)
        const hasNegative = quarters.some(q => q.n_income < 0)
        // Determine proportional split: how much space for positive vs negative halves
        const total = maxPos + maxNeg
        const posRatio = hasPositive ? (hasNegative ? maxPos / total : 1) : 0
        const negRatio = hasNegative ? (hasPositive ? maxNeg / total : 1) : 0
        const INCOME_CHART_H = CHART_HEIGHT + 20

        return (
          <div style={{ display: 'flex', gap: 3, padding: '0 2px', position: 'relative' }}>
            {quarters.map((q) => {
              const isPositive = q.n_income >= 0
              const absVal = Math.abs(q.n_income)
              // Bar height as percentage of its own half
              const barPctOfHalf = isPositive
                ? (maxPos > 0 ? absVal / maxPos : 0)
                : (maxNeg > 0 ? absVal / maxNeg : 0)
              const posHalfPx = INCOME_CHART_H * posRatio
              const negHalfPx = INCOME_CHART_H * negRatio
              const barH = Math.max((isPositive ? posHalfPx : negHalfPx) * barPctOfHalf, 2)

              return (
                <div key={q.period + '-inc'} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                  {/* Positive half */}
                  <div style={{
                    height: posHalfPx,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end'
                  }}>
                    {isPositive && (
                      <>
                        <div style={{
                          ...s.barValueLabel,
                          color: INCOME_POS_COLOR,
                          marginBottom: 1
                        }}>
                          {formatRevenue(q.n_income)}
                        </div>
                        <div style={{
                          width: '70%',
                          maxWidth: 36,
                          minWidth: 12,
                          height: barH,
                          background: INCOME_POS_COLOR,
                          opacity: 0.8,
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 0.4s ease'
                        }} />
                      </>
                    )}
                  </div>
                  {/* Zero axis line is rendered once via the container */}
                  {/* Negative half */}
                  <div style={{
                    height: negHalfPx,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start'
                  }}>
                    {!isPositive && (
                      <>
                        <div style={{
                          width: '70%',
                          maxWidth: 36,
                          minWidth: 12,
                          height: barH,
                          background: INCOME_NEG_COLOR,
                          opacity: 0.7,
                          borderRadius: '0 0 3px 3px',
                          transition: 'height 0.4s ease'
                        }} />
                        <div style={{
                          ...s.barValueLabel,
                          color: INCOME_NEG_COLOR,
                          marginTop: 1
                        }}>
                          {formatRevenue(q.n_income)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Zero axis line */}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: INCOME_CHART_H * posRatio,
              height: 1,
              background: '#3a3a44',
              pointerEvents: 'none'
            }} />
          </div>
        )
      })()}

      {/* X-axis labels */}
      <div style={s.xAxis}>
        {quarters.map((q) => (
          <div key={q.period + '-label'} style={s.xLabel}>
            {formatPeriod(q.period)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ==================== Styles ====================

const s: Record<string, React.CSSProperties> = {
  centerBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 0'
  },
  retryBtn: {
    padding: '4px 12px',
    fontSize: 11,
    background: '#1e1e22',
    border: '1px solid #2a2a32',
    borderRadius: 6,
    color: '#a0a0b0',
    cursor: 'pointer'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#b0b0b8',
    flex: 1
  },
  refreshBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    border: '1px solid #2a2a32',
    background: 'transparent',
    color: '#707080',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Valuation cards
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 6
  },
  card: {
    background: '#1a1a1e',
    borderRadius: 7,
    padding: '8px 10px',
    border: '1px solid #222226'
  },
  cardLabel: {
    fontSize: 10,
    color: '#606070',
    marginBottom: 3
  },
  cardValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e8e8ec',
    fontFamily: '"SF Mono", "Cascadia Code", monospace'
  },

  // Ratios
  ratioGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px 8px'
  },
  ratioRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 4
  },
  ratioLabel: {
    fontSize: 11,
    color: '#707080'
  },
  ratioValue: {
    fontSize: 11,
    fontWeight: 500,
    fontFamily: '"SF Mono", "Cascadia Code", monospace',
    color: '#b0b0ba'
  },

  // Bar chart
  chartContainer: {
    background: '#1a1a1e',
    borderRadius: 7,
    border: '1px solid #222226',
    padding: '10px 8px 6px'
  },
  chartLegend: {
    display: 'flex',
    gap: 12,
    marginBottom: 10,
    justifyContent: 'flex-end'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    color: '#707080'
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    display: 'inline-block'
  },
  chartLabel: {
    fontSize: 9,
    color: '#505060',
    marginBottom: 2,
    paddingLeft: 2,
    fontWeight: 500
  },
  barRow: {
    display: 'flex',
    gap: 3,
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    padding: '0 2px'
  },
  barCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    height: '100%',
    minWidth: 0
  },
  barValueLabel: {
    fontSize: 8,
    color: '#808090',
    marginBottom: 2,
    whiteSpace: 'nowrap' as const,
    fontFamily: '"SF Mono", "Cascadia Code", monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    textAlign: 'center' as const
  },
  barTrack: {
    flex: 1,
    width: '70%',
    maxWidth: 36,
    minWidth: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-end',
    borderRadius: '3px 3px 0 0',
    overflow: 'hidden'
  },
  bar: {
    width: '100%',
    borderRadius: '3px 3px 0 0',
    transition: 'height 0.4s ease',
    minHeight: 2
  },
  xAxis: {
    display: 'flex',
    gap: 3,
    padding: '4px 2px 0',
    borderTop: '1px solid #2a2a30'
  },
  xLabel: {
    flex: 1,
    textAlign: 'center' as const,
    fontSize: 8,
    color: '#505060',
    fontFamily: '"SF Mono", "Cascadia Code", monospace'
  }
}
