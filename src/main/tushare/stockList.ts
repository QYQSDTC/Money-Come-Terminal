import { TushareClient } from './client'
import type { StockInfo } from '../../shared/types'

let stockListCache: StockInfo[] = []

export async function loadStockList(client: TushareClient): Promise<StockInfo[]> {
  if (stockListCache.length > 0) return stockListCache

  if (!client.getToken()) {
    throw new Error('请先配置 Tushare Token')
  }

  const response = await client.getStockBasic()

  if (response.code !== 0) {
    throw new Error(response.msg || 'Tushare API 返回错误')
  }

  if (!response.data || response.data.items.length === 0) {
    throw new Error('股票列表为空，请检查 Token 权限')
  }

  const { fields, items } = response.data
  stockListCache = items.map((item) => {
    const obj: Record<string, any> = {}
    fields.forEach((field, idx) => {
      obj[field] = item[idx]
    })
    return obj as StockInfo
  })

  console.log(`[StockList] Loaded ${stockListCache.length} stocks`)
  return stockListCache
}

export function searchStocks(keyword: string): StockInfo[] {
  if (!keyword || keyword.trim() === '') {
    return stockListCache.slice(0, 20)
  }
  const kw = keyword.toLowerCase().trim()
  return stockListCache
    .filter(
      (s) =>
        s.ts_code.toLowerCase().includes(kw) ||
        s.symbol.includes(kw) ||
        s.name.toLowerCase().includes(kw)
    )
    .slice(0, 50)
}

export function clearStockListCache(): void {
  stockListCache = []
}

export function isStockListLoaded(): boolean {
  return stockListCache.length > 0
}
