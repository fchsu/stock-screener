'use client'

import { useScreeningResult } from '@/services/queries'
import type { StockAsset } from '@/lib/types'

export default function StockList({ date }: { date: string }) {
  const { data, isLoading, isError } = useScreeningResult(date)

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">載入中...</div>
  }

  if (isError) {
    return <div className="p-4 text-center text-red-500">發生錯誤，無法取得篩選結果。</div>
  }

  if (!data || data.length === 0) {
    return <div className="p-4 text-center text-gray-500">當日無符合條件的股票。</div>
  }

  const twseResult = data.find((item) => item.market === 'TWSE')
  const nasdaqResult = data.find((item) => item.market === 'NASDAQ')

  const renderMarketSection = (title: string, result: typeof twseResult) => {
    if (!result) return null

    return (
      <section>
        <h2 className="mb-4 text-2xl font-bold">{title}</h2>
        
        {result.status === 'fetching' && (
          <div className="rounded-lg bg-blue-50 p-4 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            資料抓取中...
          </div>
        )}
        
        {result.status === 'failed' && (
          <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/30 dark:text-red-300">
            抓取失敗
          </div>
        )}

        {result.status === 'completed' && result.assets && result.assets.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {result.assets.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} />
            ))}
          </div>
        )}
        
        {result.status === 'completed' && (!result.assets || result.assets.length === 0) && (
          <div className="rounded-lg bg-gray-50 p-4 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            無符合條件的股票
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-8">
      {renderMarketSection('台股', twseResult)}
      {renderMarketSection('美股', nasdaqResult)}
    </div>
  )
}

function StockCard({ stock }: { stock: StockAsset }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{stock.name}</h3>
        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {stock.symbol}
        </span>
      </div>
      <a
        href={stock.tradingViewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        在 TradingView 開啟
      </a>
    </div>
  )
}
