'use client'

import { useScreeningResult } from '@/services/queries'
import type { StockAsset, ScreeningResult } from '@/lib/types'
import { getTaiwanDate } from '@/lib/utils'

export default function StockList({
  date,
  initialData,
}: {
  date: string
  initialData?: ScreeningResult[]
}) {
  const { data, isLoading, isError } = useScreeningResult(date, initialData)

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">載入中...</div>
  }

  if (isError) {
    return <div className="p-4 text-center text-red-500">發生錯誤，無法取得篩選結果。</div>
  }

  if (!data || data.length === 0) {
    const isToday = date === getTaiwanDate()

    if (isToday) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center dark:border-gray-800 dark:bg-gray-900/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            本日尚未執行篩選
          </h3>
          <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
            每日篩選固定於台股收盤後{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              15:15（台灣時間）
            </span>{' '}
            自動執行。執行完畢後將即時在此更新標的。
          </p>
        </div>
      )
    }

    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-800">
        該日無篩選紀錄（可能為假日休市或未排程執行）。
      </div>
    )
  }

  const twseResult = data.find((item) => item.market === 'TWSE')
  const usResult = data.find((item) => ['NASDAQ', 'US', 'S&P 500'].includes(item.market))

  const renderMarketSection = (
    title: string,
    badgeText: string,
    closedNotice: string,
    result: typeof twseResult
  ) => {
    if (!result) return null

    const tradingDate = result.assets?.[0]?.tradingDate

    return (
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold">{title}</h2>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {badgeText}
          </span>
          {tradingDate && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              （資料基準日：{tradingDate}）
            </span>
          )}
        </div>

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

        {result.status === 'closed' && (
          <div className="rounded-lg bg-yellow-50 p-4 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
            {closedNotice}
          </div>
        )}

        {result.status === 'completed' && result.assets && result.assets.length > 0 && (
          <div className="space-y-6">
            {/* 嚴格過濾 (老余三問) */}
            <div>
              <h3 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                🎯 嚴格過濾 (符合老余三問)
              </h3>
              {result.assets.filter((s) => s.matchLevel === 'strict' || !s.matchLevel).length >
              0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {result.assets
                    .filter((s) => s.matchLevel === 'strict' || !s.matchLevel)
                    .map((stock) => (
                      <StockCard key={stock.symbol} stock={stock} />
                    ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-700">
                  無完全符合的標的
                </div>
              )}
            </div>

            {/* 慣性過濾 (放寬條件) */}
            <div>
              <h3 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                🌊 慣性過濾 (守住邊界與假跌破)
              </h3>
              {result.assets.filter((s) => s.matchLevel === 'momentum').length > 0 ? (
                <div className="grid gap-4 opacity-90 md:grid-cols-2 lg:grid-cols-3">
                  {result.assets
                    .filter((s) => s.matchLevel === 'momentum')
                    .map((stock) => (
                      <StockCard key={stock.symbol} stock={stock} />
                    ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-700">
                  無僅符合慣性的標的
                </div>
              )}
            </div>
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
      {renderMarketSection(
        '台股',
        '當日數據',
        '今日休市（未開盤交易，週末或國定假日／颱風假）',
        twseResult
      )}
      {renderMarketSection(
        '美股',
        '前一交易日數據（當日尚未開盤）',
        '前一交易日休市（未開盤交易，週末或美國國定假日）',
        usResult
      )}
    </div>
  )
}

function StockCard({ stock }: { stock: StockAsset }) {
  // 確保相容舊資料：若無 tradingViewUrl 則動態生成
  const code = stock.market === 'TWSE' ? stock.symbol.split('.')[0] : stock.symbol
  const tvUrl =
    stock.tradingViewUrl ||
    (stock.market === 'TWSE'
      ? `https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE%3A${code}`
      : `https://tw.tradingview.com/chart/eEagIIPe/?symbol=${stock.market || 'US'}:${code}`)

  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{stock.name}</h3>
          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {stock.symbol}
          </span>
        </div>
        {stock.tradingDate && (
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            資料基準日：{stock.tradingDate}
          </div>
        )}
      </div>
      <a
        href={tvUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        在 TradingView 開啟
      </a>
    </div>
  )
}
