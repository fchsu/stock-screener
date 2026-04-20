import StockList from '@/components/StockList'
import DateNav from '@/components/DateNav'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const offset = Number(params.offset) || 0

  // 計算目標日期
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() - offset)
  const targetDateStr = targetDate.toISOString().split('T')[0]

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">自動股票篩選</h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">篩選結果（{targetDateStr}）</p>
      </header>

      <DateNav currentOffset={offset} />
      <StockList date={targetDateStr} />
    </div>
  )
}
