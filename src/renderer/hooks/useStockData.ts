import { useState, useCallback, useRef } from 'react'
import type { KLineData, Timeframe } from '../../shared/types'

// ==================== In-Memory Cache ====================

interface CacheEntry {
  data: KLineData[]
  timestamp: number
  ttl: number
}

const dataCache = new Map<string, CacheEntry>()
const inflightRequests = new Map<string, Promise<KLineData[]>>()

function getCacheKey(tsCode: string, timeframe: Timeframe): string {
  return `${tsCode}:${timeframe}`
}

function getCacheTTL(timeframe: Timeframe): number {
  // Daily data: cache for 10 minutes
  // Minute data: cache for 2 minutes
  return timeframe === 'daily' ? 10 * 60 * 1000 : 2 * 60 * 1000
}

function getCachedData(key: string): KLineData[] | null {
  const entry = dataCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    dataCache.delete(key)
    return null
  }
  return entry.data
}

function setCachedData(key: string, data: KLineData[], timeframe: Timeframe): void {
  dataCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: getCacheTTL(timeframe)
  })

  // Evict old entries if cache grows too large (keep max 50 entries)
  if (dataCache.size > 50) {
    const oldest = Array.from(dataCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 10; i++) {
      dataCache.delete(oldest[i][0])
    }
  }
}

// ==================== Error Classification ====================

export type ErrorType = 'network' | 'auth' | 'permission' | 'nodata' | 'api' | 'unknown'

interface ClassifiedError {
  type: ErrorType
  message: string
  detail?: string
  retryable: boolean
}

function classifyError(rawError: string): ClassifiedError {
  const lower = rawError.toLowerCase()

  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('fetch')) {
    return {
      type: 'network',
      message: '网络连接异常',
      detail: '无法连接到 Tushare 服务器，请检查网络后重试',
      retryable: true
    }
  }

  if (lower.includes('token') || lower.includes('认证') || lower.includes('auth')) {
    return {
      type: 'auth',
      message: 'Token 验证失败',
      detail: '请检查 Tushare Token 是否正确',
      retryable: false
    }
  }

  if (lower.includes('权限') || lower.includes('permission') || lower.includes('积分')) {
    return {
      type: 'permission',
      message: '接口权限不足',
      detail: '日线数据需要 2000+ 积分，分钟级数据需单独开通，请前往 tushare.pro 了解详情',
      retryable: false
    }
  }

  if (lower.includes('无数据') || lower.includes('no data') || lower.includes('empty')) {
    return {
      type: 'nodata',
      message: '暂无数据',
      detail: '该股票当前周期暂无数据，请尝试切换其他周期',
      retryable: false
    }
  }

  if (lower.includes('api') || lower.includes('tushare')) {
    return {
      type: 'api',
      message: 'API 请求异常',
      detail: rawError,
      retryable: true
    }
  }

  return {
    type: 'unknown',
    message: '未知错误',
    detail: rawError,
    retryable: true
  }
}

// ==================== Hook ====================

export interface UseStockDataReturn {
  data: KLineData[]
  loading: boolean
  error: ClassifiedError | null
  lastUpdated: number | null
  fromCache: boolean
  fetchData: (tsCode: string, timeframe: Timeframe, forceRefresh?: boolean) => Promise<void>
  clearCache: () => void
}

const MAX_RETRIES = 2
const RETRY_DELAYS = [1000, 3000] // exponential backoff

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useStockData(): UseStockDataReturn {
  const [data, setData] = useState<KLineData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ClassifiedError | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const abortRef = useRef<boolean>(false)

  const fetchData = useCallback(
    async (tsCode: string, timeframe: Timeframe, forceRefresh = false) => {
      const cacheKey = getCacheKey(tsCode, timeframe)

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey)
        if (cached) {
          setData(cached)
          setError(null)
          setFromCache(true)
          setLastUpdated(dataCache.get(cacheKey)!.timestamp)
          return
        }
      }

      // Deduplicate in-flight requests
      const inflight = inflightRequests.get(cacheKey)
      if (inflight && !forceRefresh) {
        try {
          const result = await inflight
          setData(result)
          setError(null)
          setFromCache(false)
          setLastUpdated(Date.now())
          return
        } catch {
          // Fall through to make a new request
        }
      }

      setLoading(true)
      setError(null)
      setFromCache(false)
      abortRef.current = false

      const fetchWithRetry = async (): Promise<KLineData[]> => {
        let lastError = ''

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (abortRef.current) throw new Error('已取消')

          try {
            const result = await window.api.getKLineData(tsCode, timeframe)
            if (result.success && result.data) {
              return result.data
            }
            lastError = result.error || '获取数据失败'

            // Don't retry non-retryable errors
            const classified = classifyError(lastError)
            if (!classified.retryable) {
              throw new Error(lastError)
            }
          } catch (e: any) {
            lastError = e.message || '未知错误'
            const classified = classifyError(lastError)
            if (!classified.retryable) throw e
          }

          // Wait before retry (skip wait on last attempt)
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAYS[attempt])
          }
        }

        throw new Error(lastError)
      }

      const promise = fetchWithRetry()
      inflightRequests.set(cacheKey, promise)

      try {
        const result = await promise
        if (!abortRef.current) {
          setCachedData(cacheKey, result, timeframe)
          setData(result)
          setLastUpdated(Date.now())
        }
      } catch (e: any) {
        if (!abortRef.current) {
          setError(classifyError(e.message || '未知错误'))
          setData([])
        }
      } finally {
        inflightRequests.delete(cacheKey)
        if (!abortRef.current) {
          setLoading(false)
        }
      }
    },
    []
  )

  const clearCache = useCallback(() => {
    dataCache.clear()
  }, [])

  return { data, loading, error, lastUpdated, fromCache, fetchData, clearCache }
}
