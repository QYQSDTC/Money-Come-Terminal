import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUpOutlined, ArrowDownOutlined, SyncOutlined, TrophyOutlined, FireOutlined } from '@ant-design/icons'
import type { RealtimeStock } from '../../shared/types'

const REFRESH_INTERVAL = 1500 // 1.5 seconds

// Get color based on change percentage
function getChangeColor(value: number): string {
  return value >= 0 ? '#F92855' : '#2DC08E'
}

// Format number with commas
function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN')
}

// Format amount (万元 → 亿/万)
function formatAmount(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '亿'
  }
  return amount.toFixed(0) + '万'
}

// Get score color
function getScoreColor(score: number): string {
  if (score >= 80) return '#ff6b6b'
  if (score >= 60) return '#feca57'
  if (score >= 40) return '#48dbfb'
  return '#a0a0b0'
}

// Get rank icon/text
function getRankStyle(index: number): { bg: string; color: string } {
  if (index === 0) return { bg: '#FFD700', color: '#1a1a1e' } // Gold
  if (index === 1) return { bg: '#C0C0C0', color: '#1a1a1e' } // Silver
  if (index === 2) return { bg: '#CD7F32', color: '#1a1a1e' } // Bronze
  if (index < 10) return { bg: '#3b3b45', color: '#e8e8ec' }
  return { bg: '#2a2a32', color: '#e8e8ec' }
}

// Stock item with position tracking
interface StockItem extends RealtimeStock {
  uniqueId: string
  prevRank?: number
  rankChange?: number // positive = moved up, negative = moved down
}

interface TopStocksViewProps {
  onSelectStock?: (stock: { ts_code: string; name: string }) => void
}

export const TopStocksView: React.FC<TopStocksViewProps> = ({ onSelectStock }) => {
  const [stocks, setStocks] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [selectedStock, setSelectedStock] = useState<RealtimeStock | null>(null)
  const [isVisible, setIsVisible] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isActiveRef = useRef(true)
  const mountedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevPositionsRef = useRef<Map<string, DOMRect>>(new Map())
  const consecutiveErrorsRef = useRef(0)

  // Fetch top stocks with smooth transition
  const fetchTopStocks = useCallback(async (isManual = false) => {
    // Don't fetch if component not ready
    if (!mountedRef.current) {
      console.log('[TopStocks] Skipped: component not mounted')
      return
    }
    
    // Don't auto-fetch when hidden (but allow manual refresh)
    if (!isVisible && !isManual) {
      console.log('[TopStocks] Skipped: tab not visible')
      return
    }
    
    console.log('[TopStocks] Fetching data...')
    
    // Capture current positions before update (FLIP - First)
    if (stocks.length > 0) {
      itemRefs.current.forEach((el, tsCode) => {
        const rect = el?.getBoundingClientRect()
        if (rect) {
          prevPositionsRef.current.set(tsCode, rect)
        }
      })
    }

    try {
      setLoading(true)
      const result = await window.api.getRealtimeTopStocks(50)
      
      if (!mountedRef.current) {
        console.log('[TopStocks] Ignored: component unmounted during fetch')
        return
      }
      
      if (result.success && result.data && result.data.length > 0) {
        console.log(`[TopStocks] Got ${result.data.length} stocks`)
        
        setStocks(prevStocks => {
          // Create a map of previous stocks for comparison
          const prevMap = new Map(prevStocks.map((s, idx) => [s.ts_code, { ...s, prevIndex: idx }]))
          
          // Merge new data with existing to maintain uniqueId continuity
          const newStocks: StockItem[] = result.data!.map((stock, newIndex) => {
            const prevStock = prevMap.get(stock.ts_code)
            return {
              ...stock,
              uniqueId: prevStock?.uniqueId || `${stock.ts_code}-${Date.now()}`,
              prevRank: prevStock?.prevIndex,
              rankChange: prevStock ? prevStock.prevIndex! - newIndex : 0
            }
          })
          
          return newStocks
        })
        
        setLastUpdate(new Date())
        setError(null)
        consecutiveErrorsRef.current = 0
      } else {
        console.error('[TopStocks] API error:', result.error)
        // Don't clear stocks on error, just show error message
        setError(result.error || '获取数据失败')
        consecutiveErrorsRef.current++
      }
    } catch (e: any) {
      console.error('[TopStocks] Exception:', e)
      if (mountedRef.current) {
        setError(e.message || '网络错误')
        consecutiveErrorsRef.current++
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [isVisible, stocks.length])

  // Apply FLIP animation after render
  useEffect(() => {
    if (stocks.length === 0 || prevPositionsRef.current.size === 0) return

    // FLIP - Last & Invert & Play
    requestAnimationFrame(() => {
      stocks.forEach(stock => {
        const el = itemRefs.current.get(stock.ts_code)
        const prevRect = prevPositionsRef.current.get(stock.ts_code)
        
        if (el && prevRect) {
          const newRect = el.getBoundingClientRect()
          const dy = prevRect.top - newRect.top
          
          if (Math.abs(dy) > 1) {
            // Invert: move element back to old position
            el.style.transform = `translateY(${dy}px)`
            el.style.transition = 'none'
            
            // Play: animate to new position
            requestAnimationFrame(() => {
              el.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)'
              el.style.transform = 'translateY(0)'
            })
          }
        }
      })
      
      // Clear old positions after animation
      setTimeout(() => {
        prevPositionsRef.current.clear()
      }, 400)
    })
  }, [stocks])

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      console.log(`[TopStocks] Visibility changed: ${visible ? 'visible' : 'hidden'}`)
      setIsVisible(visible)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Start/stop auto refresh
  useEffect(() => {
    console.log('[TopStocks] Component mounted')
    mountedRef.current = true
    isActiveRef.current = true
    
    // Initial fetch after a short delay
    const initTimeout = setTimeout(() => {
      if (mountedRef.current) {
        console.log('[TopStocks] Initial fetch')
        fetchTopStocks(true)
      }
    }, 100)
    
    // Setup interval
    const setupInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      intervalRef.current = setInterval(() => {
        if (mountedRef.current && isActiveRef.current) {
          fetchTopStocks()
        }
      }, REFRESH_INTERVAL)
    }
    
    setupInterval()
    
    return () => {
      console.log('[TopStocks] Component unmounted')
      mountedRef.current = false
      isActiveRef.current = false
      clearTimeout(initTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchTopStocks])

  // Re-fetch when becoming visible
  useEffect(() => {
    if (isVisible && mountedRef.current && stocks.length === 0) {
      console.log('[TopStocks] Became visible with no data, fetching...')
      fetchTopStocks(true)
    }
  }, [isVisible, stocks.length, fetchTopStocks])

  // Handle manual refresh
  const handleRefresh = () => {
    console.log('[TopStocks] Manual refresh')
    fetchTopStocks(true)
  }

  // Set item ref for FLIP animation
  const setItemRef = (tsCode: string) => (el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(tsCode, el)
    } else {
      itemRefs.current.delete(tsCode)
    }
  }

  return (
    <div style={styles.container} ref={containerRef}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <FireOutlined style={styles.fireIcon} />
          <h2 style={styles.title}>实时强势榜</h2>
          <span style={styles.subtitle}>Top 50 评分最高个股</span>
        </div>
        <div style={styles.headerRight}>
          {lastUpdate && (
            <span style={styles.updateTime}>
              更新于 {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button 
            style={styles.refreshButton} 
            onClick={handleRefresh}
            disabled={loading}
          >
            <SyncOutlined spin={loading} />
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button onClick={handleRefresh} style={styles.retryButton}>重试</button>
        </div>
      )}

      {/* Debug info */}
      {stocks.length === 0 && !loading && !error && (
        <div style={styles.emptyState}>
          <div style={styles.emptyText}>暂无数据，点击刷新按钮获取</div>
        </div>
      )}

      {/* Stock list */}
      <div style={styles.listContainer}>
        {stocks.map((stock, index) => {
          const rankStyle = getRankStyle(index)
          const isUp = stock.changePct >= 0
          const rankChange = stock.rankChange || 0
          
          return (
            <div 
              key={stock.uniqueId}
              ref={setItemRef(stock.ts_code)}
              style={{
                ...styles.stockCard,
                borderColor: selectedStock?.ts_code === stock.ts_code ? '#4a9eff' : 'transparent',
                zIndex: selectedStock?.ts_code === stock.ts_code ? 10 : 1
              }}
              onClick={() => {
                setSelectedStock(stock)
                onSelectStock?.({ ts_code: stock.ts_code, name: stock.name })
              }}
            >
              {/* Rank badge */}
              <div style={{
                ...styles.rankBadge,
                background: rankStyle.bg,
                color: rankStyle.color
              }}>
                {index < 3 ? (
                  <TrophyOutlined />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>

              {/* Rank change indicator */}
              {rankChange !== 0 && (
                <div style={{
                  ...styles.rankChangeIndicator,
                  color: rankChange > 0 ? '#2DC08E' : '#F92855'
                }}>
                  {rankChange > 0 ? '↑' : '↓'}{Math.abs(rankChange)}
                </div>
              )}

              {/* Stock info */}
              <div style={styles.stockInfo}>
                <div style={styles.stockName}>{stock.name}</div>
                <div style={styles.stockCode}>{stock.ts_code}</div>
              </div>

              {/* Price */}
              <div style={styles.priceSection}>
                <div style={{
                  ...styles.currentPrice,
                  color: isUp ? '#F92855' : '#2DC08E'
                }}>{stock.close.toFixed(2)}</div>
                <div style={{
                  ...styles.changeBadge,
                  background: isUp ? 'rgba(249, 40, 85, 0.15)' : 'rgba(45, 192, 142, 0.15)',
                  color: getChangeColor(stock.changePct)
                }}>
                  {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%
                </div>
              </div>

              {/* Volume */}
              <div style={styles.volumeSection}>
                <div style={styles.volumeLabel}>成交额</div>
                <div style={styles.volumeValue}>{formatAmount(stock.amount)}</div>
              </div>

              {/* Amplitude */}
              <div style={styles.amplitudeSection}>
                <div style={styles.amplitudeLabel}>振幅</div>
                <div style={styles.amplitudeValue}>{stock.amplitude.toFixed(2)}%</div>
              </div>

              {/* Score */}
              <div style={styles.scoreSection}>
                <div style={styles.scoreLabel}>评分</div>
                <div style={{
                  ...styles.scoreValue,
                  color: getScoreColor(stock.score)
                }}>
                  {stock.score}
                </div>
              </div>

              {/* Score bar */}
              <div style={styles.scoreBarContainer}>
                <div style={{
                  ...styles.scoreBar,
                  width: `${stock.score}%`,
                  background: getScoreColor(stock.score)
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      {selectedStock && (
        <div style={styles.detailPanel}>
          <div style={styles.detailHeader}>
            <h3>{selectedStock.name} <span style={styles.detailCode}>{selectedStock.ts_code}</span></h3>
            <button style={styles.closeButton} onClick={() => setSelectedStock(null)}>×</button>
          </div>
          <div style={styles.detailGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>开盘价</span>
              <span style={styles.detailValue}>{selectedStock.open.toFixed(2)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>最高价</span>
              <span style={{...styles.detailValue, color: '#F92855'}}>{selectedStock.high.toFixed(2)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>最低价</span>
              <span style={{...styles.detailValue, color: '#2DC08E'}}>{selectedStock.low.toFixed(2)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>昨收</span>
              <span style={styles.detailValue}>{selectedStock.pre_close.toFixed(2)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>涨跌额</span>
              <span style={{...styles.detailValue, color: getChangeColor(selectedStock.change)}}>
                {selectedStock.change >= 0 ? '+' : ''}{selectedStock.change.toFixed(2)}
              </span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>成交量</span>
              <span style={styles.detailValue}>{formatNumber(selectedStock.volume)} 手</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>成交额</span>
              <span style={styles.detailValue}>{formatAmount(selectedStock.amount)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>综合评分</span>
              <span style={{...styles.detailValue, color: getScoreColor(selectedStock.score), fontWeight: 'bold'}}>
                {selectedStock.score} 分
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    background: '#0d0d0f',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #222226',
    background: '#151519',
    flexShrink: 0
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  fireIcon: {
    fontSize: '24px',
    color: '#ff6b6b'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: '#e8e8ec'
  },
  subtitle: {
    fontSize: '13px',
    color: '#707080',
    marginLeft: '8px'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  updateTime: {
    fontSize: '12px',
    color: '#505060'
  },
  refreshButton: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: '1px solid #2a2a32',
    background: '#1a1a1e',
    color: '#a0a0b0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    transition: 'all 0.2s'
  },
  errorBanner: {
    padding: '12px 20px',
    background: 'rgba(249, 40, 85, 0.1)',
    color: '#F92855',
    fontSize: '14px',
    textAlign: 'center' as const,
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px'
  },
  retryButton: {
    padding: '4px 12px',
    background: '#F92855',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#505060'
  },
  emptyText: {
    fontSize: '14px'
  },
  listContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    position: 'relative'
  },
  stockCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    marginBottom: '8px',
    background: '#151519',
    borderRadius: '10px',
    border: '1px solid transparent',
    cursor: 'pointer',
    gap: '12px',
    position: 'relative',
    willChange: 'transform'
  },
  rankBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    flexShrink: 0
  },
  rankChangeIndicator: {
    position: 'absolute' as const,
    left: '4px',
    top: '4px',
    fontSize: '9px',
    fontWeight: 'bold',
    padding: '1px 3px',
    borderRadius: '3px',
    background: 'rgba(0,0,0,0.5)'
  },
  stockInfo: {
    width: '100px',
    flexShrink: 0
  },
  stockName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#e8e8ec',
    marginBottom: '2px'
  },
  stockCode: {
    fontSize: '11px',
    color: '#505060'
  },
  priceSection: {
    width: '90px',
    textAlign: 'right' as const,
    flexShrink: 0
  },
  currentPrice: {
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: '"SF Mono", monospace',
    marginBottom: '4px'
  },
  changeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500
  },
  volumeSection: {
    width: '80px',
    textAlign: 'right' as const,
    flexShrink: 0
  },
  volumeLabel: {
    fontSize: '10px',
    color: '#505060',
    marginBottom: '2px'
  },
  volumeValue: {
    fontSize: '12px',
    color: '#a0a0b0',
    fontFamily: '"SF Mono", monospace'
  },
  amplitudeSection: {
    width: '60px',
    textAlign: 'right' as const,
    flexShrink: 0
  },
  amplitudeLabel: {
    fontSize: '10px',
    color: '#505060',
    marginBottom: '2px'
  },
  amplitudeValue: {
    fontSize: '12px',
    color: '#feca57',
    fontFamily: '"SF Mono", monospace'
  },
  scoreSection: {
    width: '50px',
    textAlign: 'right' as const,
    flexShrink: 0
  },
  scoreLabel: {
    fontSize: '10px',
    color: '#505060',
    marginBottom: '2px'
  },
  scoreValue: {
    fontSize: '16px',
    fontWeight: 'bold',
    fontFamily: '"SF Mono", monospace'
  },
  scoreBarContainer: {
    width: '50px',
    height: '4px',
    background: '#2a2a32',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  scoreBar: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.5s ease'
  },
  detailPanel: {
    position: 'absolute' as const,
    right: '20px',
    bottom: '20px',
    width: '300px',
    background: '#1a1a1e',
    borderRadius: '12px',
    border: '1px solid #2a2a32',
    padding: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 100
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #2a2a32'
  },
  detailCode: {
    fontSize: '13px',
    color: '#505060',
    fontWeight: 'normal'
  },
  closeButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: '#2a2a32',
    color: '#a0a0b0',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px'
  },
  detailLabel: {
    fontSize: '11px',
    color: '#505060'
  },
  detailValue: {
    fontSize: '14px',
    color: '#e8e8ec',
    fontFamily: '"SF Mono", monospace'
  }
}
