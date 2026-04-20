import StockList from '@/components/StockList'

export default function Home() {
  // 取得當天的日期 YYYY-MM-DD，做為 US1 的預設值
  // 注意：實際應用中，可能需考慮時區問題（台灣時間 15:00 後才會有當日資料）
  // 這裡先簡單用 UTC 時間展示，後續在 US2 會用 date-fns 完善日期切換
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">自動股票篩選</h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">今日篩選結果（{today}）</p>
      </header>

      <StockList date={today} />
    </div>
  )
}
