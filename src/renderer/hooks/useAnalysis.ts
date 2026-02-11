import { useMemo } from 'react'
import type { KLineData, AnalysisResult } from '../../shared/types'
import { runAnalysis } from '../analysis/signalEngine'

export function useAnalysis(data: KLineData[]): AnalysisResult | null {
  return useMemo(() => {
    if (!data || data.length < 60) return null
    try {
      return runAnalysis(data)
    } catch (e) {
      console.error('Analysis error:', e)
      return null
    }
  }, [data])
}
