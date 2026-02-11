import axios from 'axios'

const TUSHARE_API_URL = 'http://api.tushare.pro'

// Default timeout: 30s, retry-friendly
const DEFAULT_TIMEOUT = 30_000

export interface TushareApiResponse {
  code: number
  msg: string
  data: {
    fields: string[]
    items: any[][]
  } | null
}

export class TushareClient {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  setToken(token: string): void {
    this.token = token
  }

  getToken(): string {
    return this.token
  }

  async request(
    apiName: string,
    params: Record<string, any>,
    fields?: string
  ): Promise<TushareApiResponse> {
    const body = {
      api_name: apiName,
      token: this.token,
      params,
      fields: fields || ''
    }

    try {
      const response = await axios.post(TUSHARE_API_URL, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: DEFAULT_TIMEOUT,
        // Signal for modern AbortController support
        validateStatus: (status) => status >= 200 && status < 500
      })

      if (response.status !== 200) {
        return {
          code: -1,
          msg: `HTTP ${response.status}: 服务端异常`,
          data: null
        }
      }

      return response.data
    } catch (error: any) {
      // Classify network-level errors
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return {
          code: -1,
          msg: '网络请求超时，请检查网络连接',
          data: null
        }
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          code: -1,
          msg: '无法连接到 Tushare 服务器',
          data: null
        }
      }
      if (error.code === 'ERR_NETWORK' || !error.response) {
        return {
          code: -1,
          msg: '网络连接异常，请检查网络',
          data: null
        }
      }
      return {
        code: -1,
        msg: error.message || '未知网络错误',
        data: null
      }
    }
  }

  async getStockBasic(): Promise<TushareApiResponse> {
    return this.request(
      'stock_basic',
      { exchange: '', list_status: 'L' },
      'ts_code,symbol,name,area,industry,list_date'
    )
  }

  async getDailyData(
    tsCode: string,
    startDate: string,
    endDate: string
  ): Promise<TushareApiResponse> {
    return this.request(
      'daily',
      { ts_code: tsCode, start_date: startDate, end_date: endDate },
      'ts_code,trade_date,open,high,low,close,vol,amount'
    )
  }

  async getMinuteData(
    tsCode: string,
    freq: string,
    startDate?: string,
    endDate?: string
  ): Promise<TushareApiResponse> {
    const params: Record<string, any> = { ts_code: tsCode, freq }
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    return this.request(
      'stk_mins',
      params,
      'ts_code,trade_time,open,high,low,close,vol,amount'
    )
  }

  // ---- Market Dashboard APIs ----

  async getIndexDaily(
    tsCode: string,
    startDate: string,
    endDate: string
  ): Promise<TushareApiResponse> {
    return this.request(
      'index_daily',
      { ts_code: tsCode, start_date: startDate, end_date: endDate },
      'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount'
    )
  }

  async getDailyAll(tradeDate: string): Promise<TushareApiResponse> {
    return this.request(
      'daily',
      { trade_date: tradeDate },
      'ts_code,trade_date,open,close,pct_chg,vol,amount'
    )
  }

  async getMoneyflowHSGT(
    startDate: string,
    endDate: string
  ): Promise<TushareApiResponse> {
    return this.request(
      'moneyflow_hsgt',
      { start_date: startDate, end_date: endDate },
      'trade_date,hgt,sgt,north_money,south_money'
    )
  }

  async getDailyInfo(tradeDate: string): Promise<TushareApiResponse> {
    return this.request(
      'daily_info',
      { trade_date: tradeDate },
      'trade_date,ts_code,ts_name,com_count,total_mv,float_mv,amount,vol,trans_count,pe,tr,exchange'
    )
  }

  async getMargin(
    startDate: string,
    endDate: string
  ): Promise<TushareApiResponse> {
    return this.request(
      'margin',
      { start_date: startDate, end_date: endDate },
      'trade_date,exchange_id,rzye,rzmre,rzche,rqye,rzrqye'
    )
  }
}
