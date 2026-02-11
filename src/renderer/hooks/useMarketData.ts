import { useState, useCallback, useRef } from 'react'
import type { MarketOverview, SentimentScore } from '../../shared/types'
import { computeSentiment } from '../analysis/sentimentEngine'

// ==================== Cache ====================

interface MarketCacheEntry {
  data: MarketOverview
  sentiment: SentimentScore
  timestamp: number
}

let marketDataCache: MarketCacheEntry | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached(): MarketCacheEntry | null {
  if (!marketDataCache) return null
  if (Date.now() - marketDataCache.timestamp > CACHE_TTL) {
    marketDataCache = null
    return null
  }
  return marketDataCache
}

// ==================== Hook ====================

export interface UseMarketDataReturn {
  data: MarketOverview | null
  sentiment: SentimentScore | null
  loading: boolean
  error: string | null
  lastUpdated: number | null
  fromCache: boolean
  fetchData: (forceRefresh?: boolean) => Promise<void>
}

export function useMarketData(): UseMarketDataReturn {
  const [data, setData] = useState<MarketOverview | null>(null)
  const [sentiment, setSentiment] = useState<SentimentScore | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const fetchingRef = useRef(false)

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Prevent duplicate fetches
    if (fetchingRef.current) return

    // Check cache first
    if (!forceRefresh) {
      const cached = getCached()
      if (cached) {
        setData(cached.data)
        setSentiment(cached.sentiment)
        setError(null)
        setFromCache(true)
        setLastUpdated(cached.timestamp)
        return
      }
    }

    fetchingRef.current = true
    setLoading(true)
    setError(null)
    setFromCache(false)

    try {
      const result = await window.api.getMarketOverview()
      if (result.success && result.data) {
        const overview = result.data
        const score = computeSentiment(overview)

        // Cache it
        marketDataCache = {
          data: overview,
          sentiment: score,
          timestamp: Date.now()
        }

        setData(overview)
        setSentiment(score)
        setLastUpdated(Date.now())
      } else {
        setError(result.error || '获取市场数据失败')
      }
    } catch (e: any) {
      setError(e.message || '未知错误')
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  return { data, sentiment, loading, error, lastUpdated, fromCache, fetchData }
}
