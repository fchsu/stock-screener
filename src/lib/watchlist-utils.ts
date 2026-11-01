import type {
  MarketType,
  StockAsset,
  WatchlistGroup,
  WatchlistItem,
  WatchlistWithDetails,
} from './types'

export const MAX_WATCHLISTS = 10
export const MAX_GROUPS_PER_WATCHLIST = 10
export const MAX_ITEMS_PER_WATCHLIST = 100
export const MAX_NAME_LENGTH = 50

export function validateEntityName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('名稱不可為空白')
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`名稱不可超過 ${MAX_NAME_LENGTH} 個字元`)
  }
  return trimmed
}

export function canCreateWatchlist(currentCount: number): boolean {
  return currentCount < MAX_WATCHLISTS
}

export function canCreateGroup(currentGroupCount: number): boolean {
  return currentGroupCount < MAX_GROUPS_PER_WATCHLIST
}

export function canAddWatchlistItem(
  items: WatchlistItem[],
  symbol: string
): { allowed: boolean; reason?: 'duplicate' | 'full' } {
  if (items.some((item) => item.symbol === symbol)) {
    return { allowed: false, reason: 'duplicate' }
  }
  if (items.length >= MAX_ITEMS_PER_WATCHLIST) {
    return { allowed: false, reason: 'full' }
  }
  return { allowed: true }
}

export function reorderGroups(
  groups: WatchlistGroup[],
  activeGroupId: string,
  overGroupId: string
): WatchlistGroup[] {
  if (activeGroupId === overGroupId) return groups
  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
  const oldIndex = sorted.findIndex((g) => g.id === activeGroupId)
  const newIndex = sorted.findIndex((g) => g.id === overGroupId)
  if (oldIndex === -1 || newIndex === -1) return groups

  const [moved] = sorted.splice(oldIndex, 1)
  sorted.splice(newIndex, 0, moved)

  return sorted.map((g, idx) => ({
    ...g,
    sort_order: idx,
  }))
}

export function moveOrReorderItem(
  items: WatchlistItem[],
  activeItemId: string,
  targetGroupId: string | null,
  overItemId?: string | null
): WatchlistItem[] {
  const activeItem = items.find((i) => i.id === activeItemId)
  if (!activeItem) return items

  const sourceGroupId = activeItem.group_id

  // 將所有標的依 group_id 拆成兩個桶（或保留其他群組不動），確保各群組內部 sort_order 重新正規化
  const bucketMap = new Map<string | null, WatchlistItem[]>()
  for (const item of items) {
    if (item.id === activeItemId) continue
    const list = bucketMap.get(item.group_id) ?? []
    list.push(item)
    bucketMap.set(item.group_id, list)
  }

  for (const [key, list] of bucketMap.entries()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
    bucketMap.set(key, list)
  }

  const targetBucket = bucketMap.get(targetGroupId) ?? []
  const updatedActiveItem: WatchlistItem = {
    ...activeItem,
    group_id: targetGroupId,
  }

  if (overItemId) {
    const overIndex = targetBucket.findIndex((i) => i.id === overItemId)
    if (overIndex !== -1) {
      // 同群組向下拖曳時，若原位置在目標上方，插入至目標後方；否則插入至目標位置
      const originalTargetList = items
        .filter((i) => i.group_id === targetGroupId)
        .sort((a, b) => a.sort_order - b.sort_order)
      const oldIdx = originalTargetList.findIndex((i) => i.id === activeItemId)
      const newIdx = originalTargetList.findIndex((i) => i.id === overItemId)
      if (sourceGroupId === targetGroupId && oldIdx !== -1 && newIdx !== -1 && oldIdx < newIdx) {
        targetBucket.splice(overIndex + 1, 0, updatedActiveItem)
      } else {
        targetBucket.splice(overIndex, 0, updatedActiveItem)
      }
    } else {
      targetBucket.push(updatedActiveItem)
    }
  } else {
    targetBucket.push(updatedActiveItem)
  }

  bucketMap.set(targetGroupId, targetBucket)

  const result: WatchlistItem[] = []
  for (const [, list] of bucketMap.entries()) {
    list.forEach((item, idx) => {
      result.push({
        ...item,
        sort_order: idx,
      })
    })
  }

  return result
}

export function dissolveGroupToUngrouped(
  groups: WatchlistGroup[],
  items: WatchlistItem[],
  groupId: string
): { groups: WatchlistGroup[]; items: WatchlistItem[] } {
  const remainingGroups = groups
    .filter((g) => g.id !== groupId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g, idx) => ({ ...g, sort_order: idx }))

  const existingUngrouped = items
    .filter((i) => i.group_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
  const dissolvedItems = items
    .filter((i) => i.group_id === groupId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ ...i, group_id: null }))
  const otherGroupItems = items.filter((i) => i.group_id !== null && i.group_id !== groupId)

  const mergedUngrouped = [...existingUngrouped, ...dissolvedItems].map((item, idx) => ({
    ...item,
    sort_order: idx,
  }))

  return {
    groups: remainingGroups,
    items: [...otherGroupItems, ...mergedUngrouped],
  }
}

export function buildTradingViewUrl(symbol: string, market: MarketType): string {
  if (market === 'TWSE' || symbol.endsWith('.TW')) {
    const cleanCode = symbol.replace(/\.TW$/i, '')
    return `https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:${cleanCode}`
  }
  return `https://tw.tradingview.com/chart/eEagIIPe/?symbol=${encodeURIComponent(symbol)}`
}

export function getOrderedWatchlistAssets(watchlist: WatchlistWithDetails): StockAsset[] {
  const sortedGroups = [...watchlist.groups].sort((a, b) => a.sort_order - b.sort_order)
  const orderedItems: WatchlistItem[] = []

  for (const group of sortedGroups) {
    const groupItems = watchlist.items
      .filter((item) => item.group_id === group.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    orderedItems.push(...groupItems)
  }

  const ungroupedItems = watchlist.items
    .filter((item) => item.group_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
  orderedItems.push(...ungroupedItems)

  return orderedItems.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    market: item.market,
    matchLevel: 'watchlist',
    tradingViewUrl: buildTradingViewUrl(item.symbol, item.market),
  }))
}
