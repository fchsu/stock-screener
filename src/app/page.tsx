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

  return <ScreenerDashboard initialOffset={offset} initialMultiData={initialMultiData} />
}
