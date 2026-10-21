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
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* 單行緊湊頂部列：整合標題、當前篩選日期、日期切換與排程提示 */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 shadow-xs dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              自動股票篩選
            </h1>
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              ({currentDateStr})
            </span>
          </div>

          <DateNav currentOffset={offset} onSelectOffset={handleSelectOffset} />
        </div>

        <div className="hidden items-center gap-2 text-[11px] text-gray-500 xl:flex dark:text-gray-400">
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 dark:border-gray-800 dark:bg-gray-900">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span>每日 15:15 排程</span>
          </span>
          <span>台股採當日收盤 · 美股採前一交易日收盤</span>
        </div>
      </header>

      <StockList date={currentDateStr} initialData={initialMultiData[currentDateStr]} />
    </div>
  )
}
