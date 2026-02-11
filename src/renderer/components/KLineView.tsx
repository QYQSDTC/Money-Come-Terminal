import React, { useEffect, useRef } from 'react'
import { init, dispose, LineType, CandleType, TooltipShowRule, TooltipShowType } from 'klinecharts'
import type { Chart } from 'klinecharts'
import type { KLineData, AnalysisResult } from '../../shared/types'

interface KLineViewProps {
  data: KLineData[]
  analysis?: AnalysisResult | null
}

export const KLineView: React.FC<KLineViewProps> = ({ data, analysis }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return

    const chart = init(containerRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: {
            show: true,
            size: 1,
            color: 'rgba(255, 255, 255, 0.04)',
            style: LineType.Dashed
          },
          vertical: {
            show: true,
            size: 1,
            color: 'rgba(255, 255, 255, 0.04)',
            style: LineType.Dashed
          }
        },
        candle: {
          type: CandleType.CandleSolid,
          bar: {
            upColor: '#F92855',
            downColor: '#2DC08E',
            upBorderColor: '#F92855',
            downBorderColor: '#2DC08E',
            upWickColor: '#F92855',
            downWickColor: '#2DC08E',
            noChangeColor: '#6b6b78',
            noChangeBorderColor: '#6b6b78',
            noChangeWickColor: '#6b6b78'
          },
          priceMark: {
            show: true,
            high: {
              show: true,
              color: '#F92855',
              textSize: 10
            },
            low: {
              show: true,
              color: '#2DC08E',
              textSize: 10
            },
            last: {
              show: true,
              upColor: '#F92855',
              downColor: '#2DC08E',
              noChangeColor: '#6b6b78',
              line: {
                show: true,
                style: LineType.Dashed,
                size: 1
              },
              text: {
                show: true,
                size: 11,
                paddingLeft: 4,
                paddingRight: 4,
                paddingTop: 2,
                paddingBottom: 2,
                borderRadius: 2
              }
            }
          },
          tooltip: {
            showRule: TooltipShowRule.Always,
            showType: TooltipShowType.Standard
          }
        },
        indicator: {
          lastValueMark: {
            show: true,
            text: {
              show: true,
              size: 10,
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 2,
              paddingBottom: 2
            }
          },
          tooltip: {
            showRule: TooltipShowRule.Always,
            showType: TooltipShowType.Standard
          }
        },
        xAxis: {
          show: true,
          axisLine: { show: true, color: '#222226', size: 1 },
          tickLine: { show: true, size: 1, color: '#222226' },
          tickText: { show: true, color: '#5c5c6a', size: 11 }
        },
        yAxis: {
          show: true,
          axisLine: { show: true, color: '#222226', size: 1 },
          tickLine: { show: true, size: 1, color: '#222226' },
          tickText: { show: true, color: '#5c5c6a', size: 11 }
        },
        separator: {
          size: 1,
          color: '#222226',
          activeBackgroundColor: 'rgba(59, 130, 246, 0.1)'
        },
        crosshair: {
          show: true,
          horizontal: {
            show: true,
            line: { show: true, style: LineType.Dashed, size: 1, color: '#404048' },
            text: {
              show: true,
              size: 11,
              color: '#e8e8ec',
              borderRadius: 2,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 3,
              paddingBottom: 3,
              backgroundColor: '#333338'
            }
          },
          vertical: {
            show: true,
            line: { show: true, style: LineType.Dashed, size: 1, color: '#404048' },
            text: {
              show: true,
              size: 11,
              color: '#e8e8ec',
              borderRadius: 2,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 3,
              paddingBottom: 3,
              backgroundColor: '#333338'
            }
          }
        }
      }
    })

    if (chart) {
      chartRef.current = chart

      // Main pane: MA overlay
      chart.createIndicator('MA', false, { id: 'candle_pane' })

      // Sub panes with proper heights
      chart.createIndicator('VOL', false, { height: 80 })
      chart.createIndicator('MACD', false, { height: 100 })
    }

    // Handle resize
    const handleResize = () => {
      chartRef.current?.resize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (containerRef.current) {
        dispose(containerRef.current)
      }
      chartRef.current = null
    }
  }, [])

  // Update data
  useEffect(() => {
    if (chartRef.current && data.length > 0) {
      const chartData = data.map((d) => ({
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
        turnover: d.amount
      }))
      chartRef.current.applyNewData(chartData)
    }
  }, [data])

  // ResizeObserver for container size changes
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#0d0d0f'
      }}
    />
  )
}
