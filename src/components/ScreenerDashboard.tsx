'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import DateNav from '@/components/DateNav'
import StockList from '@/components/StockList'
import type { ScreeningResult } from '@/lib/types'
import { getTaiwanDate } from '@/lib/utils'

interface ScreenerDashboardProps {
  initialOffset: number
  initialMultiData: Record<string, ScreeningResult[]>
}

export default function ScreenerDashboard({
  initialOffset,
  initialMultiData,
}: ScreenerDashboardProps) {
  const [offset, setOffset] = useState(initialOffset)
  const queryClient = useQueryClient()

  // 將伺服器預取的 5 天資料注入 React Query 快取，達成 0 延遲切換
  useEffect(() => {
    if (initialMultiData) {
      Object.entries(initialMultiData).forEach(([dateStr, results]) => {
        queryClient.setQueryData(['screeningResults', dateStr], results)
      })
    }
  }, [initialMultiData, queryClient])

  // 支援瀏覽器上一頁 / 下一頁 (Popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const newOffset = Number(params.get('offset')) || 0
      setOffset(newOffset)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleSelectOffset = useCallback((newOffset: number) => {
    setOffset(newOffset)
    const newUrl = newOffset === 0 ? '/' : `/?offset=${newOffset}`
    window.history.pushState(null, '', newUrl)
  }, [])

  const currentDateStr = getTaiwanDate(offset)

  return (
    <div className="space-y-6">
      <p className="text-lg text-gray-600 dark:text-gray-400">篩選結果（{currentDateStr}）</p>

      <DateNav currentOffset={offset} onSelectOffset={handleSelectOffset} />
      <StockList date={currentDateStr} initialData={initialMultiData[currentDateStr]} />
    </div>
  )
}
