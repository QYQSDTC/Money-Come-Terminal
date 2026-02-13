import React, { useEffect, useRef, useCallback } from 'react'
import { init, dispose, LineType, CandleType, TooltipShowRule, TooltipShowType, registerOverlay, ActionType } from 'klinecharts'
import type { Chart } from 'klinecharts'
import type { KLineData, AnalysisResult } from '../../shared/types'

// ── Formatting helpers ──────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toFixed(2)
}

function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

function getChangeColor(value: number): string {
  if (value > 0) return '#F92855'
  if (value < 0) return '#2DC08E'
  return '#8e8e96'
}

function formatVolume(vol: number): string {
  if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿'
  if (vol >= 10000) return (vol / 10000).toFixed(2) + '万'
  return vol.toFixed(0)
}

function formatAmount(amt: number): string {
  if (amt >= 100000000) return (amt / 100000000).toFixed(2) + '亿'
  if (amt >= 10000) return (amt / 10000).toFixed(2) + '万'
  return amt.toFixed(0)
}

// ── Fixed-position info panel overlay ───────────────────────────

const klineInfoOverlay = {
  name: 'klineInfo',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, bounding }: any) => {
    const ext = overlay?.extendData
    if (!ext) return []

    const {
      open, high, low, close, volume, amount,
      change, amplitude, dateStr, crosshairX
    } = ext

    const changeColor = getChangeColor(change)

    // ── Layout constants ──
    const boxWidth = 150
    const rowHeight = 20
    const paddingX = 10
    const paddingY = 8
    const labelColWidth = 42          // space for 3-char labels like "成交额"
    const white = '#e0e0e4'
    const rows = [
      { label: '时间',  value: dateStr,                   color: white },
      { label: '开盘',  value: formatPrice(open),         color: white },
      { label: '收盘',  value: formatPrice(close),        color: changeColor },
      { label: '最高',  value: formatPrice(high),         color: white },
      { label: '最低',  value: formatPrice(low),          color: white },
      { label: '涨幅',  value: formatChange(change),      color: changeColor },
      { label: '振幅',  value: formatPercent(amplitude),  color: white },
      { label: '成交量', value: formatVolume(volume),      color: white }
    ]

    const boxHeight = paddingY + rows.length * rowHeight + paddingY

    // ── Position: top-left or top-right, dodge mouse ──
    const margin = 6
    const topY = margin
    const showOnRight = crosshairX !== undefined && crosshairX < bounding.width * 0.4
    const x = showOnRight
      ? bounding.width - boxWidth - margin
      : margin
    const y = topY

    const figures: any[] = []

    // Rows — no background, text only
    rows.forEach((row, i) => {
      const ry = y + paddingY + i * rowHeight + 14

      // Label
      figures.push({
        type: 'text',
        attrs: { x: x + paddingX, y: ry, text: row.label },
        styles: {
          color: 'rgba(255,255,255,0.5)',
          size: 11,
          family: 'system-ui, -apple-system, "PingFang SC", sans-serif',
          align: 'left',
          backgroundColor: 'transparent',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0
        }
      })

      // Value
      figures.push({
        type: 'text',
        attrs: { x: x + paddingX + labelColWidth, y: ry, text: row.value },
        styles: {
          color: row.color,
          size: 11,
          family: '"SF Mono", "Menlo", "Consolas", monospace',
          align: 'left',
          weight: 'normal',
          backgroundColor: 'transparent',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0
        }
      })
    })

    return figures
  }
}

registerOverlay(klineInfoOverlay)

// ── Component ───────────────────────────────────────────────────

interface KLineViewProps {
  data: KLineData[]
  analysis?: AnalysisResult | null
  realtimeBar?: KLineData | null
}

export const KLineView: React.FC<KLineViewProps> = ({ data, analysis, realtimeBar }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const infoOverlayIdRef = useRef<string | null>(null)
  const dataRef = useRef<KLineData[]>(data)

  useEffect(() => { dataRef.current = data }, [data])

  // ── Format date string ──
  const formatDateStr = useCallback((timestamp: number): string => {
    const d = new Date(timestamp)
    const mm = (d.getMonth() + 1).toString().padStart(2, '0')
    const dd = d.getDate().toString().padStart(2, '0')
    return `${mm}-${dd}`
  }, [])

  // ── Update the floating info panel ──
  const updateInfoOverlay = useCallback((
    chart: Chart,
    kLineData: KLineData,
    prevClose?: number,
    crosshairX?: number
  ) => {
    if (!kLineData) {
      if (infoOverlayIdRef.current) {
        chart.removeOverlay({ id: infoOverlayIdRef.current })
        infoOverlayIdRef.current = null
      }
      return
    }

    const open = kLineData.open ?? 0
    const close = kLineData.close ?? 0
    const high = kLineData.high ?? 0
    const low = kLineData.low ?? 0
    const volume = kLineData.volume ?? 0
    const amount = kLineData.amount ?? 0

    // 涨幅 = (close - prevClose) / prevClose
    let change = 0
    if (prevClose && prevClose !== 0) {
      change = ((close - prevClose) / prevClose) * 100
    } else if (open !== 0) {
      change = ((close - open) / open) * 100
    }

    // 振幅 = (high - low) / prevClose
    let amplitude = 0
    const base = prevClose && prevClose !== 0 ? prevClose : open
    if (base !== 0) {
      amplitude = ((high - low) / base) * 100
    }

    // Remove old overlay
    if (infoOverlayIdRef.current) {
      chart.removeOverlay({ id: infoOverlayIdRef.current })
    }

    const overlayId = chart.createOverlay({
      name: 'klineInfo',
      points: [{ timestamp: kLineData.timestamp, value: close }],
      extendData: {
        open, high, low, close, volume, amount,
        change, amplitude,
        dateStr: formatDateStr(kLineData.timestamp),
        crosshairX
      },
      styles: { point: { show: false } }
    })

    if (typeof overlayId === 'string') {
      infoOverlayIdRef.current = overlayId
    }
  }, [formatDateStr])

  // ── Crosshair event → update panel ──
  const handleCrosshairChange = useCallback((crosshair: any) => {
    const chart = chartRef.current
    if (!chart) return

    const { kLineData, dataIndex, x } = crosshair

    if (kLineData && dataIndex !== undefined && dataIndex >= 0) {
      const currentData = dataRef.current
      let prevClose: number | undefined
      if (dataIndex > 0 && currentData[dataIndex - 1]) {
        prevClose = currentData[dataIndex - 1].close
      }
      updateInfoOverlay(chart, kLineData, prevClose, x)
    } else {
      // Show last bar data when crosshair leaves
      const currentData = dataRef.current
      if (currentData.length > 0) {
        const lastData = currentData[currentData.length - 1]
        const prevData = currentData.length > 1 ? currentData[currentData.length - 2] : undefined
        updateInfoOverlay(chart, lastData, prevData?.close, undefined)
      }
    }
  }, [updateInfoOverlay])

  // ── Init chart ──
  useEffect(() => {
    if (!containerRef.current) return

    const chart = init(containerRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: LineType.Dashed },
          vertical: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: LineType.Dashed }
        },
        candle: {
          type: CandleType.CandleSolid,
          bar: {
            upColor: '#F92855', downColor: '#2DC08E',
            upBorderColor: '#F92855', downBorderColor: '#2DC08E',
            upWickColor: '#F92855', downWickColor: '#2DC08E',
            noChangeColor: '#6b6b78', noChangeBorderColor: '#6b6b78', noChangeWickColor: '#6b6b78'
          },
          priceMark: {
            show: true,
            high: { show: true, color: '#F92855', textSize: 10 },
            low: { show: true, color: '#2DC08E', textSize: 10 },
            last: {
              show: true,
              upColor: '#F92855', downColor: '#2DC08E', noChangeColor: '#6b6b78',
              line: { show: true, style: LineType.Dashed, size: 1 },
              text: { show: true, size: 11, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2 }
            }
          },
          // Disable built-in candle tooltip — our overlay panel handles it
          tooltip: {
            showRule: TooltipShowRule.None
          }
        },
        indicator: {
          lastValueMark: {
            show: true,
            text: { show: true, size: 10, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 }
          },
          // Keep MA / VOL / MACD tooltips visible at the top of each pane
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
        separator: { size: 1, color: '#222226', activeBackgroundColor: 'rgba(59,130,246,0.1)' },
        crosshair: {
          show: true,
          horizontal: {
            show: true,
            line: { show: true, style: LineType.Dashed, size: 1, color: '#404048' },
            text: { show: true, size: 11, color: '#e8e8ec', borderRadius: 2, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, backgroundColor: '#333338' }
          },
          vertical: {
            show: true,
            line: { show: true, style: LineType.Dashed, size: 1, color: '#404048' },
            text: { show: true, size: 11, color: '#e8e8ec', borderRadius: 2, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, backgroundColor: '#333338' }
          }
        }
      }
    })

    if (chart) {
      chartRef.current = chart

      // MA on candle pane
      chart.createIndicator('MA', false, { id: 'candle_pane' })

      // Sub panes
      chart.createIndicator('VOL', false, { height: 80 })
      chart.createIndicator('MACD', false, { height: 100 })

      // Subscribe to crosshair
      chart.subscribeAction(ActionType.OnCrosshairChange, handleCrosshairChange)
    }

    const handleResize = () => chartRef.current?.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.unsubscribeAction(ActionType.OnCrosshairChange, handleCrosshairChange)
      }
      if (containerRef.current) {
        dispose(containerRef.current)
      }
      chartRef.current = null
      infoOverlayIdRef.current = null
    }
  }, [handleCrosshairChange])

  // ── Load data ──
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

      // Show info panel for the last bar by default
      const lastData = data[data.length - 1]
      const prevData = data.length > 1 ? data[data.length - 2] : undefined
      updateInfoOverlay(chartRef.current, lastData, prevData?.close, undefined)
    }
  }, [data, updateInfoOverlay])

  // ── Real-time bar update ──
  useEffect(() => {
    if (chartRef.current && realtimeBar) {
      chartRef.current.updateData({
        timestamp: realtimeBar.timestamp,
        open: realtimeBar.open,
        high: realtimeBar.high,
        low: realtimeBar.low,
        close: realtimeBar.close,
        volume: realtimeBar.volume,
        turnover: realtimeBar.amount
      })
    }
  }, [realtimeBar])

  // ── Resize observer ──
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0d0d0f' }}
    />
  )
}
