import React, { useState, useEffect, useCallback } from 'react'
import { Spin, Button, Tooltip } from 'antd'
import { ReloadOutlined, FireOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { SentimentLadderData, BoardLevel, DayTrend, LimitStock } from '../../shared/types'

type SentimentSubTab = 'sentiment' | 'ladder' | 'position'

// ==================== Stat Card ====================

function StatCard({ label, value, suffix, color }: {
  label: string; value: string | number; suffix?: string; color: string
}) {
  return (
    <div className="sentiment-stat-card">
      <div className="sentiment-stat-label">{label}</div>
      <div className="sentiment-stat-value" style={{ color }}>
        {value}
        {suffix && <span className="sentiment-stat-suffix">{suffix}</span>}
      </div>
    </div>
  )
}

// ==================== Promotion Rate Chart ====================

function PromotionChart({ trend }: { trend: DayTrend[] }) {
  if (trend.length < 2) return null

  const SVG_W = 560
  const SVG_H = 200
  const PAD = { top: 10, right: 12, bottom: 6, left: 36 }
  const chartW = SVG_W - PAD.left - PAD.right
  const chartH = SVG_H - PAD.top - PAD.bottom

  const lines = [
    { key: 'promotion1to2' as const, label: '1进2', color: '#3b82f6' },
    { key: 'promotion2to3' as const, label: '2进3', color: '#f59e0b' },
    { key: 'promotion3to4' as const, label: '3进4', color: '#a855f7' },
    { key: 'promotionHigh' as const, label: '高位晋级', color: '#F92855' },
  ]

  const allValues = trend.flatMap(d => lines.map(l => d[l.key] as number))
  const rawMax = Math.max(...allValues, 10)
  const maxVal = Math.ceil(rawMax / 10) * 10 || 10

  const ticks = [0, Math.round(maxVal / 4), Math.round(maxVal / 2), Math.round(maxVal * 3 / 4), maxVal]

  function toX(i: number) { return PAD.left + (i / (trend.length - 1)) * chartW }
  function toY(v: number) { return PAD.top + chartH - (v / maxVal) * chartH }

  function buildPath(key: keyof DayTrend): string {
    return trend.map((d, i) => {
      const x = toX(i)
      const y = toY(d[key] as number)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  }

  return (
    <div className="sentiment-chart-card">
      <div className="sentiment-chart-title">连板晋级率趋势</div>
      <div className="sentiment-chart-subtitle">晋级率(%)</div>
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
        {ticks.map(v => {
          const y = toY(v)
          return (
            <g key={v}>
              <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} stroke="#1f1f24" strokeWidth={1} />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fill="#5c5c6a" fontSize={10}>{v}</text>
            </g>
          )
        })}
        {lines.map(l => (
          <path key={l.key} d={buildPath(l.key)} fill="none" stroke={l.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {lines.map(l => trend.map((d, i) => (
          <circle key={`${l.key}-${i}`} cx={toX(i)} cy={toY(d[l.key] as number)} r={3} fill={l.color} />
        )))}
      </svg>
      <div className="sentiment-chart-dates">
        <span>{fmtDate(trend[0]?.date)}</span>
        <span>{fmtDate(trend[trend.length - 1]?.date)}</span>
      </div>
      <div className="sentiment-chart-legend">
        {lines.map(l => (
          <span key={l.key} className="sentiment-legend-item">
            <span className="sentiment-legend-dot" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ==================== Money Effect Chart ====================

function MoneyEffectChart({ trend }: { trend: DayTrend[] }) {
  if (trend.length < 2) return null

  const SVG_W = 560
  const SVG_H = 200
  const PAD = { top: 10, right: 44, bottom: 6, left: 44 }
  const chartW = SVG_W - PAD.left - PAD.right
  const chartH = SVG_H - PAD.top - PAD.bottom

  const rawMaxCount = Math.max(...trend.map(d => Math.max(d.limitUpCount, d.limitDownCount + d.breakCount, 1)))
  const maxCount = Math.ceil(rawMaxCount / 10) * 10 || 10
  const rawMaxRate = Math.max(...trend.map(d => d.breakRate), 10)
  const maxRate = Math.ceil(rawMaxRate / 10) * 10 || 10

  const countTicks = [0, Math.round(maxCount / 4), Math.round(maxCount / 2), Math.round(maxCount * 3 / 4), maxCount]
  const rateTicks = [0, Math.round(maxRate / 4), Math.round(maxRate / 2), Math.round(maxRate * 3 / 4), maxRate]

  const barSlotW = chartW / trend.length
  const barW = Math.min(barSlotW * 0.3, 20)
  const barGap = 3
  const innerPad = barW + barGap

  function toX(i: number) { return PAD.left + innerPad + (i / (trend.length - 1)) * (chartW - 2 * innerPad) }
  function toYCount(v: number) { return PAD.top + chartH - (v / maxCount) * chartH }
  function toYRate(v: number) { return PAD.top + chartH - (v / maxRate) * chartH }

  return (
    <div className="sentiment-chart-card">
      <div className="sentiment-chart-title">市场亏钱效应监控</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8%' }}>
        <div className="sentiment-chart-subtitle">家数</div>
        <div className="sentiment-chart-subtitle" style={{ color: '#3b82f6' }}>炸板率(%)</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
        {countTicks.map(v => {
          const y = toYCount(v)
          return (
            <g key={`c-${v}`}>
              <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} stroke="#1f1f24" strokeWidth={1} />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fill="#5c5c6a" fontSize={10}>{v}</text>
            </g>
          )
        })}
        {rateTicks.map(v => {
          const y = toYRate(v)
          return (
            <text key={`r-${v}`} x={SVG_W - PAD.right + 4} y={y + 3} textAnchor="start" fill="#3b82f6" fontSize={10}>{v}%</text>
          )
        })}
        {trend.map((d, i) => {
          const cx = toX(i)
          const upH = (d.limitUpCount / maxCount) * chartH
          const downH = (d.limitDownCount / maxCount) * chartH
          const breakH = (d.breakCount / maxCount) * chartH
          const baseY = PAD.top + chartH
          return (
            <g key={d.date}>
              <rect x={cx - barW - barGap / 2} y={baseY - upH} width={barW} height={Math.max(upH, 0)} fill="rgba(138,138,150,0.5)" rx={2} />
              {d.breakCount > 0 && (
                <rect x={cx - barW - barGap / 2} y={baseY - upH - breakH} width={barW} height={Math.max(breakH, 0)} fill="rgba(138,138,150,0.25)" rx={2} />
              )}
              <rect x={cx + barGap / 2} y={baseY - downH} width={barW} height={Math.max(downH, 1)} fill="rgba(45, 192, 142, 0.7)" rx={2} />
            </g>
          )
        })}
        <path
          d={trend.map((d, i) => {
            const x = toX(i)
            const y = toYRate(d.breakRate)
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
          }).join(' ')}
          fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round"
        />
        {trend.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toYRate(d.breakRate)} r={3} fill="#3b82f6" />
        ))}
      </svg>
      <div className="sentiment-chart-dates">
        <span>{fmtDate(trend[0]?.date)}</span>
        <span>{fmtDate(trend[trend.length - 1]?.date)}</span>
      </div>
      <div className="sentiment-chart-legend">
        <span className="sentiment-legend-item"><span className="sentiment-legend-rect" style={{ background: 'rgba(138,138,150,0.5)' }} />涨停家数</span>
        <span className="sentiment-legend-item"><span className="sentiment-legend-rect" style={{ background: 'rgba(138,138,150,0.25)' }} />炸板家数</span>
        <span className="sentiment-legend-item"><span className="sentiment-legend-dot" style={{ background: '#2DC08E' }} />跌停家数</span>
        <span className="sentiment-legend-item"><span className="sentiment-legend-line" />炸板率</span>
      </div>
    </div>
  )
}

// ==================== Ladder Table ====================

function LadderTable({ ladder }: { ladder: BoardLevel[] }) {
  if (ladder.length === 0) return null
  return (
    <div className="sentiment-ladder-table">
      <div className="sentiment-ladder-header">
        <div className="sentiment-chart-title">连板天梯</div>
        <div style={{ fontSize: 11, color: '#5c5c6a' }}>按连板数从高到低排列，首封时间越早越强</div>
      </div>
      {ladder.map(level => (
        <div key={level.level} className="sentiment-level-group">
          <div className="sentiment-level-badge">
            <span className="sentiment-level-num">{level.level}</span>
            <span className="sentiment-level-text">板</span>
            <span className="sentiment-level-count">{level.stocks.length}只</span>
          </div>
          <div className="sentiment-level-stocks">
            {level.stocks.map(stock => (
              <Tooltip key={stock.ts_code} title={
                <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                  <div>{stock.ts_code} · {stock.industry}</div>
                  <div>涨幅: {stock.pct_chg?.toFixed(2)}%</div>
                  <div>封单比: {(stock.fc_ratio * 100)?.toFixed(1)}%</div>
                  <div>封单额: {(stock.fd_amount / 10000)?.toFixed(0)}万</div>
                  <div>首封: {stock.first_time || '--'}</div>
                  <div>末封: {stock.last_time || '--'}</div>
                  <div>开板: {stock.open_times}次</div>
                </div>
              }>
                <div className={`sentiment-stock-chip ${stock.open_times === 0 ? 'sealed' : 'opened'}`}>
                  <span className="sentiment-stock-name">{stock.name}</span>
                  <span className="sentiment-stock-time">{stock.first_time ? stock.first_time.slice(0, 5) : '--'}</span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ==================== Sentiment Summary ====================

function SentimentSummary({ data }: { data: SentimentLadderData }) {
  const { stats, trend } = data
  const latestTrend = trend.length > 0 ? trend[trend.length - 1] : null
  const prevTrend = trend.length > 1 ? trend[trend.length - 2] : null
  const score = computeScore(stats)

  let sentimentLabel = '中性'
  let sentimentColor = '#8a8a96'
  if (score >= 80) { sentimentLabel = '极度亢奋'; sentimentColor = '#F92855' }
  else if (score >= 60) { sentimentLabel = '偏热'; sentimentColor = '#f59e0b' }
  else if (score >= 40) { sentimentLabel = '中性'; sentimentColor = '#8a8a96' }
  else if (score >= 20) { sentimentLabel = '偏冷'; sentimentColor = '#3b82f6' }
  else { sentimentLabel = '冰点'; sentimentColor = '#2DC08E' }

  return (
    <div className="sentiment-summary-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ThunderboltOutlined style={{ color: sentimentColor, fontSize: 16 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8ec' }}>赚钱效应分析</span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#5c5c6a' }}>市场情绪</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: sentimentColor }}>{sentimentLabel} ({score}分)</span>
        </div>
        <div className="sentiment-gauge-track">
          <div className="sentiment-gauge-fill" style={{ width: `${score}%`, background: 'linear-gradient(90deg, #2DC08E, #3b82f6, #f59e0b, #F92855)' }} />
          <div className="sentiment-gauge-marker" style={{ left: `${score}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5c5c6a', marginTop: 4 }}>
          <span>冰点</span><span>偏冷</span><span>中性</span><span>偏热</span><span>亢奋</span>
        </div>
      </div>
      <div className="sentiment-analysis-list">
        <AnalysisRow label="最高板" value={`${stats.highestBoard}板`}
          comment={stats.highestBoard >= 5 ? '高度板存在，市场有辨识度龙头' : stats.highestBoard >= 3 ? '市场有一定高度' : '缺乏高度，短线谨慎'}
          positive={stats.highestBoard >= 4} />
        <AnalysisRow label="封板率" value={`${stats.sealRate}%`}
          comment={stats.sealRate >= 70 ? '封板率高，资金合力强' : stats.sealRate >= 50 ? '封板率一般，分歧中前行' : '封板率偏低，注意风险'}
          positive={stats.sealRate >= 60} />
        <AnalysisRow label="1进2 成功率" value={`${stats.promotion1to2}%`}
          comment={stats.promotion1to2 >= 30 ? '打板次日溢价率高' : stats.promotion1to2 >= 15 ? '接力有一定赚钱效应' : '接力亏钱效应明显，慎追'}
          positive={stats.promotion1to2 >= 20} />
        <AnalysisRow label="涨停 / 跌停" value={`${stats.limitUpCount} / ${stats.limitDownCount}`}
          comment={stats.limitUpCount > stats.limitDownCount * 3 ? '多头占优，赚钱效应好' : stats.limitUpCount > stats.limitDownCount ? '多空偏均衡' : '空头占优，亏钱效应强'}
          positive={stats.limitUpCount > stats.limitDownCount * 2} />
      </div>
    </div>
  )
}

function AnalysisRow({ label, value, comment, positive }: { label: string; value: string; comment: string; positive: boolean }) {
  return (
    <div className="sentiment-analysis-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: '#8a8a96' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: positive ? '#F92855' : '#8a8a96' }}>{value}</span>
      </div>
      <div style={{ fontSize: 11, color: positive ? 'rgba(249,40,85,0.7)' : '#5c5c6a' }}>{comment}</div>
    </div>
  )
}

// ==================== Dragon Lineage ====================

function DragonLineage({ data }: { data: SentimentLadderData }) {
  const highBoards = data.ladder.filter(l => l.level >= 3)
  const midBoards = data.ladder.filter(l => l.level === 2)
  const lowBoards = data.ladder.filter(l => l.level === 1)

  return (
    <div className="sentiment-lineage">
      <div className="sentiment-chart-title" style={{ marginBottom: 12 }}>
        <FireOutlined style={{ color: '#F92855', marginRight: 6 }} />龙头族谱 · 连板梯队
      </div>
      {highBoards.length > 0 && (
        <div className="sentiment-lineage-section">
          <div className="sentiment-lineage-tier hot">
            <span className="sentiment-lineage-tier-label">高位龙头</span>
            <span className="sentiment-lineage-tier-range">{highBoards.map(l => `${l.level}板`).join(' / ')}</span>
          </div>
          <div className="sentiment-level-stocks" style={{ padding: '8px 0' }}>
            {highBoards.flatMap(l => l.stocks.map(s => ({ ...s, _level: l.level }))).map(stock => (
              <Tooltip key={stock.ts_code} title={`${stock.ts_code} · ${stock.industry} · 封单比${(stock.fc_ratio * 100).toFixed(1)}%`}>
                <div className="sentiment-stock-chip dragon">
                  <span className="sentiment-stock-name">{stock.name}</span>
                  <span className="sentiment-stock-board">{stock._level}板</span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
      {midBoards.length > 0 && (
        <div className="sentiment-lineage-section">
          <div className="sentiment-lineage-tier warm">
            <span className="sentiment-lineage-tier-label">中位接力</span>
            <span className="sentiment-lineage-tier-range">2板</span>
          </div>
          <div className="sentiment-level-stocks" style={{ padding: '8px 0' }}>
            {midBoards.flatMap(l => l.stocks).map(stock => (
              <Tooltip key={stock.ts_code} title={`${stock.ts_code} · ${stock.industry}`}>
                <div className="sentiment-stock-chip mid"><span className="sentiment-stock-name">{stock.name}</span></div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
      {lowBoards.length > 0 && (
        <div className="sentiment-lineage-section">
          <div className="sentiment-lineage-tier cold">
            <span className="sentiment-lineage-tier-label">首板新面孔</span>
            <span className="sentiment-lineage-tier-range">1板 · {lowBoards[0].stocks.length}只</span>
          </div>
          <div className="sentiment-level-stocks" style={{ padding: '8px 0' }}>
            {lowBoards.flatMap(l => l.stocks).slice(0, 30).map(stock => (
              <Tooltip key={stock.ts_code} title={`${stock.ts_code} · ${stock.industry}`}>
                <div className="sentiment-stock-chip low"><span className="sentiment-stock-name">{stock.name}</span></div>
              </Tooltip>
            ))}
            {lowBoards[0].stocks.length > 30 && (
              <span style={{ fontSize: 11, color: '#5c5c6a', padding: '4px 8px' }}>+{lowBoards[0].stocks.length - 30}只</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Helpers ====================

function fmtDate(d?: string): string {
  if (!d || d.length < 8) return '--'
  return `${d.slice(4, 6)}-${d.slice(6, 8)}`
}

function computeScore(stats: SentimentLadderData['stats']): number {
  let s = 50
  if (stats.highestBoard >= 6) s += 15
  else if (stats.highestBoard >= 4) s += 8
  else if (stats.highestBoard >= 2) s += 2
  else s -= 10

  if (stats.sealRate >= 75) s += 12
  else if (stats.sealRate >= 60) s += 5
  else if (stats.sealRate < 40) s -= 12

  if (stats.promotion1to2 >= 30) s += 10
  else if (stats.promotion1to2 >= 15) s += 3
  else if (stats.promotion1to2 < 10) s -= 8

  const ratio = stats.limitDownCount > 0 ? stats.limitUpCount / stats.limitDownCount : stats.limitUpCount
  if (ratio >= 5) s += 10
  else if (ratio >= 2) s += 5
  else if (ratio < 1) s -= 10

  if (stats.breakRate > 40) s -= 8
  else if (stats.breakRate < 20) s += 5

  return Math.max(0, Math.min(100, s))
}

// ==================== Main Component ====================

export const SentimentLadder: React.FC = () => {
  const [data, setData] = useState<SentimentLadderData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SentimentSubTab>('sentiment')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getSentimentLadder()
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
        <div style={{ fontSize: 14 }}>正在加载情绪天梯数据...</div>
        <div style={{ fontSize: 12, color: '#5c5c6a' }}>需要获取多日涨停数据，请稍候</div>
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
    <div className="sentiment-container">
      {loading && (
        <div style={{
          position: 'fixed', top: 80, right: 20, background: 'rgba(30,30,34,0.95)',
          border: '1px solid #2a2a30', borderRadius: 8, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8, zIndex: 100, fontSize: 12, color: '#8a8a96'
        }}>
          <Spin size="small" />刷新中...
        </div>
      )}

      <div className="sentiment-sub-tabs">
        {(['sentiment', 'ladder', 'position'] as const).map(tab => (
          <button key={tab} className={`sentiment-sub-tab ${subTab === tab ? 'active' : ''}`} onClick={() => setSubTab(tab)}>
            {tab === 'sentiment' ? '情绪指标' : tab === 'ladder' ? '连板身位' : '龙头族谱'}
          </button>
        ))}
      </div>

      {subTab === 'sentiment' && (
        <div className="sentiment-content fade-in">
          <div className="sentiment-stats-row">
            <StatCard label={`高位晋级率 (${Math.max(data.stats.highestBoard - 1, 3)}板+)`} value={data.stats.highBoardPromotionRate} suffix="%" color="#F92855" />
            <StatCard label="1进2 成功率" value={data.stats.promotion1to2} suffix="%" color="#e8e8ec" />
            <StatCard label="炸板率" value={data.stats.breakRate} suffix="%" color="#e8e8ec" />
            <StatCard label="跌停/炸板家数" value={`${data.stats.limitDownCount}`} suffix={` / ${data.stats.breakCount}`} color="#e8e8ec" />
          </div>
          <div className="sentiment-charts-row">
            <PromotionChart trend={data.trend} />
            <MoneyEffectChart trend={data.trend} />
          </div>
          <SentimentSummary data={data} />
        </div>
      )}

      {subTab === 'ladder' && (
        <div className="sentiment-content fade-in">
          <div className="sentiment-stats-row">
            <StatCard label="涨停家数" value={data.stats.limitUpCount} suffix="家" color="#F92855" />
            <StatCard label="跌停家数" value={data.stats.limitDownCount} suffix="家" color="#2DC08E" />
            <StatCard label="最高板" value={data.stats.highestBoard} suffix="板" color="#f59e0b" />
            <StatCard label="封板率" value={data.stats.sealRate} suffix="%" color="#3b82f6" />
          </div>
          <LadderTable ladder={data.ladder} />
        </div>
      )}

      {subTab === 'position' && (
        <div className="sentiment-content fade-in">
          <DragonLineage data={data} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', fontSize: 11, color: '#5c5c6a' }}>
        <span>数据日期: {data.date ? `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}` : '--'}</span>
        <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={fetchData} style={{ color: '#5c5c6a', fontSize: 11 }}>刷新</Button>
      </div>
    </div>
  )
}
