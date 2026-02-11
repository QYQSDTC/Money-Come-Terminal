import React, { useEffect } from 'react'
import { Spin, Alert, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useMarketData } from '../../hooks/useMarketData'
import { IndexCard } from './IndexCard'
import { BreadthBar } from './BreadthBar'
import { SentimentGauge } from './SentimentGauge'
import { NorthboundChart } from './NorthboundChart'
import { VolumeChart } from './VolumeChart'
import { MarginFlow } from './MarginFlow'
import { AIAnalysis } from './AIAnalysis'

export const MarketDashboard: React.FC = () => {
  const { data, sentiment, loading, error, lastUpdated, fromCache, fetchData } = useMarketData()

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading && !data) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        color: '#8a8a96'
      }}>
        <Spin size="large" />
        <div style={{ fontSize: 14 }}>正在加载市场数据...</div>
        <div style={{ fontSize: 12, color: '#5c5c6a' }}>首次加载可能需要 10-20 秒</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32
      }}>
        <Alert
          type="error"
          message="市场数据加载失败"
          description={error}
          showIcon
          style={{ maxWidth: 480 }}
        />
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={() => fetchData(true)}
          style={{ borderRadius: 8 }}
        >
          重新加载
        </Button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      padding: '16px 20px',
      background: '#0d0d0f'
    }}>
      {/* Loading overlay for refresh */}
      {loading && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 20,
          background: 'rgba(30, 30, 34, 0.95)',
          border: '1px solid #2a2a30',
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 100,
          fontSize: 12,
          color: '#8a8a96'
        }}>
          <Spin size="small" />
          刷新中...
        </div>
      )}

      {/* Row 1: Index Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12,
        marginBottom: 16
      }}>
        {data.indices.map((idx) => (
          <IndexCard key={idx.ts_code} index={idx} />
        ))}
      </div>

      {/* Row 2: Breadth + Margin + Sentiment */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: 12,
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BreadthBar breadth={data.breadth} />
          <MarginFlow data={data.margin} />
        </div>
        {sentiment && <SentimentGauge sentiment={sentiment} />}
      </div>

      {/* Row 3: Northbound + Volume */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 16
      }}>
        <NorthboundChart data={data.northbound} />
        <VolumeChart indices={data.indices} />
      </div>

      {/* Row 4: AI Analysis */}
      {sentiment && <AIAnalysis data={data} sentiment={sentiment} />}

      {/* Footer info */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        padding: '8px 4px',
        fontSize: 11,
        color: '#5c5c6a'
      }}>
        <span>
          数据日期: {data.date ? `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}` : '--'}
          {fromCache && ' (缓存)'}
        </span>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          onClick={() => fetchData(true)}
          style={{ color: '#5c5c6a', fontSize: 11 }}
        >
          刷新
        </Button>
      </div>
    </div>
  )
}
