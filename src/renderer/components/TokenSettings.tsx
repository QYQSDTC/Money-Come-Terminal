import React, { useState, useEffect } from 'react'
import { Modal, Input, Typography, Space, Alert, message, Divider, Tooltip } from 'antd'
import { SettingOutlined, CheckCircleOutlined, KeyOutlined, RobotOutlined, InfoCircleOutlined } from '@ant-design/icons'

const { Text, Link } = Typography

interface TokenSettingsProps {
  visible: boolean
  onClose: () => void
  onSave: () => void
}

export const TokenSettings: React.FC<TokenSettingsProps> = ({ visible, onClose, onSave }) => {
  // Tushare
  const [token, setToken] = useState('')
  const [hasExistingToken, setHasExistingToken] = useState(false)

  // AI
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModels, setAiModels] = useState('')
  const [hasExistingAI, setHasExistingAI] = useState(false)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible) {
      window.api.getToken().then((t) => {
        setToken(t || '')
        setHasExistingToken(!!t)
      })
      window.api.getAIConfig().then((cfg) => {
        setAiApiKey(cfg.apiKey || '')
        setAiModels(cfg.models || 'deepseek-v3.2')
        setHasExistingAI(!!cfg.apiKey)
      })
    }
  }, [visible])

  const handleSave = async () => {
    const trimmedToken = token.trim()
    if (trimmedToken && trimmedToken.length < 20) {
      message.warning('Tushare Token 长度异常，请检查是否复制完整')
      return
    }

    setLoading(true)
    try {
      if (trimmedToken) {
        await window.api.setToken(trimmedToken)
      }

      const trimmedKey = aiApiKey.trim()
      const trimmedModels = aiModels.trim() || 'deepseek-v3.2'

      await window.api.setAIConfig({
        apiKey: trimmedKey,
        models: trimmedModels
      })

      message.success('设置已保存')
      onSave()
    } catch (e: any) {
      message.error('保存失败: ' + (e.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // Preview parsed models
  const parsedModels = aiModels
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined style={{ color: '#3b82f6' }} />
          <span>系统设置</span>
        </Space>
      }
      open={visible}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      width={520}
      styles={{
        body: { paddingTop: 16 }
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* ==================== Tushare Section ==================== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <KeyOutlined style={{ color: '#f59e0b', fontSize: 14 }} />
          <Text strong style={{ fontSize: 13 }}>Tushare Pro Token</Text>
          {hasExistingToken && (
            <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 12 }} />
          )}
        </div>

        <Alert
          message={
            <span style={{ fontSize: 12, lineHeight: 1.8 }}>
              日线数据需要 <Text strong>2000+</Text> 积分，分钟数据需单独开通。
              前往{' '}
              <Link href="https://tushare.pro/document/1?doc_id=135" target="_blank">
                tushare.pro
              </Link>{' '}
              了解详情。
            </span>
          }
          type="info"
          showIcon
          style={{ marginBottom: 4 }}
        />

        <div>
          <Text style={{ marginBottom: 6, display: 'block', color: '#8a8a96', fontSize: 11 }}>
            Token
          </Text>
          <Input.Password
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="请粘贴您的 Tushare Pro Token"
            onPressEnter={handleSave}
            style={{ background: '#161618', borderColor: '#2a2a30' }}
          />
          <Text style={{ color: '#5c5c6a', fontSize: 11, marginTop: 4, display: 'block' }}>
            还没有 Token？前往{' '}
            <Link href="https://tushare.pro/register?reg=7" target="_blank">
              tushare.pro
            </Link>{' '}
            注册获取
          </Text>
        </div>

        {/* ==================== AI Section ==================== */}
        <Divider style={{ margin: '16px 0 12px', borderColor: '#2a2a30' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <RobotOutlined style={{ color: '#3b82f6', fontSize: 14 }} />
          <Text strong style={{ fontSize: 13 }}>AI 分析配置</Text>
          {hasExistingAI && (
            <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 12 }} />
          )}
        </div>

        <div>
          <Text style={{ marginBottom: 6, display: 'block', color: '#8a8a96', fontSize: 11 }}>
            API Key
          </Text>
          <Input.Password
            value={aiApiKey}
            onChange={(e) => setAiApiKey(e.target.value)}
            placeholder="sk-..."
            style={{ background: '#161618', borderColor: '#2a2a30' }}
          />
          <Text style={{ color: '#5c5c6a', fontSize: 11, marginTop: 4, display: 'block' }}>
            前往{' '}
            <Link href="https://api.drqyq.com" target="_blank">
              api.drqyq.com
            </Link>{' '}
            获取 API Key
          </Text>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Text style={{ color: '#8a8a96', fontSize: 11 }}>
              模型配置
            </Text>
            <Tooltip title="输入模型名称，多个模型用英文逗号隔开，分析时可通过下拉菜单切换">
              <InfoCircleOutlined style={{ color: '#5c5c6a', fontSize: 11, cursor: 'help' }} />
            </Tooltip>
          </div>
          <Input
            value={aiModels}
            onChange={(e) => setAiModels(e.target.value)}
            placeholder="deepseek-v3.2,gemini-3-pro-preview"
            style={{ background: '#161618', borderColor: '#2a2a30' }}
          />
          {parsedModels.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {parsedModels.map((m, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: i === 0 ? '#3b82f6' : '#8a8a96',
                    padding: '2px 8px',
                    background: i === 0 ? 'rgba(59,130,246,0.1)' : '#1e1e22',
                    borderRadius: 4,
                    border: i === 0 ? '1px solid rgba(59,130,246,0.3)' : '1px solid #2a2a30'
                  }}
                >
                  {m}{i === 0 ? ' (默认)' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </Space>
    </Modal>
  )
}
