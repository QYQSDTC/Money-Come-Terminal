import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ConfigProvider,
  theme,
  message,
  Button,
  Typography,
  Space,
  Tooltip
} from 'antd'
import {
  SettingOutlined,
  ReloadOutlined,
  LineChartOutlined,
  CloudOutlined,
  DatabaseOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  DashboardOutlined,
  StockOutlined
} from '@ant-design/icons'
import { ErrorBoundary } from './components/ErrorBoundary'
import { StockSearch } from './components/StockSearch'
import { TimeframeSelector } from './components/TimeframeSelector'
import { KLineView } from './components/KLineView'
import { SignalDashboard } from './components/SignalDashboard'
import { TradePlan } from './components/TradePlan'
import { TokenSettings } from './components/TokenSettings'
import { StockAIAnalysis } from './components/StockAIAnalysis'
import { MarketDashboard } from './components/market/MarketDashboard'
import { useStockData } from './hooks/useStockData'
import { useAnalysis } from './hooks/useAnalysis'
import type { Timeframe, StockInfo, ActiveView } from '../shared/types'
import type { ErrorType } from './hooks/useStockData'

const { Text } = Typography

// ==================== API availability check ====================

const isApiAvailable = typeof window !== 'undefined' && window.api !== undefined

// ==================== Dark Theme Config ====================

const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    colorBgContainer: '#161618',
    colorBgElevated: '#1e1e22',
    colorBorder: '#2a2a30',
    colorText: '#e8e8ec',
    colorTextSecondary: '#8a8a96',
    borderRadius: 6,
    fontSize: 13
  }
}

// ==================== Error Icon Map ====================

const errorIcons: Record<ErrorType, React.ReactNode> = {
  network: <CloudOutlined style={{ fontSize: 40, color: '#8a8a96' }} />,
  auth: <WarningOutlined style={{ fontSize: 40, color: '#f59e0b' }} />,
  permission: <ExclamationCircleOutlined style={{ fontSize: 40, color: '#f59e0b' }} />,
  nodata: <DatabaseOutlined style={{ fontSize: 40, color: '#8a8a96' }} />,
  api: <CloudOutlined style={{ fontSize: 40, color: '#F92855' }} />,
  unknown: <ExclamationCircleOutlined style={{ fontSize: 40, color: '#F92855' }} />
}

// ==================== Helper: format time ====================

function formatTime(ts: number | null): string {
  if (!ts) return '--'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatPriceChange(current: number, prev: number): { text: string; pct: string; isUp: boolean } {
  const diff = current - prev
  const pct = prev !== 0 ? (diff / prev) * 100 : 0
  const isUp = diff >= 0
  return {
    text: `${isUp ? '+' : ''}${diff.toFixed(2)}`,
    pct: `${isUp ? '+' : ''}${pct.toFixed(2)}%`,
    isUp
  }
}

// ==================== Skeleton Components ====================

function ChartSkeleton() {
  return (
    <div className="empty-state">
      <div style={{ width: '80%', maxWidth: 600, padding: '0 20px' }}>
        {/* Fake candlestick bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, justifyContent: 'center' }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                width: 8,
                height: `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 60}px`,
                animationDelay: `${i * 30}ms`,
                borderRadius: 2,
                opacity: 0.5
              }}
            />
          ))}
        </div>
        <div className="skeleton skeleton-text" style={{ width: '100%', marginTop: 16 }} />
        <div className="skeleton skeleton-text" style={{ width: '60%' }} />
      </div>
    </div>
  )
}

function SignalSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-text" style={{ width: '80%' }} />
          <div className="skeleton skeleton-text" style={{ width: '60%' }} />
          <div className="skeleton skeleton-text" style={{ width: '90%' }} />
        </div>
      ))}
    </div>
  )
}

// ==================== API Unavailable Screen ====================

function ApiUnavailableScreen() {
  return (
    <div className="empty-state" style={{ gap: 8 }}>
      <ExclamationCircleOutlined style={{ fontSize: 48, color: '#f59e0b', opacity: 0.6 }} />
      <div className="empty-state-title" style={{ marginTop: 12 }}>Preload 脚本未加载</div>
      <div className="empty-state-hint" style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.8 }}>
        window.api 不可用，这通常是因为 Electron preload 脚本未正确加载。
        <br />
        请检查终端日志中是否有 preload 相关错误，或尝试重新启动应用。
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 16,
          padding: '8px 24px',
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          cursor: 'pointer'
        }}
      >
        重新加载
      </button>
    </div>
  )
}

// ==================== Main App Component ====================

type SignalTab = 'technical' | 'ai'

function AppContent() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [selectedStock, setSelectedStock] = useState<StockInfo | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('daily')
  const [tokenModalVisible, setTokenModalVisible] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [signalTab, setSignalTab] = useState<SignalTab>('technical')
  const searchRef = useRef<{ focus: () => void }>(null)

  const { data, loading, error, lastUpdated, fromCache, fetchData, clearCache } = useStockData()
  const analysis = useAnalysis(data)

  // Check token on mount
  useEffect(() => {
    if (!isApiAvailable) return
    const checkToken = async () => {
      try {
        const token = await window.api.getToken()
        if (!token) {
          setTokenModalVisible(true)
        } else {
          setHasToken(true)
        }
      } catch (e) {
        console.error('[App] Failed to check token:', e)
      }
    }
    checkToken()
  }, [])

  // Fetch data when stock or timeframe changes
  useEffect(() => {
    if (selectedStock && hasToken) {
      fetchData(selectedStock.ts_code, timeframe)
    }
  }, [selectedStock, timeframe, hasToken])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + R: Refresh
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault()
        handleRefresh()
      }
      // Cmd/Ctrl + K or Cmd/Ctrl + F: Focus search
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      // 1-6: Quick timeframe switch
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const tfMap: Record<string, Timeframe> = {
          '1': '1min', '2': '5min', '3': '15min',
          '4': '30min', '5': '60min', '6': 'daily'
        }
        // Only if not typing in an input
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tfMap[e.key]) {
          setTimeframe(tfMap[e.key])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStock, hasToken, timeframe])

  const handleStockSelect = useCallback((stock: StockInfo) => {
    setSelectedStock(stock)
    setActiveView('stock')
    if (isApiAvailable) {
      window.api.addRecentStock(stock.ts_code)
    }
  }, [])

  const handleTokenSaved = useCallback(() => {
    setHasToken(true)
    setTokenModalVisible(false)
    clearCache()
    message.success('Token 已保存，可以开始使用')
  }, [clearCache])

  const handleRefresh = useCallback(() => {
    if (selectedStock && hasToken) {
      fetchData(selectedStock.ts_code, timeframe, true)
    }
  }, [selectedStock, hasToken, timeframe, fetchData])

  // Calculate price change
  const priceChange = data.length >= 2
    ? formatPriceChange(data[data.length - 1].close, data[data.length - 2].close)
    : null

  const lastPrice = data.length > 0 ? data[data.length - 1] : null
  const isUp = lastPrice ? lastPrice.close >= lastPrice.open : true

  // If API is not available, show diagnostic screen
  if (!isApiAvailable) {
    return <ApiUnavailableScreen />
  }

  return (
    <>
      {/* ==================== Header ==================== */}
      <div className="app-header app-header-bar">
        <Space size="middle" align="center">
          {/* View Tabs */}
          <div className="view-tabs no-drag">
            <button
              className={`view-tab ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              <DashboardOutlined style={{ marginRight: 4 }} />
              市场总览
            </button>
            <button
              className={`view-tab ${activeView === 'stock' ? 'active' : ''}`}
              onClick={() => setActiveView('stock')}
            >
              <StockOutlined style={{ marginRight: 4 }} />
              个股分析
            </button>
          </div>

          <StockSearch ref={searchRef} onSelect={handleStockSelect} tokenReady={hasToken} />

          {activeView === 'stock' && selectedStock && (
            <Space size={8} className="fade-in">
              <Text strong style={{ fontSize: 15, color: '#e8e8ec' }}>
                {selectedStock.name}
              </Text>
              <Text style={{ fontSize: 12, color: '#5c5c6a' }}>
                {selectedStock.ts_code}
              </Text>
              {lastPrice && (
                <>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isUp ? '#F92855' : '#2DC08E',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {lastPrice.close.toFixed(2)}
                  </Text>
                  {priceChange && (
                    <span className={`price-badge ${priceChange.isUp ? 'up' : 'down'}`}>
                      {priceChange.text} ({priceChange.pct})
                    </span>
                  )}
                </>
              )}
            </Space>
          )}
        </Space>

        <Space size={4}>
          {activeView === 'stock' && (
            <Tooltip title="刷新数据 (⌘R)" mouseEnterDelay={0.5}>
              <Button
                type="text"
                icon={<ReloadOutlined spin={loading} />}
                onClick={handleRefresh}
                disabled={!selectedStock || loading}
                style={{ color: '#8a8a96' }}
              />
            </Tooltip>
          )}
          <Tooltip title="Token 设置" mouseEnterDelay={0.5}>
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => setTokenModalVisible(true)}
              style={{ color: '#8a8a96' }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* ==================== Dashboard View ==================== */}
      {activeView === 'dashboard' && (
        <MarketDashboard />
      )}

      {/* ==================== Stock View ==================== */}
      {activeView === 'stock' && (
        <>
          {/* Timeframe Bar */}
          <div className="timeframe-bar">
            <TimeframeSelector value={timeframe} onChange={setTimeframe} />
            {fromCache && (
              <Text style={{ fontSize: 11, color: '#5c5c6a' }}>
                <DatabaseOutlined style={{ marginRight: 4 }} />
                缓存数据
              </Text>
            )}
          </div>

          {/* Main Content */}
          <div className="main-content">
            {/* Chart area - 75% */}
            <div className="chart-area">
              {/* Loading overlay */}
              {loading && (
                <div className="loading-overlay">
                  <div className="loading-spinner" />
                  <span className="loading-text">
                    正在获取数据{loading ? '...' : ''}
                  </span>
                </div>
              )}

              {/* Error state */}
              {error && !loading && (
                <div className="error-overlay">
                  <div className="error-card">
                    <div className="error-icon">
                      {errorIcons[error.type]}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#e8e8ec' }}>
                      {error.message}
                    </div>
                    <div className="error-message">
                      {error.detail}
                    </div>
                    {error.retryable && (
                      <Button
                        type="primary"
                        onClick={handleRefresh}
                        style={{ borderRadius: 8 }}
                      >
                        重新加载
                      </Button>
                    )}
                    {error.type === 'auth' && (
                      <Button
                        type="primary"
                        onClick={() => setTokenModalVisible(true)}
                        style={{ borderRadius: 8 }}
                      >
                        配置 Token
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!selectedStock && !loading && !error && (
                <div className="empty-state">
                  {hasToken ? (
                    <>
                      <LineChartOutlined className="empty-state-icon" />
                      <div className="empty-state-title">开始技术分析</div>
                      <div className="empty-state-hint">
                        在搜索栏输入股票代码或名称，按
                        <span className="empty-state-kbd">⌘K</span>
                        快速聚焦搜索
                      </div>
                    </>
                  ) : (
                    <>
                      <SettingOutlined className="empty-state-icon" />
                      <div className="empty-state-title">请先配置 Tushare Token</div>
                      <div className="empty-state-hint">
                        点击右上角设置图标配置您的 API Token
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Skeleton while loading first time */}
              {selectedStock && loading && data.length === 0 && (
                <ChartSkeleton />
              )}

              {/* Chart */}
              {data.length > 0 && <KLineView data={data} analysis={analysis} />}
            </div>

            {/* Signal panel */}
            <div className="signal-panel">
              {/* Tabs */}
              <div className="signal-panel-tabs">
                <button
                  className={`signal-panel-tab ${signalTab === 'technical' ? 'active' : ''}`}
                  onClick={() => setSignalTab('technical')}
                >
                  技术分析
                </button>
                <button
                  className={`signal-panel-tab ${signalTab === 'ai' ? 'active' : ''}`}
                  onClick={() => setSignalTab('ai')}
                >
                  AI 分析
                </button>
              </div>

              {/* Tab content */}
              <div className="signal-panel-content">
                {loading && data.length === 0 ? (
                  <SignalSkeleton />
                ) : signalTab === 'technical' ? (
                  <>
                    <SignalDashboard analysis={analysis} />
                    <TradePlan analysis={analysis} />
                  </>
                ) : (
                  <StockAIAnalysis stock={selectedStock} data={data} analysis={analysis} />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== Status Bar ==================== */}
      <div className="status-bar">
        <div className="status-bar-left">
          <span>
            <span className={`status-dot ${loading ? 'loading' : hasToken ? 'online' : 'offline'}`} />
            {loading ? '数据加载中' : hasToken ? 'Tushare 已连接' : '未配置'}
          </span>
          {activeView === 'stock' && selectedStock && (
            <span style={{ color: '#5c5c6a' }}>
              {selectedStock.ts_code} · {selectedStock.name}
            </span>
          )}
          {activeView === 'dashboard' && (
            <span style={{ color: '#5c5c6a' }}>市场总览</span>
          )}
        </div>
        <div className="status-bar-right">
          {activeView === 'stock' && data.length > 0 && (
            <span>{data.length} 根K线</span>
          )}
          {activeView === 'stock' && lastUpdated && (
            <span>更新于 {formatTime(lastUpdated)}</span>
          )}
          <span style={{ opacity: 0.5 }}>
            <SearchOutlined style={{ marginRight: 2 }} />
            ⌘K
          </span>
        </div>
      </div>

      {/* ==================== Token Modal ==================== */}
      <TokenSettings
        visible={tokenModalVisible}
        onClose={() => setTokenModalVisible(false)}
        onSave={handleTokenSaved}
      />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider theme={darkTheme}>
        <AppContent />
      </ConfigProvider>
    </ErrorBoundary>
  )
}
