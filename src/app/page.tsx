import ScreenerDashboard from '@/components/ScreenerDashboard'
import { fetchMultiDateScreeningResultsServer } from '@/services/queries'
import { getTaiwanDate } from '@/lib/utils'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const offset = Number(params.offset) || 0

  // 取得最近 5 天的日期陣列
  const recentDates = Array.from({ length: 5 }, (_, i) => getTaiwanDate(i))

  // SSR 一次性批次抓取 5 天資料 (單一 Supabase 查詢)，徹底消除換頁網路延遲
  const initialMultiData = await fetchMultiDateScreeningResultsServer(recentDates)

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">自動股票篩選</h1>
          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 sm:self-auto dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span>排程時間：每日 15:15（台灣時間）</span>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <span className="font-semibold">💡 資料基準說明：</span>
          每日 15:15 執行篩選時，台股當日已收盤，美股當日尚未開盤。
          <span className="ml-1 font-medium text-blue-700 dark:text-blue-300">
            台股採用「當日收盤數據」；美股採用「前一交易日收盤數據」（週六 15:15
            會正常篩選美股週五收盤結果）。
          </span>
        </div>
      </header>

      <ScreenerDashboard initialOffset={offset} initialMultiData={initialMultiData} />
    </div>
  )
}
