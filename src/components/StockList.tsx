'use client'

import { useState, useEffect, useMemo } from 'react'
import { useScreeningResult } from '@/services/queries'
import StockChart from '@/components/StockChart'
import type { StockAsset, ScreeningResult } from '@/lib/types'
import type { ChartInterval } from '@/lib/ohlcv'
import { getTaiwanDate } from '@/lib/utils'

type ActiveMarketTab = 'TWSE' | 'US'

export default function StockList({
  date,
  initialData,
}: {
  date: string
  initialData?: ScreeningResult[]
}) {
  const { data, isLoading, isError } = useScreeningResult(date, initialData)
  const [activeMarket, setActiveMarket] = useState<ActiveMarketTab>('TWSE')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [activeInterval, setActiveInterval] = useState<ChartInterval>('1d')
  const [viewMode, setViewMode] = useState<'single' | 'multi'>('single')

  const twseResult = useMemo(() => data?.find((item) => item.market === 'TWSE'), [data])
  const usResult = useMemo(
    () => data?.find((item) => ['NASDAQ', 'US', 'S&P 500', 'NYSE'].includes(item.market)),
    [data]
  )

  const currentResult = activeMarket === 'TWSE' ? twseResult : usResult

  const { strictAssets, momentumAssets, orderedAssets } = useMemo(() => {
    const assets = currentResult?.status === 'completed' ? (currentResult.assets ?? []) : []
    const strict = assets.filter((s) => s.matchLevel === 'strict' || !s.matchLevel)
    const momentum = assets.filter((s) => s.matchLevel === 'momentum')
    return {
      strictAssets: strict,
      momentumAssets: momentum,
      orderedAssets: [...strict, ...momentum],
    }
  }, [currentResult])

  const selectedStock: StockAsset | null = useMemo(() => {
    if (orderedAssets.length === 0) return null
    if (selectedSymbol) {
      const found = orderedAssets.find((s) => s.symbol === selectedSymbol)
      if (found) return found
    }
    return orderedAssets[0]
  }, [orderedAssets, selectedSymbol])

  // 支援鍵盤快捷鍵：上下鍵切換股票、1/2/3 切換 60K/日K/週K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return
      }

      if (e.key === '1') {
        setActiveInterval('60m')
        setViewMode('single')
        return
      }
      if (e.key === '2') {
        setActiveInterval('1d')
        setViewMode('single')
        return
      }
      if (e.key === '3') {
        setActiveInterval('1wk')
        setViewMode('single')
        return
      }

      if (orderedAssets.length === 0) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const currentIndex = selectedStock
          ? orderedAssets.findIndex((s) => s.symbol === selectedStock.symbol)
          : 0
        const delta = e.key === 'ArrowDown' ? 1 : -1
        const nextIndex = (currentIndex + delta + orderedAssets.length) % orderedAssets.length
        setSelectedSymbol(orderedAssets[nextIndex].symbol)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [orderedAssets, selectedStock])

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

  const twseCount = twseResult?.status === 'completed' ? (twseResult.assets?.length ?? 0) : 0
  const usCount = usResult?.status === 'completed' ? (usResult.assets?.length ?? 0) : 0
  const badgeText = activeMarket === 'TWSE' ? '當日數據' : '前一交易日數據（當日尚未開盤）'
  const closedNotice =
    activeMarket === 'TWSE'
      ? '今日休市（未開盤交易，週末或國定假日／颱風假）'
      : '前一交易日休市（未開盤交易，週末或美國國定假日）'
  const tradingDate = currentResult?.assets?.[0]?.tradingDate

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* 左側邊欄：市場切換 + 條列式雙群組清單 */}
      <aside className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-xs lg:col-span-4 xl:col-span-3 dark:border-gray-800 dark:bg-gray-950">
        {/* 台股 / 美股 切換 Tab */}
        <div
          className="grid grid-cols-2 gap-1 border-b border-gray-200 bg-gray-100/70 p-1.5 dark:border-gray-800 dark:bg-gray-900/70"
          role="tablist"
          aria-label="市場切換"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeMarket === 'TWSE'}
            onClick={() => {
              setActiveMarket('TWSE')
              setSelectedSymbol(null)
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
              activeMarket === 'TWSE'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span>台股</span>
            <span className="rounded-full bg-gray-200/80 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {twseCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeMarket === 'US'}
            onClick={() => {
              setActiveMarket('US')
              setSelectedSymbol(null)
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
              activeMarket === 'US'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span>美股</span>
            <span className="rounded-full bg-gray-200/80 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {usCount}
            </span>
          </button>
        </div>

        {/* 市場資料基準說明列 */}
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-gray-100 px-3.5 py-2 text-xs text-gray-500 dark:border-gray-800/80 dark:text-gray-400">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {badgeText}
          </span>
          {tradingDate && <span>資料基準日：{tradingDate}</span>}
        </div>

        {/* 清單內容區 */}
        <div className="max-h-[640px] flex-1 space-y-4 overflow-y-auto p-3">
          {!currentResult && (
            <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
              無此市場篩選紀錄
            </div>
          )}

          {currentResult?.status === 'fetching' && (
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              資料抓取中...
            </div>
          )}

          {currentResult?.status === 'failed' && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              抓取失敗
            </div>
          )}

          {currentResult?.status === 'closed' && (
            <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
              {closedNotice}
            </div>
          )}

          {currentResult?.status === 'completed' && orderedAssets.length === 0 && (
            <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              無符合條件的股票
            </div>
          )}

          {currentResult?.status === 'completed' && orderedAssets.length > 0 && (
            <>
              {/* 群組 1：標準圖 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    🎯 標準圖
                  </h3>
                  <span className="text-xs font-medium text-gray-400">{strictAssets.length}</span>
                </div>
                {strictAssets.length > 0 ? (
                  <ul className="space-y-1">
                    {strictAssets.map((stock) => (
                      <StockSidebarRow
                        key={stock.symbol}
                        stock={stock}
                        isSelected={selectedStock?.symbol === stock.symbol}
                        onSelect={() => setSelectedSymbol(stock.symbol)}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-center text-xs text-gray-400 dark:border-gray-800">
                    無完全符合標準圖的標的
                  </div>
                )}
              </div>

              {/* 群組 2：慣性改變 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    🌊 慣性改變
                  </h3>
                  <span className="text-xs font-medium text-gray-400">{momentumAssets.length}</span>
                </div>
                {momentumAssets.length > 0 ? (
                  <ul className="space-y-1">
                    {momentumAssets.map((stock) => (
                      <StockSidebarRow
                        key={stock.symbol}
                        stock={stock}
                        isSelected={selectedStock?.symbol === stock.symbol}
                        onSelect={() => setSelectedSymbol(stock.symbol)}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-center text-xs text-gray-400 dark:border-gray-800">
                    無僅符合慣性改變的標的
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 底部操作提示 */}
        <div className="border-t border-gray-100 px-3.5 py-2 text-[11px] text-gray-400 dark:border-gray-800/80">
          快捷鍵：<kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">↑</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">↓</kbd> 切換股票 ·{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">1</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">2</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">3</kbd> 切換時框
        </div>
      </aside>

      {/* 右側主畫面：K 線圖檢視區 */}
      <section className="lg:col-span-8 xl:col-span-9">
        {selectedStock ? (
          <StockChart
            stock={selectedStock}
            activeInterval={activeInterval}
            onSelectInterval={(interval) => {
              setActiveInterval(interval)
              setViewMode('single')
            }}
            viewMode={viewMode}
            onToggleViewMode={() => setViewMode((prev) => (prev === 'single' ? 'multi' : 'single'))}
          />
        ) : (
          <div className="flex h-[480px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/50 p-8 text-center text-gray-500 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-sm">請從左側邊欄選擇一檔標的，或切換至另一個市場查看 K 線圖。</p>
          </div>
        )}
      </section>
    </div>
  )
}

function StockSidebarRow({
  stock,
  isSelected,
  onSelect,
}: {
  stock: StockAsset
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-500/30 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900'
        }`}
      >
        <span className="truncate pr-2">{stock.name}</span>
        <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
          {stock.symbol}
        </span>
      </button>
    </li>
  )
}
