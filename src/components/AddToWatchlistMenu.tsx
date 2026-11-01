'use client'

import { useState, useRef, useEffect, type FormEvent } from 'react'
import type { StockAsset, WatchlistWithDetails } from '@/lib/types'
import {
  canAddWatchlistItem,
  canCreateWatchlist,
  MAX_ITEMS_PER_WATCHLIST,
  validateEntityName,
} from '@/lib/watchlist-utils'

export interface AddToWatchlistMenuProps {
  stock: StockAsset
  watchlists: WatchlistWithDetails[]
  onSelectStock: () => void
  onAddToWatchlist: (watchlistId: string, stock: StockAsset) => void
  onCreateWatchlistAndAdd?: (watchlistName: string, stock: StockAsset) => void
}

export default function AddToWatchlistMenu({
  stock,
  watchlists,
  onSelectStock,
  onAddToWatchlist,
  onCreateWatchlistAndAdd,
}: AddToWatchlistMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleToggle = () => {
    // 點擊 + 按鈕時必須同時切換右側 K 線圖至該標的
    onSelectStock()
    setIsOpen((prev) => !prev)
    setErrorMsg(null)
  }

  const handleSelectWatchlist = (watchlistId: string) => {
    onAddToWatchlist(watchlistId, stock)
    setIsOpen(false)
  }

  const handleCreateAndAdd = (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    try {
      const validName = validateEntityName(newListName)
      onCreateWatchlistAndAdd?.(validName, stock)
      setNewListName('')
      setIsOpen(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '建立失敗')
    }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`加入觀察清單：${stock.name}`}
        onClick={handleToggle}
        className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-bold text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-950 dark:hover:text-blue-400"
      >
        +
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={`選擇觀察清單：${stock.name}`}
          className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-950"
        >
          <div className="mb-1.5 border-b border-gray-100 px-2 pb-1 text-[11px] font-semibold text-gray-500 dark:border-gray-800 dark:text-gray-400">
            加入觀察清單（{stock.symbol}）
          </div>

          {watchlists.length === 0 ? (
            <div className="px-2 py-2 text-xs text-gray-400">尚無觀察清單</div>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {watchlists.map((wl) => {
                const check = canAddWatchlistItem(wl.items, stock.symbol)
                const isDuplicate = check.reason === 'duplicate'
                const isFull = check.reason === 'full'

                return (
                  <button
                    key={wl.id}
                    type="button"
                    disabled={!check.allowed}
                    onClick={() => handleSelectWatchlist(wl.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors enabled:hover:bg-blue-50 enabled:hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:enabled:hover:bg-blue-950/60 dark:enabled:hover:text-blue-300"
                  >
                    <span className="truncate pr-2 font-medium">{wl.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-gray-400">
                      {isDuplicate
                        ? '✓ 已加入'
                        : isFull
                          ? '已滿'
                          : `${wl.items.length}/${MAX_ITEMS_PER_WATCHLIST}`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {onCreateWatchlistAndAdd && canCreateWatchlist(watchlists.length) && (
            <form
              onSubmit={handleCreateAndAdd}
              className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800"
            >
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="新清單名稱..."
                  aria-label="新觀察清單名稱"
                  className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  新增
                </button>
              </div>
              {errorMsg && <p className="mt-1 text-[11px] text-red-500">{errorMsg}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  )
}
