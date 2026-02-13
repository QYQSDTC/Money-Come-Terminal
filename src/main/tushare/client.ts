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

  async getStockCompany(tsCode: string): Promise<TushareApiResponse> {
    return this.request(
      'stock_company',
      { ts_code: tsCode },
      'ts_code,chairman,reg_capital,setup_date,introduction,main_business,business_scope,employees'
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

  /**
   * 实时日线行情 (rt_k)
   * 获取当日盘中实时 OHLCV 数据
   */
  async getRealTimeDaily(tsCode: string): Promise<TushareApiResponse> {
    return this.request(
      'rt_k',
      { ts_code: tsCode },
      'ts_code,name,open,high,low,close,vol,amount,pre_close,trade_time'
    )
  }

  /**
   * 批量获取实时日线行情 (rt_k)
   * 一次可获取最多 6000 条数据，覆盖全市场
   * 直接传所有代码，不分批，避免触发频次限制
   */
  async getRealTimeDailyBatch(tsCodes: string[]): Promise<TushareApiResponse> {
    // rt_k 支持最多 6000 个代码，A股全市场约 5000+，可以一次拉完
    const tsCodeStr = tsCodes.join(',')
    
    console.log(`[Tushare] Fetching rt_k for ${tsCodes.length} stocks in one request`)
    
    const resp = await this.request(
      'rt_k',
      { ts_code: tsCodeStr },
      'ts_code,name,open,high,low,close,vol,amount,pre_close,trade_time'
    )
    
    if (resp.code !== 0) {
      console.error('[Tushare] rt_k failed:', resp.msg)
    } else {
      const count = resp.data?.items?.length || 0
      console.log(`[Tushare] rt_k returned ${count} stocks`)
    }
    
    return resp
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
      'ts_code,trade_date,open,high,low,close,pct_chg,vol,amount'
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

  // ---- Fundamental Data APIs ----

  async getDailyBasic(tsCode: string, tradeDate?: string): Promise<TushareApiResponse> {
    const params: Record<string, any> = { ts_code: tsCode }
    if (tradeDate) params.trade_date = tradeDate
    return this.request(
      'daily_basic',
      params,
      'ts_code,trade_date,total_mv,circ_mv,pe,pe_ttm,pb,ps_ttm,total_share,float_share'
    )
  }

  async getIncome(tsCode: string): Promise<TushareApiResponse> {
    return this.request(
      'income',
      { ts_code: tsCode, report_type: '1' },
      'ts_code,end_date,revenue,n_income_attr_p,basic_eps'
    )
  }

  async getFinaIndicator(tsCode: string): Promise<TushareApiResponse> {
    return this.request(
      'fina_indicator',
      { ts_code: tsCode },
      'ts_code,end_date,roe,roa,grossprofit_margin,netprofit_margin,debt_to_assets,netprofit_yoy,tr_yoy'
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
