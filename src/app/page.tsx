import StockList from '@/components/StockList'
import DateNav from '@/components/DateNav'

import { fetchScreeningResultsServer } from '@/services/queries'
import { getTaiwanDate } from '@/lib/utils'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const offset = Number(params.offset) || 0

  // 統一使用台灣時區計算目標日期
  const targetDateStr = getTaiwanDate(offset)

  // SSR 預取當日篩選結果，消除 Waterfall
  const initialData = await fetchScreeningResultsServer(targetDateStr)

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">自動股票篩選</h1>
          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 sm:self-auto dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span>排程時間：每週一至週五 15:15（台灣時間）</span>
          </div>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400">篩選結果（{targetDateStr}）</p>
      </header>

      <DateNav currentOffset={offset} />
      <StockList date={targetDateStr} initialData={initialData} />
    </div>
  )
}
