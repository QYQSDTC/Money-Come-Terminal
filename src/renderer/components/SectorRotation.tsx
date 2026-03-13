import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Spin, Button, Tooltip } from 'antd'
import { ReloadOutlined, LoadingOutlined } from '@ant-design/icons'
import type { SectorRotationData, SectorDaySnapshot, SectorCumRank, SectorMembersResult, SectorMemberStock } from '../../shared/types'

type SortBy = 'pct_5d' | 'pct_10d' | 'pct_20d'

const TOP_COLORS = ['#F92855', '#f59e0b', '#3b82f6', '#a855f7', '#2DC08E']

function fmtDate(s?: string): string {
  if (!s || s.length < 8) return '--'
  return `${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function pctColor(v: number): string {
  if (v > 3) return '#F92855'
  if (v > 0) return '#e85a71'
  if (v < -3) return '#2DC08E'
  if (v < 0) return '#4ba88e'
  return '#8a8a96'
}

function pctText(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function heatColor(pct: number): string {
  if (pct >= 9.5) return '#c02040'
  if (pct >= 5)   return '#b03048'
  if (pct >= 3)   return '#993050'
  if (pct >= 1)   return '#7a3555'
  if (pct > 0)    return '#5e3a52'
  if (pct === 0)  return '#3a3a3e'
  if (pct > -1)   return '#385248'
  if (pct > -3)   return '#2a6850'
  if (pct > -5)   return '#1e7e52'
  return '#0f9648'
}

// ==================== Squarified Treemap Layout ====================

interface TreemapNode {
  stock: SectorMemberStock
  weight: number
}

interface TreemapRect {
  x: number; y: number; w: number; h: number
  stock: SectorMemberStock
}

function layoutSquarified(
  nodes: TreemapNode[],
  x: number, y: number, w: number, h: number
): TreemapRect[] {
  if (nodes.length === 0) return []
  if (nodes.length === 1) {
    return [{ x, y, w, h, stock: nodes[0].stock }]
  }

  const totalWeight = nodes.reduce((s, n) => s + n.weight, 0)
  const sorted = [...nodes].sort((a, b) => b.weight - a.weight)

  // Normalize weights to fill the rectangle area
  const area = w * h
  const normalized: TreemapNode[] = sorted.map(n => ({
    ...n,
    weight: (n.weight / totalWeight) * area,
  }))

  return squarify(normalized, [], x, y, w, h)
}

function squarify(
  remaining: TreemapNode[],
  row: TreemapNode[],
  x: number, y: number, w: number, h: number
): TreemapRect[] {
  if (remaining.length === 0) {
    return layoutRow(row, x, y, w, h)
  }

  const side = Math.min(w, h)
  const next = remaining[0]
  const newRow = [...row, next]

  const rowSum = row.reduce((s, n) => s + n.weight, 0)
  const newRowSum = rowSum + next.weight

  if (row.length === 0 || worstRow(newRow, newRowSum, side) <= worstRow(row, rowSum, side)) {
    return squarify(remaining.slice(1), newRow, x, y, w, h)
  } else {
    const laid = layoutRow(row, x, y, w, h)
    const fraction = rowSum / (w * h)
    let nx = x, ny = y, nw = w, nh = h
    if (w >= h) {
      const sliceW = w * fraction
      nx = x + sliceW
      nw = w - sliceW
    } else {
      const sliceH = h * fraction
      ny = y + sliceH
      nh = h - sliceH
    }
    return [...laid, ...squarify(remaining, [], nx, ny, nw, nh)]
  }
}

function worstRow(row: TreemapNode[], rowSum: number, side: number): number {
  if (row.length === 0 || side <= 0) return Infinity
  const rowSide = rowSum / side
  let worst = 0
  for (const n of row) {
    const cellSide = n.weight / rowSide
    const ratio = Math.max(rowSide / cellSide, cellSide / rowSide)
    if (ratio > worst) worst = ratio
  }
  return worst
}

function layoutRow(
  row: TreemapNode[],
  x: number, y: number, w: number, h: number
): TreemapRect[] {
  if (row.length === 0) return []
  const rowSum = row.reduce((s, n) => s + n.weight, 0)
  const results: TreemapRect[] = []

  if (w >= h) {
    const sliceW = rowSum / h
    let cy = y
    for (const n of row) {
      const cellH = n.weight / sliceW
      results.push({ x, y: cy, w: sliceW, h: cellH, stock: n.stock })
      cy += cellH
    }
  } else {
    const sliceH = rowSum / w
    let cx = x
    for (const n of row) {
      const cellW = n.weight / sliceH
      results.push({ x: cx, y, w: cellW, h: sliceH, stock: n.stock })
      cx += cellW
    }
  }
  return results
}

// ==================== Treemap Modal ====================

function TreemapModal({ data, onClose }: {
  data: SectorMembersResult
  onClose: () => void
}) {
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 200)
  }

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const SIZE = 520
  const stocks = data.stocks

  const rects = useMemo(() => {
    if (stocks.length === 0) return []
    const nodes: TreemapNode[] = stocks.map(s => ({
      stock: s,
      weight: Math.max(Math.abs(s.amount), 1),
    }))
    return layoutSquarified(nodes, 0, 0, SIZE, SIZE)
  }, [stocks])

  return (
    <div
      className={`tm-modal-backdrop ${closing ? 'closing' : ''}`}
      onClick={handleBackdrop}
    >
      <div className={`tm-modal ${closing ? 'closing' : ''}`}>
        <div className="tm-modal-header">
          <span className="tm-modal-title">{data.sector_name}</span>
          <span className="tm-modal-subtitle">
            成分股涨跌热力图 &middot; {data.date.slice(0, 4)}-{data.date.slice(4, 6)}-{data.date.slice(6, 8)}
          </span>
          <button className="tm-modal-close" onClick={handleClose}>&times;</button>
        </div>

        {stocks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8a8a96', fontSize: 13 }}>
            暂无成分股数据
          </div>
        ) : (
          <div className="tm-square-wrap">
            <div className="tm-square" style={{ width: SIZE, height: SIZE }}>
              {rects.map((r, i) => {
                const s = r.stock
                const isLarge = r.w > 60 && r.h > 40
                const isMedium = r.w > 40 && r.h > 28
                return (
                  <Tooltip
                    key={s.ts_code}
                    title={`${s.name} (${s.ts_code})\n涨跌: ${pctText(s.pct_chg)}\n收盘: ${s.close.toFixed(2)}`}
                  >
                    <div
                      className="tm-cell"
                      style={{
                        left: r.x,
                        top: r.y,
                        width: r.w,
                        height: r.h,
                        background: heatColor(s.pct_chg),
                        animationDelay: `${i * 30}ms`,
                      }}
                    >
                      {isLarge && (
                        <>
                          <span className="tm-cell-name">{s.name}</span>
                          <span className="tm-cell-pct" style={{ color: s.pct_chg >= 0 ? '#fcd2d2' : '#b8edd8' }}>
                            {pctText(s.pct_chg)}
                          </span>
                        </>
                      )}
                      {!isLarge && isMedium && (
                        <>
                          <span className="tm-cell-name sm">{s.name.slice(0, 3)}</span>
                          <span className="tm-cell-pct sm" style={{ color: s.pct_chg >= 0 ? '#fcd2d2' : '#b8edd8' }}>
                            {s.pct_chg >= 0 ? '+' : ''}{s.pct_chg.toFixed(1)}%
                          </span>
                        </>
                      )}
                    </div>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        )}

        <div className="tm-modal-legend">
          <span style={{ color: '#0f9648' }}>&#9632;</span> 跌&gt;5%
          <span style={{ color: '#2a6850' }}>&#9632;</span> 跌
          <span style={{ color: '#3a3a3e' }}>&#9632;</span> 平
          <span style={{ color: '#7a3555' }}>&#9632;</span> 涨
          <span style={{ color: '#c02040' }}>&#9632;</span> 涨&gt;9%
          <span style={{ marginLeft: 'auto', color: '#5c5c6a' }}>面积 = 成交额占比</span>
        </div>
      </div>
    </div>
  )
}

// ==================== Daily Top 5 Heatmap ====================

function DailyTop5Chart({ snapshots }: { snapshots: SectorDaySnapshot[] }) {
  const [expanded, setExpanded] = useState<{ code: string; name: string; date: string } | null>(null)
  const [memberData, setMemberData] = useState<SectorMembersResult | null>(null)
  const [memberLoading, setMemberLoading] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  if (snapshots.length === 0) return null

  const displayed = [...snapshots].reverse()

  const handleCellClick = async (tsCode: string, name: string, date: string) => {
    if (expanded && expanded.code === tsCode && expanded.date === date) {
      setExpanded(null)
      setMemberData(null)
      setMemberError(null)
      return
    }

    setExpanded({ code: tsCode, name, date })
    setMemberData(null)
    setMemberError(null)
    setMemberLoading(true)
    try {
      const result = await window.api.getSectorMembers(tsCode, name, date)
      if (result.success && result.data) {
        setMemberData(result.data)
      } else {
        setMemberError(result.error || '获取成分股失败')
      }
    } catch (e: any) {
      setMemberError(e.message || '获取成分股失败')
      console.error('[SectorMember] fetch error:', e)
    } finally {
      setMemberLoading(false)
    }
  }

  const closeModal = () => {
    setExpanded(null)
    setMemberData(null)
    setMemberError(null)
  }

  return (
    <div className="sector-card">
      <div className="sector-card-title">每日热门板块 Top5</div>
      <div className="sector-card-subtitle">
        最近 {displayed.length} 个交易日涨幅排名前5的概念板块
        <span style={{ marginLeft: 8, color: '#5c5c6a', fontSize: 10 }}>点击板块查看成分股热力图</span>
      </div>
      <div className="sector-daily-grid">
        <div className="sector-daily-header">
          <div className="sector-daily-rank-label"></div>
          {displayed.map(snap => (
            <div key={snap.date} className="sector-daily-date">{fmtDate(snap.date)}</div>
          ))}
        </div>
        {[0, 1, 2, 3, 4].map(rank => (
          <div key={rank} className="sector-daily-row">
            <div className="sector-daily-rank-label" style={{ color: TOP_COLORS[rank] }}>
              #{rank + 1}
            </div>
            {displayed.map(snap => {
              const s = snap.top5[rank]
              if (!s) return <div key={snap.date} className="sector-daily-cell empty">--</div>
              const isActive = expanded && expanded.code === s.ts_code && expanded.date === snap.date
              return (
                <Tooltip
                  key={snap.date}
                  title={`${s.name} ${pctText(s.pct_change)} — 点击展开`}
                >
                  <div
                    className={`sector-daily-cell clickable ${isActive ? 'active' : ''}`}
                    style={{
                      background: `rgba(${s.pct_change > 3 ? '249,40,85' : s.pct_change > 1 ? '232,90,113' : '138,138,150'}, ${Math.min(0.15 + s.pct_change * 0.04, 0.5)})`,
                    }}
                    onClick={() => handleCellClick(s.ts_code, s.name, snap.date)}
                  >
                    <span className="sector-cell-name">{s.name.length > 4 ? s.name.slice(0, 4) : s.name}</span>
                    <span className="sector-cell-pct" style={{ color: pctColor(s.pct_change) }}>
                      {s.pct_change.toFixed(1)}%
                    </span>
                  </div>
                </Tooltip>
              )
            })}
          </div>
        ))}
      </div>

      {/* Loading modal */}
      {expanded && memberLoading && (
        <div className="tm-modal-backdrop" onClick={closeModal}>
          <div className="tm-modal" onClick={e => e.stopPropagation()} style={{ minHeight: 200 }}>
            <div className="tm-modal-header">
              <span className="tm-modal-title">{expanded.name}</span>
              <button className="tm-modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#8a8a96', fontSize: 13 }}>
              <LoadingOutlined style={{ fontSize: 18 }} />
              加载成分股数据...
            </div>
          </div>
        </div>
      )}

      {/* Error modal */}
      {expanded && memberError && !memberLoading && (
        <div className="tm-modal-backdrop" onClick={closeModal}>
          <div className="tm-modal" onClick={e => e.stopPropagation()} style={{ minHeight: 200 }}>
            <div className="tm-modal-header">
              <span className="tm-modal-title">{expanded.name}</span>
              <button className="tm-modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F92855', fontSize: 13, padding: 24 }}>
              {memberError}
            </div>
          </div>
        </div>
      )}

      {/* Treemap modal */}
      {expanded && memberData && !memberLoading && (
        <TreemapModal data={memberData} onClose={closeModal} />
      )}
    </div>
  )
}

// ==================== Cumulative Ranking Chart ====================

function CumRankingChart({ ranking }: { ranking: SectorCumRank[] }) {
  const [sortBy, setSortBy] = useState<SortBy>('pct_5d')
  const TOP_N = 15

  const sorted = [...ranking].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, TOP_N)

  const labels: Record<SortBy, string> = {
    pct_5d: '5日',
    pct_10d: '10日',
    pct_20d: '20日',
  }

  const maxVal = Math.max(...sorted.map(s => Math.abs(s[sortBy])), 1)

  return (
    <div className="sector-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div className="sector-card-title">累计涨幅排名</div>
          <div className="sector-card-subtitle">概念板块 {labels[sortBy]} 累计涨幅 Top {TOP_N}</div>
        </div>
        <div className="sector-sort-tabs">
          {(['pct_5d', 'pct_10d', 'pct_20d'] as SortBy[]).map(key => (
            <button
              key={key}
              className={`sector-sort-tab ${sortBy === key ? 'active' : ''}`}
              onClick={() => setSortBy(key)}
            >
              {labels[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="sector-ranking-list">
        {sorted.map((s, i) => {
          const val = s[sortBy]
          const barWidth = Math.abs(val) / maxVal * 100
          return (
            <div key={s.ts_code} className="sector-ranking-row">
              <span className="sector-ranking-idx" style={{
                color: i < 3 ? TOP_COLORS[i] : '#5c5c6a',
                fontWeight: i < 3 ? 700 : 400,
              }}>
                {i + 1}
              </span>
              <span className="sector-ranking-name">{s.name}</span>
              <div className="sector-ranking-bar-wrap">
                <div
                  className="sector-ranking-bar"
                  style={{
                    width: `${barWidth}%`,
                    background: val >= 0
                      ? `linear-gradient(90deg, rgba(249,40,85,0.15), rgba(249,40,85,0.5))`
                      : `linear-gradient(90deg, rgba(45,192,142,0.15), rgba(45,192,142,0.5))`,
                  }}
                />
              </div>
              <div className="sector-ranking-values">
                <span style={{ color: pctColor(s.pct_5d), minWidth: 52, textAlign: 'right' }}>{pctText(s.pct_5d)}</span>
                <span style={{ color: pctColor(s.pct_10d), minWidth: 52, textAlign: 'right' }}>{pctText(s.pct_10d)}</span>
                <span style={{ color: pctColor(s.pct_20d), minWidth: 52, textAlign: 'right' }}>{pctText(s.pct_20d)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Column headers for the values */}
      <div className="sector-ranking-footer">
        <span></span><span></span><span></span>
        <div className="sector-ranking-values" style={{ color: '#5c5c6a', fontSize: 10 }}>
          <span style={{ minWidth: 52, textAlign: 'right' }}>5日</span>
          <span style={{ minWidth: 52, textAlign: 'right' }}>10日</span>
          <span style={{ minWidth: 52, textAlign: 'right' }}>20日</span>
        </div>
      </div>
    </div>
  )
}

// ==================== Main Component ====================

export const SectorRotation: React.FC = () => {
  const [data, setData] = useState<SectorRotationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getSectorRotation()
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || '获取数据失败')
      }
    } catch (e: any) {
      setError(e.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#8a8a96' }}>
        <Spin size="large" />
        <div style={{ fontSize: 14 }}>正在加载板块轮动数据...</div>
        <div style={{ fontSize: 12, color: '#5c5c6a' }}>需要获取 20 日概念板块行情，请稍候</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <div style={{ fontSize: 14, color: '#F92855' }}>{error}</div>
        <Button type="primary" icon={<ReloadOutlined />} onClick={fetchData} style={{ borderRadius: 8 }}>重新加载</Button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="sector-container">
      {loading && (
        <div style={{
          position: 'fixed', top: 80, right: 20,
          background: 'rgba(30,30,34,0.95)', border: '1px solid #2a2a30',
          borderRadius: 8, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          zIndex: 100, fontSize: 12, color: '#8a8a96'
        }}>
          <Spin size="small" /> 刷新中...
        </div>
      )}

      <DailyTop5Chart snapshots={data.dailyTop5} />
      <CumRankingChart ranking={data.cumRanking} />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 4px', fontSize: 11, color: '#5c5c6a'
      }}>
        <span>数据日期: {data.date ? `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}` : '--'}</span>
        <Button
          type="text" size="small" icon={<ReloadOutlined spin={loading} />}
          onClick={fetchData} style={{ color: '#5c5c6a', fontSize: 11 }}
        >
          刷新
        </Button>
      </div>
    </div>
  )
}
