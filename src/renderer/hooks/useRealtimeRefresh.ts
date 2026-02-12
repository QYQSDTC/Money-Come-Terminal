import { useState, useEffect, useRef, useCallback } from 'react'
import type { KLineData } from '../../shared/types'

// ==================== Trading Hours Detection ====================

/**
 * Check if current time is within A-share trading hours (Beijing time, UTC+8).
 * Morning session:   9:25 – 11:31
 * Afternoon session: 12:59 – 15:01
 * Weekdays only (Mon–Fri). Holidays are not checked — API will return stale data gracefully.
 */
export function isTradingTime(): boolean {
  const now = new Date()

  // Convert to Beijing time (UTC+8)
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const beijing = new Date(utcMs + 8 * 3600_000)

  const day = beijing.getDay()
  if (day === 0 || day === 6) return false // weekend

  const hh = beijing.getHours()
  const mm = beijing.getMinutes()
  const timeMinutes = hh * 60 + mm

  // Morning: 9:25 (565) – 11:31 (691)
  if (timeMinutes >= 565 && timeMinutes <= 691) return true
  // Afternoon: 12:59 (779) – 15:01 (901)
  if (timeMinutes >= 779 && timeMinutes <= 901) return true

  return false
}

// ==================== Hook ====================

interface UseRealtimeRefreshOptions {
  tsCode: string | null
  enabled: boolean  // should be true only when activeView=stock, timeframe=daily, stock selected
}

interface UseRealtimeRefreshReturn {
  realtimeBar: KLineData | null
  isTrading: boolean
}

export function useRealtimeRefresh({
  tsCode,
  enabled
}: UseRealtimeRefreshOptions): UseRealtimeRefreshReturn {
  const [realtimeBar, setRealtimeBar] = useState<KLineData | null>(null)
  const [isTrading, setIsTrading] = useState(false)
  const isFetchingRef = useRef(false)
  const tsCodeRef = useRef(tsCode)

  // Keep tsCode ref in sync
  useEffect(() => {
    tsCodeRef.current = tsCode
  }, [tsCode])

  // Clear realtime bar when stock changes
  useEffect(() => {
    setRealtimeBar(null)
  }, [tsCode])

  // Main polling interval
  useEffect(() => {
    if (!enabled || !tsCode) {
      setIsTrading(false)
      return
    }

    const tick = async () => {
      const trading = isTradingTime()
      setIsTrading(trading)

      if (!trading) return
      if (isFetchingRef.current) return // skip if previous request still in-flight
      if (!tsCodeRef.current) return

      isFetchingRef.current = true
      try {
        const result = await window.api.refreshRealtimeBar(tsCodeRef.current)
        // Only update if we're still looking at the same stock
        if (result.success && result.data && tsCodeRef.current === tsCode) {
          setRealtimeBar(result.data)
        }
      } catch {
        // Silently ignore errors; continue polling next tick
      } finally {
        isFetchingRef.current = false
      }
    }

    // Run immediately on mount
    tick()

    const intervalId = setInterval(tick, 1000)

    return () => {
      clearInterval(intervalId)
      isFetchingRef.current = false
    }
  }, [enabled, tsCode])

  return { realtimeBar, isTrading }
}
