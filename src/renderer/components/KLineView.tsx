import React, { useEffect, useRef, useCallback } from 'react'
import { init, dispose, LineType, CandleType, TooltipShowRule, TooltipShowType, registerOverlay, ActionType } from 'klinecharts'
import type { Chart } from 'klinecharts'
import type { KLineData, AnalysisResult } from '../../shared/types'

// Custom tooltip labels for Chinese
const TOOLTIP_LABELS = {
  time: '时间',
  open: '开盘',
  high: '最高',
  low: '最低',
  close: '收盘',
  change: '涨跌',
  volume: '成交量',
  amount: '成交额'
}

// Format number with sign and fixed decimals
function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Get color based on change value
function getChangeColor(value: number): string {
  return value >= 0 ? '#F92855' : '#2DC08E'
}

// Format volume with units
function formatVolume(vol: number): string {
  if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿'
  if (vol >= 10000) return (vol / 10000).toFixed(2) + '万'
  return vol.toString()
}

// Register custom overlay for KLine info label
const klineInfoOverlay = {
  name: 'klineInfo',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }: any) => {
    const { points, extendData } = overlay
    if (!points || points.length === 0 || !extendData) return []
    
    const { open, high, low, close, volume, change, dateStr } = extendData
    const coordinate = coordinates[0]
    if (!coordinate) return []
    
    const isUp = change >= 0
    const accentColor = isUp ? '#F92855' : '#2DC08E'
    
    // Box dimensions
    const boxWidth = 96
    const rowHeight = 22
    const headerHeight = 28
    const padding = 8
    const rowCount = 6
    const contentHeight = rowCount * rowHeight
    const separatorGap = 6
    const boxHeight = headerHeight + separatorGap + contentHeight + padding
    
    // Position: prefer right side of the candle
    const offsetX = 16
    const offsetY = -boxHeight / 2
    
    let x = coordinate.x + offsetX
    let y = coordinate.y + offsetY
    
    // Boundary checks
    if (x + boxWidth > bounding.width) {
      x = coordinate.x - boxWidth - offsetX
    }
    if (y < 4) y = 4
    if (y + boxHeight > bounding.height) y = bounding.height - boxHeight - 4
    
    const figures: any[] = []
    
    // Shadow layer (subtle dark glow)
    figures.push({
      type: 'rect',
      attrs: { x: x + 1, y: y + 2, width: boxWidth, height: boxHeight },
      styles: { style: 'fill', color: 'rgba(0,0,0,0.45)', borderRadius: 8 }
    })
    
    // Main background — dark frosted glass
    figures.push({
      type: 'rect',
      attrs: { x, y, width: boxWidth, height: boxHeight },
      styles: { style: 'fill', color: 'rgba(24,24,32,0.88)', borderRadius: 8 }
    })
    
    // Subtle border
    figures.push({
      type: 'rect',
      attrs: { x, y, width: boxWidth, height: boxHeight },
      styles: { style: 'stroke', borderColor: 'rgba(255,255,255,0.06)', borderSize: 1, borderRadius: 8 }
    })
    
    // Top accent bar
    figures.push({
      type: 'rect',
      attrs: { x: x + 12, y: y, width: boxWidth - 24, height: 2.5 },
      styles: { style: 'fill', color: accentColor, borderRadius: [0, 0, 2, 2] }
    })
    
    // Header: date (left aligned like other rows)
    figures.push({
      type: 'text',
      attrs: { x: x + padding, y: y + headerHeight / 2 + 4, text: dateStr },
      styles: {
        color: 'rgba(255,255,255,0.85)',
        size: 12,
        family: '"SF Mono", "Menlo", "Monaco", monospace',
        align: 'left',
        weight: 'bold'
      }
    })
    
    // Separator line
    const sepY = y + headerHeight + separatorGap / 2
    figures.push({
      type: 'line',
      attrs: { coordinates: [{ x: x + padding, y: sepY }, { x: x + boxWidth - padding, y: sepY }] },
      styles: { style: 'dashed', color: 'rgba(255,255,255,0.07)', size: 1, dashedValue: [3, 3] }
    })
    
    // Data rows
    const dataRows = [
      { label: '收盘', value: close.toFixed(2), color: accentColor, bold: true },
      { label: '开盘', value: open.toFixed(2) },
      { label: '最高', value: high.toFixed(2), color: '#F92855' },
      { label: '最低', value: low.toFixed(2), color: '#2DC08E' },
      { label: '涨跌', value: formatChange(change), color: accentColor, bold: true },
      { label: '成交', value: formatVolume(volume) }
    ]
    
    const contentStartY = y + headerHeight + separatorGap + 4
    const labelX = x + padding
    const valueX = x + padding + 30
    
    dataRows.forEach((row, index) => {
      const rowY = contentStartY + index * rowHeight + rowHeight / 2
      
      // Label — bright white for dark mode readability
      figures.push({
        type: 'text',
        attrs: { x: labelX, y: rowY, text: row.label },
        styles: {
          color: 'rgba(255,255,255,0.82)',
          size: 11,
          family: 'system-ui, -apple-system, sans-serif',
          align: 'left',
          weight: '500'
        }
      })
      
      // Value — left-aligned, right after label
      figures.push({
        type: 'text',
        attrs: { x: valueX, y: rowY, text: row.value },
        styles: {
          color: row.color ?? 'rgba(255,255,255,0.82)',
          size: 11,
          family: '"SF Mono", "Menlo", "Monaco", monospace',
          align: 'left',
          weight: row.bold ? 'bold' : 'normal'
        }
      })
    })
    
    return figures
  }
}

// Register the overlay globally
registerOverlay(klineInfoOverlay)

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
  
  // Keep data ref in sync
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Format date string
  const formatDateStr = useCallback((timestamp: number): string => {
    const date = new Date(timestamp)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${month}-${day}`
  }, [])

  // Update info overlay for a specific KLine
  const updateInfoOverlay = useCallback((chart: Chart, kLineData: KLineData, prevClose?: number) => {
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
    
    // Calculate change based on previous close or open
    let change = 0
    if (prevClose && prevClose !== 0) {
      change = ((close - prevClose) / prevClose) * 100
    } else if (open !== 0) {
      change = ((close - open) / open) * 100
    }
    
    // Remove existing overlay
    if (infoOverlayIdRef.current) {
      chart.removeOverlay({ id: infoOverlayIdRef.current })
    }
    
    // Create new info overlay at the KLine position
    const overlayId = chart.createOverlay({
      name: 'klineInfo',
      points: [{ timestamp: kLineData.timestamp, value: close }],
      extendData: { 
        open, 
        high, 
        low, 
        close, 
        volume, 
        change, 
        dateStr: formatDateStr(kLineData.timestamp)
      },
      styles: {
        point: { show: false }
      }
    })
    
    if (typeof overlayId === 'string') {
      infoOverlayIdRef.current = overlayId
    }
  }, [formatDateStr])

  // Handle crosshair change - update info overlay position
  const handleCrosshairChange = useCallback((crosshair: any) => {
    const chart = chartRef.current
    if (!chart) return
    
    const { kLineData, dataIndex } = crosshair
    
    if (kLineData && dataIndex !== undefined && dataIndex >= 0) {
      // Get previous close for change calculation
      const currentData = dataRef.current
      let prevClose: number | undefined
      if (dataIndex > 0 && currentData[dataIndex - 1]) {
        prevClose = currentData[dataIndex - 1].close
      }
      updateInfoOverlay(chart, kLineData, prevClose)
    } else {
      // Hide overlay when crosshair is not on a valid KLine
      if (infoOverlayIdRef.current) {
        chart.removeOverlay({ id: infoOverlayIdRef.current })
        infoOverlayIdRef.current = null
      }
    }
  }, [updateInfoOverlay])

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
            showRule: TooltipShowRule.FollowCross,
            showType: TooltipShowType.Standard,
            custom: (params: any) => {
              const { data } = params
              if (!data) return []
              
              const open = data.open ?? 0
              const close = data.close ?? 0
              const change = open !== 0 ? ((close - open) / open) * 100 : 0
              const changeColor = getChangeColor(change)
              
              const formatPrice = (price: number) => price.toFixed(2)
              const formatVolume = (vol: number) => {
                if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿'
                if (vol >= 10000) return (vol / 10000).toFixed(2) + '万'
                return vol.toString()
              }
              const formatAmount = (amt: number) => {
                if (amt >= 100000000) return (amt / 100000000).toFixed(2) + '亿'
                if (amt >= 10000) return (amt / 10000).toFixed(2) + '万'
                return amt.toFixed(0)
              }
              
              return [
                { 
                  title: TOOLTIP_LABELS.time, 
                  value: data.timestamp ? new Date(data.timestamp).toLocaleDateString('zh-CN') : '--' 
                },
                { title: TOOLTIP_LABELS.open, value: formatPrice(open) },
                { title: TOOLTIP_LABELS.high, value: formatPrice(data.high ?? 0) },
                { title: TOOLTIP_LABELS.low, value: formatPrice(data.low ?? 0) },
                { title: TOOLTIP_LABELS.close, value: formatPrice(close) },
                { 
                  title: TOOLTIP_LABELS.change, 
                  value: formatChange(change),
                  color: changeColor
                },
                { title: TOOLTIP_LABELS.volume, value: formatVolume(data.volume ?? 0) },
                { title: TOOLTIP_LABELS.amount, value: formatAmount(data.turnover ?? data.amount ?? 0) }
              ]
            }
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
            showRule: TooltipShowRule.FollowCross,
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
      
      // Subscribe to crosshair change event
      chart.subscribeAction(ActionType.OnCrosshairChange, handleCrosshairChange)
    }

    // Handle resize
    const handleResize = () => {
      chartRef.current?.resize()
    }
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

  // Update data (full replacement — on initial load, stock change, manual refresh)
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

  // Real-time bar update (single bar — preserves scroll & zoom)
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
