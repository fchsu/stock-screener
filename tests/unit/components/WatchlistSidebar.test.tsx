import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import WatchlistSidebar, { handleWatchlistDragEnd } from '@/components/WatchlistSidebar'
import type { WatchlistWithDetails } from '@/lib/types'
import type { DragEndEvent } from '@dnd-kit/core'

const mockWatchlists: WatchlistWithDetails[] = [
  {
    id: 'wl-1',
    user_id: 'u-1',
    name: '核心觀察',
    sort_order: 0,
    created_at: '',
    updated_at: '',
    groups: [
      { id: 'g-1', watchlist_id: 'wl-1', name: '半導體', sort_order: 0, created_at: '' },
      { id: 'g-2', watchlist_id: 'wl-1', name: '金融股', sort_order: 1, created_at: '' },
    ],
    items: [
      {
        id: 'item-1',
        watchlist_id: 'wl-1',
        group_id: 'g-1',
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        sort_order: 0,
        created_at: '',
      },
      {
        id: 'item-2',
        watchlist_id: 'wl-1',
        group_id: null,
        symbol: 'NVDA',
        name: 'NVIDIA',
        market: 'US',
        sort_order: 0,
        created_at: '',
      },
    ],
  },
]

describe('WatchlistSidebar (@dnd-kit)', () => {
  it('supports creating/renaming watchlists and groups, and routes @dnd-kit group & item dragEnd events accurately', () => {
    const handlers = {
      onSelectWatchlistId: vi.fn(),
      onSelectStock: vi.fn(),
      onCreateWatchlist: vi.fn(),
      onRenameWatchlist: vi.fn(),
      onDeleteWatchlist: vi.fn(),
      onCreateGroup: vi.fn(),
      onRenameGroup: vi.fn(),
      onDeleteGroup: vi.fn(),
      onRemoveItem: vi.fn(),
      onReorderGroups: vi.fn(),
      onMoveOrReorderItem: vi.fn(),
    }

    render(
      <WatchlistSidebar
        watchlists={mockWatchlists}
        activeWatchlistId="wl-1"
        selectedSymbol="2330.TW"
        {...handlers}
      />
    )

    // 驗證顯示群組與底部「未分類」區塊，且群組內部包裹該群組標的
    const group1Section = screen.getByTestId('watchlist-group-g-1')
    expect(group1Section).toHaveTextContent('半導體')
    expect(group1Section).toHaveTextContent('台積電')
    expect(screen.getByText('金融股')).toBeInTheDocument()
    expect(screen.getByText(/未分類/)).toBeInTheDocument()

    // 驗證 @dnd-kit 拖曳群組 g-2 至 g-1：觸發 onReorderGroups('wl-1', 'g-2', 'g-1')
    handleWatchlistDragEnd(
      {
        active: { id: 'group:g-2', data: { current: { type: 'group', groupId: 'g-2' } } },
        over: { id: 'group:g-1', data: { current: { type: 'group', groupId: 'g-1' } } },
      } as unknown as DragEndEvent,
      'wl-1',
      handlers.onReorderGroups,
      handlers.onMoveOrReorderItem
    )
    expect(handlers.onReorderGroups).toHaveBeenCalledWith('wl-1', 'g-2', 'g-1')

    // 驗證 @dnd-kit 拖曳未分類標的 item-2 至群組 g-2：觸發 onMoveOrReorderItem('wl-1', 'item-2', 'g-2', null)
    handleWatchlistDragEnd(
      {
        active: { id: 'item:item-2', data: { current: { type: 'item', itemId: 'item-2' } } },
        over: { id: 'group:g-2', data: { current: { type: 'group', groupId: 'g-2' } } },
      } as unknown as DragEndEvent,
      'wl-1',
      handlers.onReorderGroups,
      handlers.onMoveOrReorderItem
    )
    expect(handlers.onMoveOrReorderItem).toHaveBeenCalledWith('wl-1', 'item-2', 'g-2', null)

    // 刪除群組 g-1：驗證觸發 onDeleteGroup('wl-1', 'g-1')
    fireEvent.click(screen.getByRole('button', { name: /刪除群組：半導體/ }))
    expect(handlers.onDeleteGroup).toHaveBeenCalledWith('wl-1', 'g-1')
  })
})
