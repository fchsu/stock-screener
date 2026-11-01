'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useScreeningResult } from '@/services/queries'
import { useWatchlists, useWatchlistMutations } from '@/services/watchlist-queries'
import StockChart, { type ChartViewMode } from '@/components/StockChart'
import AddToWatchlistMenu from '@/components/AddToWatchlistMenu'
import WatchlistSidebar from '@/components/WatchlistSidebar'
import type { StockAsset, ScreeningResult, WatchlistWithDetails } from '@/lib/types'
import type { ChartInterval } from '@/lib/ohlcv'
import type { AuthUser } from '@/services/auth'
import { getTaiwanDate } from '@/lib/utils'
import { getOrderedWatchlistAssets } from '@/lib/watchlist-utils'

type ActiveMarketTab = 'TWSE' | 'US' | 'WATCHLIST'

export default function StockList({
  date,
  initialData,
  user = null,
}: {
  date: string
  initialData?: ScreeningResult[]
  user?: AuthUser | null
}) {
  const { data, isLoading, isError } = useScreeningResult(date, initialData)
  const { data: watchlists = [] } = useWatchlists(user?.id)
  const mutations = useWatchlistMutations(user?.id)

  const [rawActiveMarket, setActiveMarket] = useState<ActiveMarketTab>('TWSE')
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [activeInterval, setActiveInterval] = useState<ChartInterval>('1d')
  const [viewMode, setViewMode] = useState<ChartViewMode>('single')

  // 若未登入或登出時原分頁為觀察清單，直接推導回退為台股分頁（避免在 Effect 中同步呼叫 setState）
  const activeMarket: ActiveMarketTab =
    !user && rawActiveMarket === 'WATCHLIST' ? 'TWSE' : rawActiveMarket

  const activeWatchlist: WatchlistWithDetails | null = useMemo(() => {
    if (watchlists.length === 0) return null
    if (activeWatchlistId) {
      const found = watchlists.find((w) => w.id === activeWatchlistId)
      if (found) return found
    }
    return watchlists[0]
  }, [watchlists, activeWatchlistId])

  const twseResult = useMemo(() => data?.find((item) => item.market === 'TWSE'), [data])
  const usResult = useMemo(
    () => data?.find((item) => ['NASDAQ', 'US', 'S&P 500', 'NYSE'].includes(item.market)),
    [data]
  )

  const currentResult = activeMarket === 'TWSE' ? twseResult : usResult

  const { strictAssets, momentumAssets, orderedAssets } = useMemo(() => {
    if (activeMarket === 'WATCHLIST') {
      const wlAssets = activeWatchlist ? getOrderedWatchlistAssets(activeWatchlist) : []
      return {
        strictAssets: [],
        momentumAssets: [],
        orderedAssets: wlAssets,
      }
    }

    const assets = currentResult?.status === 'completed' ? (currentResult.assets ?? []) : []
    const strict = assets.filter((s) => s.matchLevel === 'strict' || !s.matchLevel)
    const momentum = assets.filter((s) => s.matchLevel === 'momentum')
    return {
      strictAssets: strict,
      momentumAssets: momentum,
      orderedAssets: [...strict, ...momentum],
    }
  }, [activeMarket, activeWatchlist, currentResult])

  const selectedStock: StockAsset | null = useMemo(() => {
    if (orderedAssets.length === 0) return null
    if (selectedSymbol) {
      const found = orderedAssets.find((s) => s.symbol === selectedSymbol)
      if (found) return found
    }
    return orderedAssets[0]
  }, [orderedAssets, selectedSymbol])

  // 支援鍵盤快捷鍵：上下鍵切換股票、左右鍵切換分頁、1/2/3 切換 60K/日K/週K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return
      }

      if (e.key === '1') {
        setActiveInterval('60m')
        if (viewMode === 'multi') setViewMode('single')
        return
      }
      if (e.key === '2') {
        setActiveInterval('1d')
        if (viewMode === 'multi') setViewMode('single')
        return
      }
      if (e.key === '3') {
        setActiveInterval('1wk')
        if (viewMode === 'multi') setViewMode('single')
        return
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        setActiveMarket((prev) => {
          const tabs: ActiveMarketTab[] = user ? ['TWSE', 'US', 'WATCHLIST'] : ['TWSE', 'US']
          const currentIdx = Math.max(0, tabs.indexOf(prev))
          const delta = e.key === 'ArrowRight' ? 1 : -1
          return tabs[(currentIdx + delta + tabs.length) % tabs.length]
        })
        setSelectedSymbol(null)
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
  }, [orderedAssets, selectedStock, viewMode, user])

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

  const handleAddToWatchlist = (watchlistId: string, stock: StockAsset) => {
    mutations.addItem.mutate({ watchlistId, stock })
  }

  const handleCreateWatchlistAndAdd = async (watchlistName: string, stock: StockAsset) => {
    const created = await mutations.createWatchlist.mutateAsync(watchlistName)
    if (created?.id) {
      setActiveWatchlistId(created.id)
      mutations.addItem.mutate({ watchlistId: created.id, stock })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden lg:flex-row">
      {/* 左側邊欄：市場切換 + 條列式雙群組清單／自選觀察清單 */}
      <aside className="flex max-h-60 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs lg:max-h-none lg:w-64 xl:w-72 dark:border-gray-800 dark:bg-gray-950">
        {/* 台股 / 美股 / (已登入時顯示 ★ 清單) 切換 Tab */}
        <div
          className={`grid shrink-0 gap-1 border-b border-gray-200 bg-gray-100/70 p-1 dark:border-gray-800 dark:bg-gray-900/70 ${
            user ? 'grid-cols-3' : 'grid-cols-2'
          }`}
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
            className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              activeMarket === 'TWSE'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span>台股</span>
            <span className="rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-300">
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
            className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              activeMarket === 'US'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span>美股</span>
            <span className="rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {usCount}
            </span>
          </button>

          {user && (
            <button
              type="button"
              role="tab"
              aria-selected={activeMarket === 'WATCHLIST'}
              onClick={() => {
                setActiveMarket('WATCHLIST')
                setSelectedSymbol(null)
              }}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                activeMarket === 'WATCHLIST'
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <span>★ 清單</span>
            </button>
          )}
        </div>

        {activeMarket === 'WATCHLIST' && user ? (
          <WatchlistSidebar
            watchlists={watchlists}
            activeWatchlistId={activeWatchlist?.id ?? null}
            onSelectWatchlistId={(id) => {
              setActiveWatchlistId(id)
              setSelectedSymbol(null)
            }}
            selectedSymbol={selectedStock?.symbol ?? null}
            onSelectStock={(stock) => setSelectedSymbol(stock.symbol)}
            onCreateWatchlist={(name) => {
              void mutations.createWatchlist.mutateAsync(name).then((created) => {
                if (created?.id) setActiveWatchlistId(created.id)
              })
            }}
            onRenameWatchlist={(watchlistId, name) =>
              mutations.renameWatchlist.mutate({ watchlistId, name })
            }
            onDeleteWatchlist={(watchlistId) => {
              mutations.deleteWatchlist.mutate(watchlistId)
              if (activeWatchlistId === watchlistId) setActiveWatchlistId(null)
            }}
            onCreateGroup={(watchlistId, name) =>
              mutations.createGroup.mutate({ watchlistId, name })
            }
            onRenameGroup={(watchlistId, groupId, name) =>
              mutations.renameGroup.mutate({ watchlistId, groupId, name })
            }
            onDeleteGroup={(watchlistId, groupId) =>
              mutations.deleteGroup.mutate({ watchlistId, groupId })
            }
            onRemoveItem={(watchlistId, itemId) =>
              mutations.removeItem.mutate({ watchlistId, itemId })
            }
            onReorderGroups={(watchlistId, activeGroupId, overGroupId) =>
              mutations.reorderGroups.mutate({ watchlistId, activeGroupId, overGroupId })
            }
            onMoveOrReorderItem={(watchlistId, activeItemId, targetGroupId, overItemId) =>
              mutations.moveOrReorderItem.mutate({
                watchlistId,
                activeItemId,
                targetGroupId,
                overItemId,
              })
            }
          />
        ) : (
          <>
            {/* 市場資料基準說明列 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-500 dark:border-gray-800/80 dark:text-gray-400">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {badgeText}
              </span>
              {tradingDate && <span>資料基準日：{tradingDate}</span>}
            </div>

            {/* 清單內容區（唯一垂直捲動區，scroll-pt-8 避免向上切換時被 sticky 群組標題遮擋） */}
            <div className="relative min-h-0 flex-1 scroll-pt-8 space-y-2 overflow-y-auto px-2.5 pb-2.5">
              {!currentResult && (
                <div className="mt-2.5 rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                  無此市場篩選紀錄
                </div>
              )}

              {currentResult?.status === 'fetching' && (
                <div className="mt-2.5 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  資料抓取中...
                </div>
              )}

              {currentResult?.status === 'failed' && (
                <div className="mt-2.5 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  抓取失敗
                </div>
              )}

              {currentResult?.status === 'closed' && (
                <div className="mt-2.5 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                  {closedNotice}
                </div>
              )}

              {currentResult?.status === 'completed' && orderedAssets.length === 0 && (
                <div className="mt-2.5 rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                  無符合條件的股票
                </div>
              )}

              {currentResult?.status === 'completed' && orderedAssets.length > 0 && (
                <>
                  {/* 群組 1：標準圖（群組範圍內 sticky top-0，滑至下一群組時自動替換） */}
                  <div>
                    <div
                      data-testid="sticky-group-header"
                      className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-1 py-1.5 backdrop-blur-xs dark:border-gray-800/80 dark:bg-gray-950/95"
                    >
                      <h3 className="text-xs font-bold tracking-wider text-gray-600 uppercase dark:text-gray-300">
                        🎯 標準圖
                      </h3>
                      <span className="text-xs font-medium text-gray-400">
                        {strictAssets.length}
                      </span>
                    </div>
                    {strictAssets.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {strictAssets.map((stock) => (
                          <StockSidebarRow
                            key={stock.symbol}
                            stock={stock}
                            isSelected={selectedStock?.symbol === stock.symbol}
                            onSelect={() => setSelectedSymbol(stock.symbol)}
                            showWatchlistAction={Boolean(user)}
                            watchlists={watchlists}
                            onAddToWatchlist={handleAddToWatchlist}
                            onCreateWatchlistAndAdd={(name, s) =>
                              void handleCreateWatchlistAndAdd(name, s)
                            }
                          />
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-center text-xs text-gray-400 dark:border-gray-800">
                        無完全符合標準圖的標的
                      </div>
                    )}
                  </div>

                  {/* 群組 2：慣性改變（群組範圍內 sticky top-0，僅固定當前顯示中的群組標題） */}
                  <div>
                    <div
                      data-testid="sticky-group-header"
                      className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-1 py-1.5 backdrop-blur-xs dark:border-gray-800/80 dark:bg-gray-950/95"
                    >
                      <h3 className="text-xs font-bold tracking-wider text-gray-600 uppercase dark:text-gray-300">
                        🌊 慣性改變
                      </h3>
                      <span className="text-xs font-medium text-gray-400">
                        {momentumAssets.length}
                      </span>
                    </div>
                    {momentumAssets.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {momentumAssets.map((stock) => (
                          <StockSidebarRow
                            key={stock.symbol}
                            stock={stock}
                            isSelected={selectedStock?.symbol === stock.symbol}
                            onSelect={() => setSelectedSymbol(stock.symbol)}
                            showWatchlistAction={Boolean(user)}
                            watchlists={watchlists}
                            onAddToWatchlist={handleAddToWatchlist}
                            onCreateWatchlistAndAdd={(name, s) =>
                              void handleCreateWatchlistAndAdd(name, s)
                            }
                          />
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-center text-xs text-gray-400 dark:border-gray-800">
                        無僅符合慣性改變的標的
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* 底部操作提示 */}
        <div className="shrink-0 border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400 dark:border-gray-800/80">
          快捷鍵：<kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">↑</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">↓</kbd> 選股 ·{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">←</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">→</kbd> 分頁 ·{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">1</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">2</kbd>{' '}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-800">3</kbd> 時框
        </div>
      </aside>

      {/* 右側主畫面：K 線圖檢視區（自動填滿剩餘寬高） */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {selectedStock ? (
          <StockChart
            stock={selectedStock}
            activeInterval={activeInterval}
            onSelectInterval={(interval) => {
              setActiveInterval(interval)
              if (viewMode === 'multi') setViewMode('single')
            }}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/50 p-8 text-center text-gray-500 dark:border-gray-800 dark:bg-gray-950/50">
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
  showWatchlistAction,
  watchlists,
  onAddToWatchlist,
  onCreateWatchlistAndAdd,
}: {
  stock: StockAsset
  isSelected: boolean
  onSelect: () => void
  showWatchlistAction: boolean
  watchlists: WatchlistWithDetails[]
  onAddToWatchlist: (watchlistId: string, stock: StockAsset) => void
  onCreateWatchlistAndAdd: (watchlistName: string, stock: StockAsset) => void
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (isSelected) {
      buttonRef.current?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [isSelected])

  return (
    <li className="scroll-mt-8">
      <div
        className={`flex w-full items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${
          isSelected
            ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-500/30 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900'
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center justify-between text-left text-sm"
        >
          <span className="truncate pr-2">{stock.name}</span>
          <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
            {stock.symbol}
          </span>
        </button>

        {showWatchlistAction && (
          <AddToWatchlistMenu
            stock={stock}
            watchlists={watchlists}
            onSelectStock={onSelect}
            onAddToWatchlist={onAddToWatchlist}
            onCreateWatchlistAndAdd={onCreateWatchlistAndAdd}
          />
        )}
      </div>
    </li>
  )
}
