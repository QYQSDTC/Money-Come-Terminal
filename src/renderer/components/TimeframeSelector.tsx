import React from 'react'
import { Radio, Tooltip } from 'antd'
import type { Timeframe } from '../../shared/types'

interface TimeframeSelectorProps {
  value: Timeframe
  onChange: (tf: Timeframe) => void
}

const timeframes: { key: Timeframe; label: string; shortcut: string }[] = [
  { key: '1min', label: '1分', shortcut: '1' },
  { key: '5min', label: '5分', shortcut: '2' },
  { key: '15min', label: '15分', shortcut: '3' },
  { key: '30min', label: '30分', shortcut: '4' },
  { key: '60min', label: '60分', shortcut: '5' },
  { key: 'daily', label: '日线', shortcut: '6' }
]

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({ value, onChange }) => {
  return (
    <Radio.Group
      value={value}
      onChange={(e) => onChange(e.target.value as Timeframe)}
      buttonStyle="solid"
      size="middle"
      style={{ display: 'flex', gap: 0 }}
    >
      {timeframes.map((tf) => (
        <Tooltip
          key={tf.key}
          title={`按 ${tf.shortcut} 快速切换`}
          mouseEnterDelay={0.8}
          placement="bottom"
        >
          <Radio.Button
            value={tf.key}
            style={{
              fontWeight: value === tf.key ? 600 : 400,
              minWidth: 56,
              textAlign: 'center',
              letterSpacing: value === tf.key ? '0.5px' : '0'
            }}
          >
            {tf.label}
          </Radio.Button>
        </Tooltip>
      ))}
    </Radio.Group>
  )
}
