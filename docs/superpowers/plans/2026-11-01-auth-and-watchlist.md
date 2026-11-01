# 登入系統與自選觀察清單（Watchlist） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為老余三問自動選股系統建立個人化登入系統與自選觀察清單（含 10 清單 / 10 群組 / 100 標的配額限制、雙層拖曳排序、篩選結果 `+` 快速加入並同步切換 K 線圖）。

**Architecture:** 採用 Supabase Auth（Email + Password）管理單一擁有者登入態，並以三張正規化 PostgreSQL 資料表（`watchlists`、`watchlist_groups`、`watchlist_items`）搭配 RLS 與配額 Trigger 儲存清單結構。前端於左側邊欄在登入後顯示第 3 個 `★ 清單` 分頁（未登入完全隱藏），透過 TanStack Query 快取與 `@dnd-kit`（`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`）實現群組連帶內部標的排序、跨板塊拖曳及點擊連動右側 K 線圖。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase (`@supabase/supabase-js`), TanStack Query v5, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (MIT), Tailwind CSS v4, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-auth-and-watchlist-design.md`

## Global Constraints

- 零成本營運（`$0` 成本）：嚴禁引入付費套件或商業 SDK，僅使用內建 Supabase Auth、PostgreSQL 與免費開源 MIT 授權之 `@dnd-kit` 套件。
- 配額硬性上限：單一帳號最多 `10` 個觀察清單（`MAX_WATCHLISTS = 10`）、單一觀察清單最多 `10` 個自訂群組（`MAX_GROUPS_PER_WATCHLIST = 10`）、單一觀察清單最多 `100` 檔標的（`MAX_ITEMS_PER_WATCHLIST = 100`）。
- 未登入時：左側邊欄**不顯示** `★ 清單` Tab，篩選結果列**不顯示** `+` 按鈕；若在 `★ 清單` Tab 登出，自動切回 `TWSE` Tab。
- 點擊篩選結果列右側 `+` 按鈕時：**必須同時切換右側 K 線圖至該檔標的**，並開啟觀察清單選單；選取清單後將標的加入該清單底部的「未分類（`group_id = null`）」最後一筆。
- 拖曳群組改變排序時：整個群組連同其內部標的跟著移動，內部標的相對順序保持不變。
- 刪除群組時：該群組內部的標的不刪除，自動退回該觀察清單底部的「未分類（`group_id = null`）」區塊。
- 程式碼風格：遵守 `.prettierrc`（無分號、單引號、行寬 100）與台灣正體中文（`zh-TW`）規範。

## Review Focus

1. **空白或超長名稱輸入**：新增或重新命名觀察清單／群組時，前後空白應自動 `trim()`，若為空字串或超過 50 字元則禁止送出。
2. **重複加入同一檔股票**：同一觀察清單已存在相同 `symbol` 時，`+` 選單必須顯示 `✓ 已加入` 並 `disabled`，且純函式層級亦拒絕重複插入。
3. **群組刪除後的未分類排序銜接**：刪除群組時，原群組內標的退回 `group_id = null` 後，其 `sort_order` 必須接續在既有未分類標的之後，避免序號衝突。
4. **登出瞬間的分頁狀態回退**：當使用者正停留在 `★ 清單` 分頁並點擊「登出」時，側邊欄必須立即將 `activeMarket` 回退至 `'TWSE'`，避免停留在已隱藏的分頁。
5. **同類型拖曳防呆**：拖曳「群組」時不可誤觸「標的」的放置邏輯；拖曳「標的」至空白群組時，必須支援直接放置於群組容器上將該標的歸入該群組。

---

### Task 1: Supabase Watchlist Schema、型別定義與清單排序／配額純函式

**Files:**

- Create: `specs/001-daily-screener/contracts/supabase-watchlist-schema.sql`
- Modify: `src/lib/database.types.ts`
- Modify: `src/lib/types.ts`
- Create: `src/lib/watchlist-utils.ts`
- Test: `tests/unit/services/watchlist-utils.test.ts`

**Interfaces:**

- Consumes: `MarketType`, `StockAsset` from `src/lib/database.types.ts`
- Produces:
  - `MAX_WATCHLISTS = 10`, `MAX_GROUPS_PER_WATCHLIST = 10`, `MAX_ITEMS_PER_WATCHLIST = 100`
  - Types in `src/lib/database.types.ts` & re-exported in `src/lib/types.ts`:
    - `Watchlist { id: string; user_id: string; name: string; sort_order: number; created_at: string; updated_at: string }`
    - `WatchlistGroup { id: string; watchlist_id: string; name: string; sort_order: number; created_at: string }`
    - `WatchlistItem { id: string; watchlist_id: string; group_id: string | null; symbol: string; name: string; market: MarketType; sort_order: number; created_at: string }`
    - `WatchlistWithDetails extends Watchlist { groups: WatchlistGroup[]; items: WatchlistItem[] }`
  - Functions in `src/lib/watchlist-utils.ts`:
    - `validateEntityName(name: string): string` (trims and throws if empty or `> 50` chars)
    - `canCreateWatchlist(currentCount: number): boolean`
    - `canCreateGroup(currentGroupCount: number): boolean`
    - `canAddWatchlistItem(items: WatchlistItem[], symbol: string): { allowed: boolean; reason?: 'duplicate' | 'full' }`
    - `reorderGroups(groups: WatchlistGroup[], activeGroupId: string, overGroupId: string): WatchlistGroup[]`
    - `moveOrReorderItem(items: WatchlistItem[], activeItemId: string, targetGroupId: string | null, overItemId?: string | null): WatchlistItem[]`
    - `dissolveGroupToUngrouped(groups: WatchlistGroup[], items: WatchlistItem[], groupId: string): { groups: WatchlistGroup[]; items: WatchlistItem[] }`
    - `getOrderedWatchlistAssets(watchlist: WatchlistWithDetails): StockAsset[]`
    - `buildTradingViewUrl(symbol: string, market: MarketType): string`

- [ ] **Step 1: Write the failing test in `tests/unit/services/watchlist-utils.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/services/watchlist-utils.test.ts`
Expected: FAIL with `Cannot find module '@/lib/watchlist-utils'`

- [ ] **Step 3: Create `specs/001-daily-screener/contracts/supabase-watchlist-schema.sql`, update `src/lib/database.types.ts` & `src/lib/types.ts`, and implement `src/lib/watchlist-utils.ts`**

Create SQL contract in `specs/001-daily-screener/contracts/supabase-watchlist-schema.sql` matching Section 3 of the spec (`watchlists`, `watchlist_groups`, `watchlist_items`, quota triggers, and RLS policies).
Add `Watchlist`, `WatchlistGroup`, `WatchlistItem`, `WatchlistWithDetails` to `src/lib/database.types.ts` and export them from `src/lib/types.ts`.
Implement `src/lib/watchlist-utils.ts` with the exact signatures defined in **Interfaces**.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/services/watchlist-utils.test.ts`
Expected: PASS (4 passed)

---

### Task 2: Auth Service、Watchlist Queries 與頂部導覽列登入控制器 (`AuthHeaderControl`)

**Files:**

- Create: `src/services/auth.ts`
- Create: `src/services/watchlist-queries.ts`
- Create: `src/components/AuthHeaderControl.tsx`
- Modify: `src/components/ScreenerDashboard.tsx`
- Test: `tests/unit/components/AuthHeaderControl.test.tsx`

**Interfaces:**

- Consumes: `supabase` from `src/lib/supabase.ts`, types from `src/lib/types.ts`, helpers from `src/lib/watchlist-utils.ts`
- Produces:
  - `src/services/auth.ts`:
    - `export interface AuthUser { id: string; email?: string }`
    - `export function useAuth(): { user: AuthUser | null; isLoading: boolean; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void> }`
  - `src/services/watchlist-queries.ts`:
    - `export function useWatchlists(userId: string | null | undefined)`
    - `export function useWatchlistMutations(userId: string | null | undefined)` returning `{ createWatchlist, renameWatchlist, deleteWatchlist, createGroup, renameGroup, deleteGroup, addItem, removeItem, reorderGroups, moveOrReorderItem }`
  - `src/components/AuthHeaderControl.tsx`:
    - `export default function AuthHeaderControl({ user, isLoading, onSignIn, onSignOut }: AuthHeaderControlProps)`

- [ ] **Step 1: Write the failing test in `tests/unit/components/AuthHeaderControl.test.tsx`**

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AuthHeaderControl from '@/components/AuthHeaderControl'

describe('AuthHeaderControl', () => {
  it('opens login dialog when unauthenticated and calls onSignIn with email and password', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)
    const onSignOut = vi.fn()

    render(
      <AuthHeaderControl
        user={null}
        isLoading={false}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /登入/ }))
    fireEvent.change(screen.getByLabelText(/電子郵件|Email/i), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/密碼/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /確認登入/ }))

    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith('owner@example.com', 'secret123')
    })
  })

  it('displays user email and triggers onSignOut when authenticated', () => {
    const onSignIn = vi.fn()
    const onSignOut = vi.fn().mockResolvedValue(undefined)

    render(
      <AuthHeaderControl
        user={{ id: 'u-1', email: 'owner@example.com' }}
        isLoading={false}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    )

    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /登出/ }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components/AuthHeaderControl.test.tsx`
Expected: FAIL with `Cannot find module '@/components/AuthHeaderControl'`

- [ ] **Step 3: Implement `src/services/auth.ts`, `src/services/watchlist-queries.ts`, `src/components/AuthHeaderControl.tsx`, and wire into `src/components/ScreenerDashboard.tsx`**

- `src/services/auth.ts`: Subscribe to `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`, expose `signIn(email, password)` (`supabase.auth.signInWithPassword`) and `signOut()` (`supabase.auth.signOut`). Gracefully handle test environments where `supabase.auth` may be partially mocked.
- `src/services/watchlist-queries.ts`: Fetch `watchlists`, `watchlist_groups`, and `watchlist_items` for `userId`, assemble `WatchlistWithDetails[]`, and provide optimistic mutations updating `['watchlists', userId]` cache immediately.
- `src/components/AuthHeaderControl.tsx`: Render login trigger + modal dialog when `user === null`, and email badge + logout button when `user !== null`.
- `src/components/ScreenerDashboard.tsx`: Call `useAuth()`, render `<AuthHeaderControl />` in the header right section, and pass `user` down to `<StockList date={currentDateStr} initialData={...} user={user} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components/AuthHeaderControl.test.tsx`
Expected: PASS (2 passed)

---

### Task 3: 篩選結果 `+` 按鈕選單 (`AddToWatchlistMenu`) 與同步切換 K 線圖

**Files:**

- Create: `src/components/AddToWatchlistMenu.tsx`
- Modify: `src/components/StockList.tsx`
- Test: `tests/unit/components/AddToWatchlistMenu.test.tsx`

**Interfaces:**

- Consumes: `StockAsset`, `WatchlistWithDetails` from `src/lib/types.ts`, `canAddWatchlistItem`, `MAX_WATCHLISTS`, `MAX_ITEMS_PER_WATCHLIST` from `src/lib/watchlist-utils.ts`
- Produces:
  - `src/components/AddToWatchlistMenu.tsx`:
    - `export default function AddToWatchlistMenu({ stock, watchlists, onSelectStock, onAddToWatchlist, onCreateWatchlistAndAdd }: AddToWatchlistMenuProps)`

- [ ] **Step 1: Write the failing test in `tests/unit/components/AddToWatchlistMenu.test.tsx`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components/AddToWatchlistMenu.test.tsx`
Expected: FAIL with `Cannot find module '@/components/AddToWatchlistMenu'`

- [ ] **Step 3: Implement `src/components/AddToWatchlistMenu.tsx` and integrate into `StockSidebarRow` in `src/components/StockList.tsx`**

- In `AddToWatchlistMenu.tsx`: Render a `+` button (`aria-label={`加入觀察清單：${stock.name}`}`). When clicked, call `onSelectStock()` so the parent switches the right-side K-line chart to `stock`, and toggle the popover menu listing all `watchlists`. Show item count (`${wl.items.length}/100`), disable if duplicate (`✓ 已加入`) or full (`已滿`), and allow quick-creating a new watchlist if `watchlists.length < MAX_WATCHLISTS`.
- In `StockList.tsx`: Render `AddToWatchlistMenu` on the right side of each `StockSidebarRow` **only when `user` is logged in**.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components/AddToWatchlistMenu.test.tsx`
Expected: PASS (1 passed)

---

### Task 4: 左側邊欄觀察清單分頁 (`WatchlistSidebar`)、`@dnd-kit` 群組與標的雙層拖曳排序及未登入隱藏驗證

**Files:**

- Modify: `package.json` (install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `src/components/WatchlistSidebar.tsx`
- Modify: `src/components/StockList.tsx`
- Test: `tests/unit/components/WatchlistSidebar.test.tsx`
- Modify: `tests/unit/components/StockList.test.tsx`

**Interfaces:**

- Consumes: `WatchlistWithDetails`, `StockAsset`, `AuthUser` from `src/lib/types.ts` & `src/services/auth.ts`, `useWatchlists` & `useWatchlistMutations` from `src/services/watchlist-queries.ts`, `DndContext`, `SortableContext`, `useSortable`, `useDroppable` from `@dnd-kit/core` & `@dnd-kit/sortable`
- Produces:
  - `src/components/WatchlistSidebar.tsx`:
    - `export default function WatchlistSidebar({ watchlists, activeWatchlistId, onSelectWatchlistId, selectedSymbol, onSelectStock, onCreateWatchlist, onRenameWatchlist, onDeleteWatchlist, onCreateGroup, onRenameGroup, onDeleteGroup, onRemoveItem, onReorderGroups, onMoveOrReorderItem }: WatchlistSidebarProps)`
    - `export function handleWatchlistDragEnd(event: DragEndEvent, activeWatchlistId: string, onReorderGroups: WatchlistSidebarProps['onReorderGroups'], onMoveOrReorderItem: WatchlistSidebarProps['onMoveOrReorderItem']): void`

- [ ] **Step 1: Install `@dnd-kit` packages and write the failing tests in `tests/unit/components/WatchlistSidebar.test.tsx` and `tests/unit/components/StockList.test.tsx`**

Run: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

```typescript
// tests/unit/components/WatchlistSidebar.test.tsx
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
```

And in `tests/unit/components/StockList.test.tsx`, add test cases verifying:

1. When `user={null}` (unauthenticated), the `觀察清單` tab and `+` buttons are **not rendered**.
2. When `user={{ id: 'u-1', email: 'owner@example.com' }}`, the `★ 清單` tab and `+` buttons are rendered, and clicking `+` switches the selected stock in `StockChart`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/components/WatchlistSidebar.test.tsx tests/unit/components/StockList.test.tsx`
Expected: FAIL with `Cannot find module '@/components/WatchlistSidebar'`

- [ ] **Step 3: Implement `src/components/WatchlistSidebar.tsx` (with `@dnd-kit`) and update `src/components/StockList.tsx`**

- `WatchlistSidebar.tsx`:
  - Watchlist selector dropdown + inline create/rename input & delete button (respecting `10` watchlist limit).
  - Group creation input (`+ 新增群組`, respecting `10` group limit).
  - Wrap the group list and ungrouped section in `@dnd-kit/core`'s `<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={...}>`.
  - Outer `<SortableContext items={groups.map((g) => 'group:' + g.id)} strategy={verticalListSortingStrategy}>` manages `SortableGroupSection` (`useSortable({ id: 'group:' + group.id, data: { type: 'group', groupId: group.id } })`). Each `SortableGroupSection` wraps both the group header and its internal `<ul>` of items so dragging a group visually and structurally moves all its internal items together!
  - Inner `<SortableContext items={groupItems.map((i) => 'item:' + i.id)} strategy={verticalListSortingStrategy}>` inside each group and inside the fixed bottom `未分類` droppable section (`useDroppable({ id: 'group:ungrouped', data: { type: 'group', groupId: null } })`) manages `SortableWatchlistItem` (`useSortable({ id: 'item:' + item.id, data: { type: 'item', itemId: item.id, groupId: item.group_id } })`).
- `StockList.tsx`:
  - Extend `ActiveMarketTab = 'TWSE' | 'US' | 'WATCHLIST'`.
  - Only render the 3rd tab (`★ 清單`) when `Boolean(user)` is true.
  - Add an effect: if `!user && activeMarket === 'WATCHLIST'`, reset `setActiveMarket('TWSE')`.
  - When `activeMarket === 'WATCHLIST'`, derive `orderedAssets` from `getOrderedWatchlistAssets(activeWatchlist)` so `selectedStock` and keyboard `ArrowUp`/`ArrowDown` seamlessly control the right-hand `StockChart`.

- [ ] **Step 4: Run unit test suite**

Run: `pnpm vitest run tests/unit/components/WatchlistSidebar.test.tsx tests/unit/components/StockList.test.tsx`
Expected: PASS

---

### Task 5: 端對端（E2E）整合測試與全系統建置／品質總驗證

**Files:**

- Create: `tests/e2e/watchlist.spec.ts`

**Interfaces:**

- Consumes: Full Next.js application (`ScreenerDashboard`, `AuthHeaderControl`, `StockList`, `AddToWatchlistMenu`, `WatchlistSidebar`, `StockChart`)
- Produces: End-to-end Playwright verification of the complete authentication + watchlist lifecycle and full build/lint/test sign-off.

- [ ] **Step 1: Write the E2E test in `tests/e2e/watchlist.spec.ts`**

Create `tests/e2e/watchlist.spec.ts` covering the full user journey:

1. Unauthenticated visitor loads `/`: verifies `★ 清單` tab and `+` buttons are hidden.
2. User clicks `登入`, submits credentials, and logs in: verifies `★ 清單` tab and `+` buttons appear.
3. User clicks `+` on a screening stock (e.g. `2014.TW` 中鴻): verifies right-side K-line chart immediately switches to `2014.TW`, and adds the stock to a watchlist bottom (`未分類`).
4. User switches to `★ 清單` tab, creates/renames a group, moves/reorders items and groups, deletes a group and verifies items return to `未分類`, then logs out and verifies the sidebar automatically returns to the `台股` tab and hides `★ 清單`.

- [ ] **Step 2: Run unit tests, ESLint, Prettier check, Next.js production build, and Playwright E2E tests**

Run: `pnpm test && pnpm lint && pnpm format:check && pnpm build && pnpm test:e2e`
Expected: All unit tests PASS, 0 ESLint errors, Prettier formatted, production build succeeds, and all E2E tests PASS.
