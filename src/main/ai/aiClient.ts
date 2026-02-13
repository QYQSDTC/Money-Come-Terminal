import axios from 'axios'

// ==================== Configuration ====================

const AI_BASE_URL = 'https://api.drqyq.com'

// ==================== Types ====================

export type AIModel = string

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices: {
    message: {
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ==================== System Prompts ====================

const MARKET_SYSTEM_PROMPT = `你是一位专业的A股市场分析师。请根据提供的市场数据，给出简洁、专业的市场分析。

分析要求：
1. **市场概况**：一句话总结今日行情特征
2. **多空研判**：基于指数走势、涨跌分布、北向资金、两融数据判断短期多空方向
3. **关注板块**：根据市场特征推测哪些板块可能表现活跃
4. **风险提示**：指出需要注意的风险因素
5. **操作建议**：给出明确的仓位建议（轻仓/半仓/重仓）和操作策略

要求：
- 语言简洁专业，每个要点 1-2 句话
- 直接给结论，不要啰嗦
- 使用 Markdown 格式，用 **加粗** 突出关键信息`

const STOCK_SYSTEM_PROMPT = `你是一位专业的A股趋势交易分析师。请根据提供的个股数据，给出简洁、专业的综合分析和趋势交易建议。

分析要求：
1. **公司概况**：如果提供了公司基本信息，先用2-3句话介绍这家公司是做什么的、主营业务是什么、在行业中处于什么地位。如果没有公司信息，跳过此项。
2. **趋势判断**：基于均线系统和MACD判断当前趋势方向和强度
3. **关键位置**：结合布林带和支撑阻力位，指出当前价格所处位置
4. **动量分析**：基于RSI/KDJ判断超买超卖状态和可能的转折点
5. **量价关系**：分析量能配合情况
6. **操作建议**：给出明确的交易方向（做多/做空/观望）、入场条件、止损位和目标位

要求：
- 公司概况部分用通俗易懂的语言，让不了解该公司的人能快速理解其业务
- 技术分析部分简洁专业，趋势交易思维，顺势而为
- 每个要点 1-3 句话，直接给结论
- 使用 Markdown 格式，用 **加粗** 突出关键信息`

// ==================== AI Request ====================

export async function analyzeMarket(
  apiKey: string,
  model: string,
  marketDataText: string
): Promise<{ content: string; model: string; tokens?: number }> {
  if (!apiKey) {
    throw new Error('请先在设置中配置 AI API Key')
  }
  if (!model) {
    throw new Error('请选择一个模型')
  }

  const isStockAnalysis = marketDataText.includes('技术分析数据')
  const systemPrompt = isStockAnalysis ? STOCK_SYSTEM_PROMPT : MARKET_SYSTEM_PROMPT

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: marketDataText }
  ]

  try {
    const response = await axios.post<ChatCompletionResponse>(
      `${AI_BASE_URL}/v1/chat/completions`,
      {
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 60_000
      }
    )

    const choice = response.data.choices?.[0]
    if (!choice) {
      throw new Error('AI 返回为空')
    }

    return {
      content: choice.message.content,
      model,
      tokens: response.data.usage?.total_tokens
    }
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('AI API Key 无效，请检查设置')
    }
    if (error.response?.status === 429) {
      throw new Error('AI 请求频率超限，请稍后重试')
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('AI 分析超时，请重试')
    }
    throw new Error(error.response?.data?.error?.message || error.message || 'AI 分析失败')
  }
}
