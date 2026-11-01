import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AddToWatchlistMenu from '@/components/AddToWatchlistMenu'
import type { StockAsset, WatchlistWithDetails } from '@/lib/types'

const sampleStock: StockAsset = {
  symbol: '2330.TW',
  name: '台積電',
  market: 'TWSE',
  matchLevel: 'strict',
  tradingViewUrl: 'https://tw.tradingview.com/chart/?symbol=TWSE:2330',
}

const sampleWatchlists: WatchlistWithDetails[] = [
  {
    id: 'wl-1',
    user_id: 'u1',
    name: '台股波段',
    sort_order: 0,
    created_at: '',
    updated_at: '',
    groups: [],
    items: [],
  },
  {
    id: 'wl-2',
    user_id: 'u1',
    name: '已含台積電清單',
    sort_order: 1,
    created_at: '',
    updated_at: '',
    groups: [],
    items: [
      {
        id: 'i-1',
        watchlist_id: 'wl-2',
        group_id: null,
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        sort_order: 0,
        created_at: '',
      },
    ],
  },
]

describe('AddToWatchlistMenu', () => {
  it('switches K-line chart immediately on clicking + and adds stock to selected watchlist bottom', () => {
    const onSelectStock = vi.fn()
    const onAddToWatchlist = vi.fn()
    const onCreateWatchlistAndAdd = vi.fn()

    render(
      <AddToWatchlistMenu
        stock={sampleStock}
        watchlists={sampleWatchlists}
        onSelectStock={onSelectStock}
        onAddToWatchlist={onAddToWatchlist}
        onCreateWatchlistAndAdd={onCreateWatchlistAndAdd}
      />
    )

    // 點擊 + 按鈕時必須同時觸發 onSelectStock 以切換右側 K 線圖
    fireEvent.click(screen.getByRole('button', { name: /加入觀察清單：台積電/ }))
    expect(onSelectStock).toHaveBeenCalledTimes(1)

    // 已存在的清單顯示「✓ 已加入」並禁用
    const duplicateOption = screen.getByRole('button', { name: /已含台積電清單/ })
    expect(duplicateOption).toBeDisabled()
    expect(duplicateOption.textContent).toContain('已加入')

    // 點擊可用清單將標的加入該觀察清單底部
    fireEvent.click(screen.getByRole('button', { name: /台股波段/ }))
    expect(onAddToWatchlist).toHaveBeenCalledWith('wl-1', sampleStock)
  })
})
