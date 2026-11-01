'use client'

import { useState, type FormEvent } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { StockAsset, WatchlistGroup, WatchlistItem, WatchlistWithDetails } from '@/lib/types'
import {
  MAX_WATCHLISTS,
  MAX_GROUPS_PER_WATCHLIST,
  MAX_ITEMS_PER_WATCHLIST,
  canCreateWatchlist,
  canCreateGroup,
  buildTradingViewUrl,
  validateEntityName,
} from '@/lib/watchlist-utils'

export interface WatchlistSidebarProps {
  watchlists: WatchlistWithDetails[]
  activeWatchlistId: string | null
  onSelectWatchlistId: (id: string) => void
  selectedSymbol: string | null
  onSelectStock: (stock: StockAsset) => void
  onCreateWatchlist: (name: string) => void
  onRenameWatchlist: (watchlistId: string, name: string) => void
  onDeleteWatchlist: (watchlistId: string) => void
  onCreateGroup: (watchlistId: string, name: string) => void
  onRenameGroup: (watchlistId: string, groupId: string, name: string) => void
  onDeleteGroup: (watchlistId: string, groupId: string) => void
  onRemoveItem: (watchlistId: string, itemId: string) => void
  onReorderGroups: (watchlistId: string, activeGroupId: string, overGroupId: string) => void
  onMoveOrReorderItem: (
    watchlistId: string,
    activeItemId: string,
    targetGroupId: string | null,
    overItemId: string | null
  ) => void
}

export function handleWatchlistDragEnd(
  event: DragEndEvent,
  activeWatchlistId: string,
  onReorderGroups: WatchlistSidebarProps['onReorderGroups'],
  onMoveOrReorderItem: WatchlistSidebarProps['onMoveOrReorderItem']
): void {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const activeData = active.data.current as
    | { type: 'group'; groupId: string }
    | { type: 'item'; itemId: string; groupId: string | null }
    | undefined
  const overData = over.data.current as
    | { type: 'group'; groupId: string | null }
    | { type: 'item'; itemId: string; groupId: string | null }
    | undefined

  if (!activeData || !overData) return

  if (activeData.type === 'group') {
    const targetGroupId = overData.type === 'group' ? overData.groupId : overData.groupId
    if (targetGroupId && targetGroupId !== activeData.groupId) {
      onReorderGroups(activeWatchlistId, activeData.groupId, targetGroupId)
    }
    return
  }

  if (activeData.type === 'item') {
    if (overData.type === 'group') {
      onMoveOrReorderItem(activeWatchlistId, activeData.itemId, overData.groupId, null)
    } else if (overData.type === 'item') {
      onMoveOrReorderItem(activeWatchlistId, activeData.itemId, overData.groupId, overData.itemId)
    }
  }
}

export default function WatchlistSidebar({
  watchlists,
  activeWatchlistId,
  onSelectWatchlistId,
  selectedSymbol,
  onSelectStock,
  onCreateWatchlist,
  onRenameWatchlist,
  onDeleteWatchlist,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onRemoveItem,
  onReorderGroups,
  onMoveOrReorderItem,
}: WatchlistSidebarProps) {
  const [isCreatingList, setIsCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [isRenamingList, setIsRenamingList] = useState(false)
  const [renameListValue, setRenameListValue] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0] ?? null

  const handleCreateListSubmit = (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    try {
      const valid = validateEntityName(newListName)
      onCreateWatchlist(valid)
      setNewListName('')
      setIsCreatingList(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '建立清單失敗')
    }
  }

  const handleRenameListSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!activeWatchlist) return
    setErrorMsg(null)
    try {
      const valid = validateEntityName(renameListValue)
      onRenameWatchlist(activeWatchlist.id, valid)
      setIsRenamingList(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '重新命名失敗')
    }
  }

  const handleCreateGroupSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!activeWatchlist) return
    setErrorMsg(null)
    try {
      const valid = validateEntityName(newGroupName)
      onCreateGroup(activeWatchlist.id, valid)
      setNewGroupName('')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '建立群組失敗')
    }
  }

  const sortedGroups = activeWatchlist
    ? [...activeWatchlist.groups].sort((a, b) => a.sort_order - b.sort_order)
    : []
  const ungroupedItems = activeWatchlist
    ? activeWatchlist.items
        .filter((i) => i.group_id === null)
        .sort((a, b) => a.sort_order - b.sort_order)
    : []

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 觀察清單選擇與管理區 */}
      <div className="shrink-0 space-y-2 border-b border-gray-100 px-3 py-2 text-xs dark:border-gray-800/80">
        <div className="flex items-center justify-between gap-1.5">
          {watchlists.length > 0 ? (
            <select
              aria-label="選擇觀察清單"
              value={activeWatchlist?.id ?? ''}
              onChange={(e) => {
                onSelectWatchlistId(e.target.value)
                setIsRenamingList(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {watchlists.map((wl) => (
                <option key={wl.id} value={wl.id}>
                  {wl.name} ({wl.items.length}/{MAX_ITEMS_PER_WATCHLIST})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-400">尚未建立觀察清單</span>
          )}

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!canCreateWatchlist(watchlists.length)}
              onClick={() => {
                setIsCreatingList((prev) => !prev)
                setIsRenamingList(false)
                setErrorMsg(null)
              }}
              title={`新增觀察清單 (${watchlists.length}/${MAX_WATCHLISTS})`}
              className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              ＋清單
            </button>
            {activeWatchlist && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRenameListValue(activeWatchlist.name)
                    setIsRenamingList((prev) => !prev)
                    setIsCreatingList(false)
                    setErrorMsg(null)
                  }}
                  aria-label="重新命名觀察清單"
                  className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  改名
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteWatchlist(activeWatchlist.id)}
                  aria-label="刪除觀察清單"
                  className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:border-gray-700 dark:bg-gray-900 dark:text-red-400"
                >
                  刪除
                </button>
              </>
            )}
          </div>
        </div>

        {isCreatingList && (
          <form onSubmit={handleCreateListSubmit} className="flex gap-1">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="輸入新觀察清單名稱..."
              aria-label="輸入新觀察清單名稱"
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
            >
              儲存清單
            </button>
          </form>
        )}

        {isRenamingList && activeWatchlist && (
          <form onSubmit={handleRenameListSubmit} className="flex gap-1">
            <input
              type="text"
              value={renameListValue}
              onChange={(e) => setRenameListValue(e.target.value)}
              aria-label="修改觀察清單名稱"
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
            >
              確認改名
            </button>
          </form>
        )}

        {/* 新增群組輸入列 */}
        {activeWatchlist && (
          <form onSubmit={handleCreateGroupSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              disabled={!canCreateGroup(activeWatchlist.groups.length)}
              placeholder={
                canCreateGroup(activeWatchlist.groups.length)
                  ? `新增群組 (${activeWatchlist.groups.length}/${MAX_GROUPS_PER_WATCHLIST})...`
                  : '已達 10 個群組上限'
              }
              aria-label="新增群組名稱"
              className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="submit"
              disabled={!canCreateGroup(activeWatchlist.groups.length)}
              className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              ＋群組
            </button>
          </form>
        )}

        {errorMsg && (
          <p className="text-[11px] text-red-500" role="alert">
            {errorMsg}
          </p>
        )}
      </div>

      {/* 群組與標的雙層 @dnd-kit 拖曳列表區 */}
      <div className="relative min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2">
        {!activeWatchlist ? (
          <div className="rounded-lg bg-gray-50 p-4 text-center text-xs text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
            請點擊上方「＋清單」建立你的第一個觀察清單。
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) =>
              handleWatchlistDragEnd(
                event,
                activeWatchlist.id,
                onReorderGroups,
                onMoveOrReorderItem
              )
            }
          >
            {/* 外層 SortableContext：管理自訂群組排序（每個群組容器包含其內部標的，拖曳群組時內部標的一併跟隨移動） */}
            <SortableContext
              items={sortedGroups.map((g) => `group:${g.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2.5">
                {sortedGroups.map((group) => {
                  const groupItems = activeWatchlist.items
                    .filter((i) => i.group_id === group.id)
                    .sort((a, b) => a.sort_order - b.sort_order)

                  return (
                    <SortableGroupSection
                      key={group.id}
                      watchlistId={activeWatchlist.id}
                      group={group}
                      items={groupItems}
                      selectedSymbol={selectedSymbol}
                      onSelectStock={onSelectStock}
                      onRenameGroup={onRenameGroup}
                      onDeleteGroup={onDeleteGroup}
                      onRemoveItem={onRemoveItem}
                    />
                  )
                })}
              </div>
            </SortableContext>

            {/* 底部固定「未分類」板塊 */}
            <UngroupedSection
              watchlistId={activeWatchlist.id}
              items={ungroupedItems}
              selectedSymbol={selectedSymbol}
              onSelectStock={onSelectStock}
              onRemoveItem={onRemoveItem}
            />
          </DndContext>
        )}
      </div>
    </div>
  )
}

function SortableGroupSection({
  watchlistId,
  group,
  items,
  selectedSymbol,
  onSelectStock,
  onRenameGroup,
  onDeleteGroup,
  onRemoveItem,
}: {
  watchlistId: string
  group: WatchlistGroup
  items: WatchlistItem[]
  selectedSymbol: string | null
  onSelectStock: (stock: StockAsset) => void
  onRenameGroup: (watchlistId: string, groupId: string, name: string) => void
  onDeleteGroup: (watchlistId: string, groupId: string) => void
  onRemoveItem: (watchlistId: string, itemId: string) => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(group.name)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group:${group.id}`,
    data: { type: 'group', groupId: group.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const handleRenameSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = renameVal.trim()
    if (!trimmed) return
    onRenameGroup(watchlistId, group.id, trimmed)
    setIsRenaming(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`watchlist-group-${group.id}`}
      className="rounded-lg border border-gray-200 bg-gray-50/60 p-1.5 dark:border-gray-800 dark:bg-gray-900/40"
    >
      <div className="flex items-center justify-between gap-1 border-b border-gray-200/70 px-1 pb-1 dark:border-gray-800">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            aria-label={`拖曳排序群組：${group.name}`}
            className="cursor-grab touch-none px-1 text-xs text-gray-400 hover:text-gray-600 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>

          {isRenaming ? (
            <form onSubmit={handleRenameSubmit} className="flex min-w-0 flex-1 gap-1">
              <input
                type="text"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                aria-label={`修改群組名稱：${group.name}`}
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white"
              >
                儲存
              </button>
            </form>
          ) : (
            <h4 className="truncate text-xs font-bold text-gray-700 dark:text-gray-200">
              {group.name}
            </h4>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] font-medium text-gray-400">{items.length}</span>
          <button
            type="button"
            onClick={() => {
              setRenameVal(group.name)
              setIsRenaming((prev) => !prev)
            }}
            aria-label={`重新命名群組：${group.name}`}
            className="px-1 text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => onDeleteGroup(watchlistId, group.id)}
            aria-label={`刪除群組：${group.name}`}
            className="px-1 text-[11px] text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 群組內部標的清單（隨群組容器一併移動） */}
      <SortableContext
        items={items.map((i) => `item:${i.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {items.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {items.map((item) => (
              <SortableWatchlistItem
                key={item.id}
                watchlistId={watchlistId}
                item={item}
                isSelected={selectedSymbol === item.symbol}
                onSelectStock={onSelectStock}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-1 rounded border border-dashed border-gray-200 py-2 text-center text-[11px] text-gray-400 dark:border-gray-800">
            將標的拖曳至此群組
          </div>
        )}
      </SortableContext>
    </div>
  )
}

function UngroupedSection({
  watchlistId,
  items,
  selectedSymbol,
  onSelectStock,
  onRemoveItem,
}: {
  watchlistId: string
  items: WatchlistItem[]
  selectedSymbol: string | null
  onSelectStock: (stock: StockAsset) => void
  onRemoveItem: (watchlistId: string, itemId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'group:ungrouped',
    data: { type: 'group', groupId: null },
  })

  return (
    <div
      ref={setNodeRef}
      data-testid="watchlist-group-ungrouped"
      className={`rounded-lg border p-1.5 transition-colors ${
        isOver
          ? 'border-blue-400 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950'
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-1 pb-1 dark:border-gray-800">
        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400">📁 未分類</h4>
        <span className="text-[11px] font-medium text-gray-400">{items.length}</span>
      </div>

      <SortableContext
        items={items.map((i) => `item:${i.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {items.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {items.map((item) => (
              <SortableWatchlistItem
                key={item.id}
                watchlistId={watchlistId}
                item={item}
                isSelected={selectedSymbol === item.symbol}
                onSelectStock={onSelectStock}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-1 rounded border border-dashed border-gray-200 py-2 text-center text-[11px] text-gray-400 dark:border-gray-800">
            尚無未分類標的
          </div>
        )}
      </SortableContext>
    </div>
  )
}

function SortableWatchlistItem({
  watchlistId,
  item,
  isSelected,
  onSelectStock,
  onRemoveItem,
}: {
  watchlistId: string
  item: WatchlistItem
  isSelected: boolean
  onSelectStock: (stock: StockAsset) => void
  onRemoveItem: (watchlistId: string, itemId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `item:${item.id}`,
    data: { type: 'item', itemId: item.id, groupId: item.group_id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`watchlist-item-${item.id}`}
      className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        isSelected
          ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-500/30 dark:bg-blue-950/60 dark:text-blue-300'
          : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      <button
        type="button"
        aria-label={`拖曳標的：${item.name}`}
        className="cursor-grab touch-none px-0.5 text-xs text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⋮
      </button>

      <button
        type="button"
        onClick={() =>
          onSelectStock({
            symbol: item.symbol,
            name: item.name,
            market: item.market,
            matchLevel: 'watchlist',
            tradingViewUrl: buildTradingViewUrl(item.symbol, item.market),
          })
        }
        className="flex min-w-0 flex-1 items-center justify-between text-left"
      >
        <span className="truncate pr-1.5 text-xs">{item.name}</span>
        <span className="shrink-0 font-mono text-[11px] text-gray-500 dark:text-gray-400">
          {item.symbol}
        </span>
      </button>

      <button
        type="button"
        aria-label={`移除標的：${item.name}`}
        onClick={() => onRemoveItem(watchlistId, item.id)}
        className="shrink-0 px-1 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
      >
        ×
      </button>
    </li>
  )
}
