import { describe, it, expect } from 'vitest'
import {
  MAX_WATCHLISTS,
  MAX_GROUPS_PER_WATCHLIST,
  MAX_ITEMS_PER_WATCHLIST,
  validateEntityName,
  canCreateWatchlist,
  canCreateGroup,
  canAddWatchlistItem,
  reorderGroups,
  moveOrReorderItem,
  dissolveGroupToUngrouped,
  getOrderedWatchlistAssets,
} from '@/lib/watchlist-utils'
import type { WatchlistGroup, WatchlistItem, WatchlistWithDetails } from '@/lib/types'

describe('watchlist-utils', () => {
  it('enforces 10 watchlists, 10 groups, and 100 items quota and prevents duplicate symbols', () => {
    expect(MAX_WATCHLISTS).toBe(10)
    expect(MAX_GROUPS_PER_WATCHLIST).toBe(10)
    expect(MAX_ITEMS_PER_WATCHLIST).toBe(100)

    expect(canCreateWatchlist(9)).toBe(true)
    expect(canCreateWatchlist(10)).toBe(false)
    expect(canCreateGroup(9)).toBe(true)
    expect(canCreateGroup(10)).toBe(false)

    const existingItems: WatchlistItem[] = [
      {
        id: 'item-1',
        watchlist_id: 'wl-1',
        group_id: null,
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        sort_order: 0,
        created_at: '2026-11-01T00:00:00Z',
      },
    ]
    expect(canAddWatchlistItem(existingItems, '2330.TW')).toEqual({
      allowed: false,
      reason: 'duplicate',
    })
    expect(canAddWatchlistItem(existingItems, '2317.TW')).toEqual({ allowed: true })

    const fullItems: WatchlistItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      watchlist_id: 'wl-1',
      group_id: null,
      symbol: `${1000 + i}.TW`,
      name: `Stock ${i}`,
      market: 'TWSE',
      sort_order: i,
      created_at: '2026-11-01T00:00:00Z',
    }))
    expect(canAddWatchlistItem(fullItems, '9999.TW')).toEqual({
      allowed: false,
      reason: 'full',
    })
  })

  it('trims and validates entity names between 1 and 50 characters', () => {
    expect(validateEntityName('  核心持股  ')).toBe('核心持股')
    expect(() => validateEntityName('   ')).toThrow('名稱不可為空白')
    expect(() => validateEntityName('a'.repeat(51))).toThrow('名稱不可超過 50 個字元')
  })

  it('reorders groups and moves internal items together in ordered asset output', () => {
    const groups: WatchlistGroup[] = [
      { id: 'g1', watchlist_id: 'wl-1', name: '半導體', sort_order: 0, created_at: '' },
      { id: 'g2', watchlist_id: 'wl-1', name: 'AI 伺服器', sort_order: 1, created_at: '' },
    ]
    const items: WatchlistItem[] = [
      {
        id: 'i1',
        watchlist_id: 'wl-1',
        group_id: 'g1',
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        sort_order: 0,
        created_at: '',
      },
      {
        id: 'i2',
        watchlist_id: 'wl-1',
        group_id: 'g2',
        symbol: '2382.TW',
        name: '廣達',
        market: 'TWSE',
        sort_order: 0,
        created_at: '',
      },
      {
        id: 'i3',
        watchlist_id: 'wl-1',
        group_id: null,
        symbol: 'NVDA',
        name: 'NVIDIA',
        market: 'US',
        sort_order: 0,
        created_at: '',
      },
    ]

    const reorderedGroups = reorderGroups(groups, 'g2', 'g1')
    expect(reorderedGroups.map((g) => g.id)).toEqual(['g2', 'g1'])

    const wl: WatchlistWithDetails = {
      id: 'wl-1',
      user_id: 'u1',
      name: '主力清單',
      sort_order: 0,
      created_at: '',
      updated_at: '',
      groups: reorderedGroups,
      items,
    }
    // 群組 g2 移至 g1 前方後，g2 內部標的 (2382.TW) 跟著排在 g1 標的 (2330.TW) 前方，未分類 (NVDA) 固定在最底部
    expect(getOrderedWatchlistAssets(wl).map((a) => a.symbol)).toEqual([
      '2382.TW',
      '2330.TW',
      'NVDA',
    ])
  })

  it('moves items across groups and dissolves deleted group items back to ungrouped bottom', () => {
    const groups: WatchlistGroup[] = [
      { id: 'g1', watchlist_id: 'wl-1', name: '群組一', sort_order: 0, created_at: '' },
    ]
    const items: WatchlistItem[] = [
      {
        id: 'i1',
        watchlist_id: 'wl-1',
        group_id: 'g1',
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        sort_order: 0,
        created_at: '',
      },
      {
        id: 'i2',
        watchlist_id: 'wl-1',
        group_id: null,
        symbol: '2317.TW',
        name: '鴻海',
        market: 'TWSE',
        sort_order: 0,
        created_at: '',
      },
    ]

    // 刪除 g1 後，i1 自動退回未分類 (group_id = null) 且排在既有未分類 i2 之後
    const dissolved = dissolveGroupToUngrouped(groups, items, 'g1')
    expect(dissolved.groups).toHaveLength(0)
    expect(dissolved.items.every((i) => i.group_id === null)).toBe(true)
    expect(dissolved.items.map((i) => i.symbol)).toEqual(['2317.TW', '2330.TW'])

    // 將 i1 拖曳至 i2 前方
    const reordered = moveOrReorderItem(dissolved.items, 'i1', null, 'i2')
    expect(reordered.map((i) => i.symbol)).toEqual(['2330.TW', '2317.TW'])
  })
})
