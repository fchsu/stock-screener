'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  StockAsset,
  Watchlist,
  WatchlistGroup,
  WatchlistItem,
  WatchlistWithDetails,
} from '@/lib/types'
import {
  validateEntityName,
  canCreateWatchlist,
  canCreateGroup,
  canAddWatchlistItem,
  reorderGroups,
  moveOrReorderItem,
  dissolveGroupToUngrouped,
} from '@/lib/watchlist-utils'

export const fetchWatchlists = async (userId: string): Promise<WatchlistWithDetails[]> => {
  const { data: watchlistsData, error: wlError } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (wlError) {
    throw new Error(wlError.message)
  }

  const watchlists = (watchlistsData ?? []) as unknown as Watchlist[]
  if (watchlists.length === 0) return []

  const watchlistIds = watchlists.map((w) => w.id)

  const [{ data: groupsData, error: grpError }, { data: itemsData, error: itemError }] =
    await Promise.all([
      supabase
        .from('watchlist_groups')
        .select('*')
        .in('watchlist_id', watchlistIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('watchlist_items')
        .select('*')
        .in('watchlist_id', watchlistIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

  if (grpError) throw new Error(grpError.message)
  if (itemError) throw new Error(itemError.message)

  const groups = (groupsData ?? []) as unknown as WatchlistGroup[]
  const items = (itemsData ?? []) as unknown as WatchlistItem[]

  return watchlists.map((wl) => ({
    ...wl,
    groups: groups
      .filter((g) => g.watchlist_id === wl.id)
      .sort((a, b) => a.sort_order - b.sort_order),
    items: items
      .filter((i) => i.watchlist_id === wl.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export const useWatchlists = (userId: string | null | undefined) => {
  return useQuery({
    queryKey: ['watchlists', userId],
    queryFn: () => fetchWatchlists(userId!),
    enabled: Boolean(userId),
    staleTime: Infinity,
  })
}

export const useWatchlistMutations = (userId: string | null | undefined) => {
  const queryClient = useQueryClient()
  const queryKey = ['watchlists', userId]

  const getCached = (): WatchlistWithDetails[] => {
    return queryClient.getQueryData<WatchlistWithDetails[]>(queryKey) ?? []
  }

  const setCached = (updater: (prev: WatchlistWithDetails[]) => WatchlistWithDetails[]) => {
    queryClient.setQueryData<WatchlistWithDetails[]>(queryKey, (old) => updater(old ?? []))
  }

  const createWatchlist = useMutation({
    mutationFn: async (rawName: string): Promise<WatchlistWithDetails> => {
      if (!userId) throw new Error('請先登入')
      const name = validateEntityName(rawName)
      const current = getCached()
      if (!canCreateWatchlist(current.length)) {
        throw new Error('每個帳號最多只能建立 10 個觀察清單')
      }

      const sortOrder = current.length
      const { data, error } = await supabase
        .from('watchlists')
        .insert({ user_id: userId, name, sort_order: sortOrder })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      const created = data as unknown as Watchlist
      return { ...created, groups: [], items: [] }
    },
    onSuccess: (created) => {
      setCached((prev) => [...prev, created])
    },
  })

  const renameWatchlist = useMutation({
    mutationFn: async ({ watchlistId, name: rawName }: { watchlistId: string; name: string }) => {
      const name = validateEntityName(rawName)
      setCached((prev) => prev.map((wl) => (wl.id === watchlistId ? { ...wl, name } : wl)))
      const { error } = await supabase
        .from('watchlists')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', watchlistId)
      if (error) throw new Error(error.message)
    },
  })

  const deleteWatchlist = useMutation({
    mutationFn: async (watchlistId: string) => {
      setCached((prev) => prev.filter((wl) => wl.id !== watchlistId))
      const { error } = await supabase.from('watchlists').delete().eq('id', watchlistId)
      if (error) throw new Error(error.message)
    },
  })

  const createGroup = useMutation({
    mutationFn: async ({ watchlistId, name: rawName }: { watchlistId: string; name: string }) => {
      const name = validateEntityName(rawName)
      const current = getCached().find((wl) => wl.id === watchlistId)
      if (current && !canCreateGroup(current.groups.length)) {
        throw new Error('每個觀察清單最多只能建立 10 個群組')
      }
      const sortOrder = current ? current.groups.length : 0
      const { data, error } = await supabase
        .from('watchlist_groups')
        .insert({ watchlist_id: watchlistId, name, sort_order: sortOrder })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as unknown as WatchlistGroup
    },
    onSuccess: (createdGroup) => {
      setCached((prev) =>
        prev.map((wl) =>
          wl.id === createdGroup.watchlist_id ? { ...wl, groups: [...wl.groups, createdGroup] } : wl
        )
      )
    },
  })

  const renameGroup = useMutation({
    mutationFn: async ({
      watchlistId,
      groupId,
      name: rawName,
    }: {
      watchlistId: string
      groupId: string
      name: string
    }) => {
      const name = validateEntityName(rawName)
      setCached((prev) =>
        prev.map((wl) =>
          wl.id === watchlistId
            ? {
                ...wl,
                groups: wl.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
              }
            : wl
        )
      )
      const { error } = await supabase.from('watchlist_groups').update({ name }).eq('id', groupId)
      if (error) throw new Error(error.message)
    },
  })

  const deleteGroup = useMutation({
    mutationFn: async ({ watchlistId, groupId }: { watchlistId: string; groupId: string }) => {
      // 刪除群組時，內部標的自動退回「未分類 (group_id = null)」底部
      setCached((prev) =>
        prev.map((wl) => {
          if (wl.id !== watchlistId) return wl
          const dissolved = dissolveGroupToUngrouped(wl.groups, wl.items, groupId)
          return { ...wl, groups: dissolved.groups, items: dissolved.items }
        })
      )
      const { error } = await supabase.from('watchlist_groups').delete().eq('id', groupId)
      if (error) throw new Error(error.message)
    },
  })

  const addItem = useMutation({
    mutationFn: async ({
      watchlistId,
      stock,
    }: {
      watchlistId: string
      stock: StockAsset
    }): Promise<WatchlistItem> => {
      const targetWl = getCached().find((wl) => wl.id === watchlistId)
      if (targetWl) {
        const check = canAddWatchlistItem(targetWl.items, stock.symbol)
        if (!check.allowed) {
          throw new Error(
            check.reason === 'duplicate'
              ? '此標的已存在於該觀察清單中'
              : '每個觀察清單最多只能加入 100 檔標的'
          )
        }
      }

      const ungroupedCount = targetWl ? targetWl.items.filter((i) => i.group_id === null).length : 0

      const { data, error } = await supabase
        .from('watchlist_items')
        .insert({
          watchlist_id: watchlistId,
          group_id: null,
          symbol: stock.symbol,
          name: stock.name,
          market: stock.market,
          sort_order: ungroupedCount,
        })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as WatchlistItem
    },
    onSuccess: (createdItem) => {
      setCached((prev) =>
        prev.map((wl) =>
          wl.id === createdItem.watchlist_id ? { ...wl, items: [...wl.items, createdItem] } : wl
        )
      )
    },
  })

  const removeItem = useMutation({
    mutationFn: async ({ watchlistId, itemId }: { watchlistId: string; itemId: string }) => {
      setCached((prev) =>
        prev.map((wl) =>
          wl.id === watchlistId ? { ...wl, items: wl.items.filter((i) => i.id !== itemId) } : wl
        )
      )
      const { error } = await supabase.from('watchlist_items').delete().eq('id', itemId)
      if (error) throw new Error(error.message)
    },
  })

  const reorderGroupsMutation = useMutation({
    mutationFn: async ({
      watchlistId,
      activeGroupId,
      overGroupId,
    }: {
      watchlistId: string
      activeGroupId: string
      overGroupId: string
    }) => {
      let updatedGroups: WatchlistGroup[] = []
      setCached((prev) =>
        prev.map((wl) => {
          if (wl.id !== watchlistId) return wl
          updatedGroups = reorderGroups(wl.groups, activeGroupId, overGroupId)
          return { ...wl, groups: updatedGroups }
        })
      )
      await Promise.all(
        updatedGroups.map((g) =>
          supabase.from('watchlist_groups').update({ sort_order: g.sort_order }).eq('id', g.id)
        )
      )
    },
  })

  const moveOrReorderItemMutation = useMutation({
    mutationFn: async ({
      watchlistId,
      activeItemId,
      targetGroupId,
      overItemId,
    }: {
      watchlistId: string
      activeItemId: string
      targetGroupId: string | null
      overItemId?: string | null
    }) => {
      let updatedItems: WatchlistItem[] = []
      setCached((prev) =>
        prev.map((wl) => {
          if (wl.id !== watchlistId) return wl
          updatedItems = moveOrReorderItem(wl.items, activeItemId, targetGroupId, overItemId)
          return { ...wl, items: updatedItems }
        })
      )
      await Promise.all(
        updatedItems.map((item) =>
          supabase
            .from('watchlist_items')
            .update({ group_id: item.group_id, sort_order: item.sort_order })
            .eq('id', item.id)
        )
      )
    },
  })

  return {
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    createGroup,
    renameGroup,
    deleteGroup,
    addItem,
    removeItem,
    reorderGroups: reorderGroupsMutation,
    moveOrReorderItem: moveOrReorderItemMutation,
  }
}
