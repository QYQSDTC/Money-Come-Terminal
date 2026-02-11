import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { AutoComplete, Input, Spin, message } from 'antd'
import { SearchOutlined, LoadingOutlined } from '@ant-design/icons'
import type { StockInfo } from '../../shared/types'

interface StockSearchProps {
  onSelect: (stock: StockInfo) => void
  tokenReady: boolean
}

export interface StockSearchRef {
  focus: () => void
}

export const StockSearch = forwardRef<StockSearchRef, StockSearchProps>(({ onSelect, tokenReady }, ref) => {
  const [options, setOptions] = useState<{ value: string; label: React.ReactNode; stock: StockInfo }[]>([])
  const [stockListLoaded, setStockListLoaded] = useState(false)
  const [stockListLoading, setStockListLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<any>(null)
  const loadAttempted = useRef(false)

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
    }
  }))

  // Load stock list when token becomes ready
  useEffect(() => {
    if (!tokenReady) return
    if (stockListLoaded) return // Already loaded

    const load = async () => {
      setStockListLoading(true)
      setLoadError(null)
      try {
        const result = await window.api.loadStockList()
        if (result.success) {
          setStockListLoaded(true)
          setLoadError(null)
          if (!loadAttempted.current) {
            // Don't show success message on initial load
            loadAttempted.current = true
          }
        } else {
          setLoadError(result.error || '加载失败')
          console.error('[StockSearch] Load stock list failed:', result.error)
          if (loadAttempted.current) {
            message.error('股票列表加载失败: ' + (result.error || '未知错误'))
          }
          loadAttempted.current = true
        }
      } catch (e: any) {
        setLoadError(e.message || '加载异常')
        console.error('[StockSearch] Load stock list error:', e)
        loadAttempted.current = true
      } finally {
        setStockListLoading(false)
      }
    }
    load()
  }, [tokenReady, stockListLoaded])

  // Retry loading stock list
  const handleRetry = useCallback(async () => {
    setStockListLoaded(false) // triggers useEffect above
  }, [])

  const handleSearch = useCallback(
    (value: string) => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current)
      }

      if (!stockListLoaded || !value.trim()) {
        setOptions([])
        setSearching(false)
        return
      }

      setSearching(true)

      searchTimeout.current = setTimeout(async () => {
        try {
          const results = await window.api.searchStocks(value)
          const opts = results.map((stock) => ({
            value: stock.ts_code,
            label: (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '2px 0'
                }}
              >
                <span>
                  <span style={{ color: '#3b82f6', fontWeight: 600, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>
                    {stock.symbol}
                  </span>
                  <span style={{ color: '#e8e8ec' }}>{stock.name}</span>
                </span>
                <span style={{ color: '#5c5c6a', fontSize: 11 }}>{stock.industry || ''}</span>
              </div>
            ),
            stock
          }))
          setOptions(opts)
        } catch (e) {
          console.error('[StockSearch] Search error:', e)
          setOptions([])
        } finally {
          setSearching(false)
        }
      }, 150)
    },
    [stockListLoaded]
  )

  const handleSelect = useCallback(
    (_value: string, option: any) => {
      if (option.stock) {
        onSelect(option.stock)
      }
    },
    [onSelect]
  )

  const placeholder = stockListLoading
    ? '正在加载股票列表...'
    : !tokenReady
      ? '请先配置 Tushare Token'
      : loadError
        ? '加载失败，点击重试'
        : stockListLoaded
          ? '搜索股票代码或名称 (⌘K)'
          : '准备中...'

  const suffix = stockListLoading ? (
    <Spin indicator={<LoadingOutlined style={{ fontSize: 14, color: '#5c5c6a' }} />} />
  ) : searching ? (
    <Spin indicator={<LoadingOutlined style={{ fontSize: 14, color: '#3b82f6' }} />} />
  ) : null

  return (
    <AutoComplete
      options={options}
      onSearch={handleSearch}
      onSelect={handleSelect}
      style={{ width: 360 }}
      popupMatchSelectWidth={420}
      notFoundContent={
        searching ? (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Spin size="small" />
          </div>
        ) : null
      }
    >
      <Input
        ref={inputRef}
        prefix={<SearchOutlined style={{ color: '#5c5c6a' }} />}
        suffix={suffix}
        placeholder={placeholder}
        size="large"
        allowClear
        disabled={stockListLoading || !tokenReady}
        onClick={loadError ? handleRetry : undefined}
        style={{
          background: '#161618',
          borderColor: loadError ? '#f59e0b' : '#2a2a30'
        }}
      />
    </AutoComplete>
  )
})

StockSearch.displayName = 'StockSearch'
