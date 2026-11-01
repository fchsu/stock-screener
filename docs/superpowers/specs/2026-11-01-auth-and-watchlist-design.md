# 登入系統與自選觀察清單（Watchlist）架構設計規格書

- **日期**：2026-11-01
- **狀態**：已確認設計，待審閱規格書

---

## 1. 背景與目標

本功能旨在為「老余三問自動選股系統」新增個人化**身分驗證（Authentication）**與**自選觀察清單（Watchlist）**子系統。
系統主要供專案擁有者個人使用，透過登入機制防止未授權訪客修改觀察清單，並允許登入使用者將每日台股/美股篩選出的標的快速收入觀察清單，進行自訂群組分類與拖曳排序管理，同時在點擊任一標的時即時連動右側 K 線圖檢視區。

所有設計嚴格遵守專案 `AGENTS.md` 之**零成本營運原則（$0 成本）**：

- 採用 Supabase Auth 內建 Email + Password 驗證（後台關閉公開註冊 `Enable Sign Ups = OFF`）。
- 採用 Supabase PostgreSQL 儲存結構化清單資料（單一滿載帳號僅佔用約 `220 KB`，佔 500MB 免費上限的 `0.04%`）。
- 拖曳套件採用免費 MIT 開源授權之 `@dnd-kit/core`、`@dnd-kit/sortable` 與 `@dnd-kit/utilities`。
- 前端透過 TanStack Query 快取與樂觀更新（Optimistic Updates）消除重複查詢。

---

## 2. 功能需求與配額限制

1. **前端登入系統**：
   - 頂部導覽列（[`ScreenerDashboard.tsx`](file:///Users/gavin/主要入口/coding/stock-screener/src/components/ScreenerDashboard.tsx)）右側提供「登入」按鈕；點擊後開啟 Email + 密碼登入對話框。
   - 登入後顯示使用者狀態與「登出」按鈕。
   - 未登入訪客僅能瀏覽每日台股/美股篩選結果與 K 線圖，**不顯示左側邊欄的「觀察清單」Tab**，亦不顯示 `+` 加入清單按鈕與任何觀察清單管理操作。
2. **觀察清單與配額限制**：
   - 單一帳號最多可建立 **10 個觀察清單（Watchlist）**。
   - 每個觀察清單可新增、重新命名、刪除。
   - 單一觀察清單底下最多可建立 **10 個自訂群組（Group）** 與最多收納 **100 檔標的（Item）**。
   - 同一觀察清單內不允許重複加入相同股票代號（`symbol`）。
3. **群組與雙層拖曳排序**：
   - 每個觀察清單內含上方「自訂群組區（最多 10 個群組）」與底部固定的「未分類（`group_id = NULL`）」板塊。
   - 群組支援新增、重新命名、刪除與上下拖曳改變排序；**當拖曳群組改變排序時，整個群組區塊連同其內部所有標的一併跟隨移動**（群組內標的因綁定 `group_id` 且依群組渲染，內部相對順序完全保持不變）。
   - **刪除群組行為**：當刪除某個群組時，該群組內的所有標的不會被刪除，而是自動退回至該觀察清單底部的「未分類」板塊（透過資料庫外鍵 `ON DELETE SET NULL` 保障）。
   - 標的支援同群組內上下拖曳排序、跨群組（含自訂群組與未分類板塊之間）拖曳移動，以及單獨從觀察清單中移除。
4. **篩選結果 `+` 快速加入按鈕**：
   - 在現有台股與美股篩選結果列表（[`StockList.tsx`](file:///Users/gavin/主要入口/coding/stock-screener/src/components/StockList.tsx)）中，每檔標的列右側顯示 `+` 按鈕（僅於登入狀態顯示）。
   - **點擊 `+` 按鈕時**：**同時將右側 K 線圖切換為該檔標的**，並彈出觀察清單選擇選單。
   - 選單列出使用者目前所有的觀察清單（顯示清單名稱與標的數量 `N/100`）：
     - 若該清單已包含此 `symbol`，顯示 `✓ 已加入` 並禁用重複點擊。
     - 若該清單已達 100 檔上限，顯示 `已滿` 並禁用點擊。
     - 點擊可用觀察清單後，將該標的添加至該觀察清單底部的「未分類」區域最後一筆。
     - 若使用者尚無任何觀察清單（或未達 10 個上限），選單底部提供快速「＋ 新增觀察清單並加入」入口。

---

## 3. 資料庫 Schema 與安全設計（Supabase PostgreSQL）

契約檔案將定義於 `specs/001-daily-screener/contracts/supabase-watchlist-schema.sql`，包含三張正規化關聯表、配額檢查 Trigger 與 RLS 策略：

### 3.1 資料表結構

```sql
-- 1. 觀察清單主表 (watchlists)
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_sort ON watchlists(user_id, sort_order, created_at);

-- 2. 觀察清單群組表 (watchlist_groups)
CREATE TABLE IF NOT EXISTS watchlist_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_groups_list_sort ON watchlist_groups(watchlist_id, sort_order, created_at);

-- 3. 觀察清單標的表 (watchlist_items)
CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    group_id UUID REFERENCES watchlist_groups(id) ON DELETE SET NULL,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    market market_type NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(watchlist_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_list_group_sort ON watchlist_items(watchlist_id, group_id, sort_order, created_at);
```

### 3.2 資料庫層級配額守門員（PostgreSQL Triggers）

透過 `BEFORE INSERT` Trigger 強制驗證上限，防止繞過前端檢查：

1. `check_watchlist_quota()`：檢查同一 `user_id` 的 `watchlists` 數量若 $\ge 10$，拋出例外 `每個帳號最多只能建立 10 個觀察清單`。
2. `check_watchlist_group_quota()`：檢查同一 `watchlist_id` 的 `watchlist_groups` 數量若 $\ge 10$，拋出例外 `每個觀察清單最多只能建立 10 個群組`。
3. `check_watchlist_item_quota()`：檢查同一 `watchlist_id` 的 `watchlist_items` 數量若 $\ge 100$，拋出例外 `每個觀察清單最多只能加入 100 檔標的`。

### 3.3 資料列層級安全性（RLS）

- `watchlists`：啟用 RLS，僅允許 `auth.uid() = user_id` 執行 `ALL`（`SELECT`, `INSERT`, `UPDATE`, `DELETE`）。
- `watchlist_groups` 與 `watchlist_items`：啟用 RLS，僅允許 `EXISTS (SELECT 1 FROM watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid())` 執行 `ALL`。

---

## 4. 前端元件與資料流架構

### 4.1 模組拆分

1. **`src/lib/database.types.ts` & `src/lib/types.ts`**：
   - 新增 `Watchlist`、`WatchlistGroup`、`WatchlistItem` 與聚合型別 `WatchlistWithDetails`（內含排序後的 `groups` 與 `items`）。
2. **`src/services/auth.ts` & `src/components/AuthHeaderControl.tsx`**：
   - 管理 Supabase Auth Session 狀態監聽（`supabase.auth.onAuthStateChange`）與 `signInWithPassword` / `signOut`。
   - 提供簡潔的登入對話框（Email / Password 輸入、錯誤訊息提示）。
3. **`src/services/watchlist-queries.ts`**：
   - TanStack Query Hooks：
     - `useWatchlists(userId)`：一次拉取使用者所有觀察清單、群組與標的（設定 `staleTime: Infinity`，於本地變更時透過樂觀更新同步）。
     - Mutations：`useCreateWatchlist`、`useRenameWatchlist`、`useDeleteWatchlist`、`useCreateGroup`、`useRenameGroup`、`useDeleteGroup`、`useAddWatchlistItem`、`useRemoveWatchlistItem`、`useReorderWatchlist`（處理群組排序、標的同群組排序與跨板塊拖曳）。
4. **`src/components/AddToWatchlistMenu.tsx`**：
   - 嵌入於 [`StockList.tsx`](file:///Users/gavin/主要入口/coding/stock-screener/src/components/StockList.tsx) 的 `StockSidebarRow` 右側。
   - 點擊 `+` 時：先觸發 `onSelect()` 切換當前選取股票與右側 K 線圖，並展開觀察清單選擇選單。
   - 選取清單後呼叫 `useAddWatchlistItem`，將該標的加入目標清單底部（`group_id = null`，`sort_order = max + 1`）。
5. **`src/components/WatchlistSidebar.tsx`**：
   - **僅於已登入狀態**在左側邊欄頂部顯示第 3 個 Tab：`[台股] [美股] [★ 清單]`（未登入時維持原本 2 欄 `[台股] [美股]`，登出時若原處於觀察清單 Tab 則自動切回 `台股`）。
   - 當左側邊欄切換至 `★ 清單` 分頁時渲染：
     - 頂部工具列：觀察清單下拉切換器（含新增、改名、刪除清單按鈕）與「＋ 新增群組」按鈕，並顯示配額計數（如 `清單 3/10`、`群組 2/10`、`標的 18/100`）。
     - 雙層拖曳容器（基於 `@dnd-kit/core` 與 `@dnd-kit/sortable`）：
       - 外層 `SortableContext` 管理自訂群組（`WatchlistGroupSection`）的上下拖曳排序；每個群組元件包裹該群組 Header 與其子標的列表，拖曳群組時整個群組容器與內部標的同步移動。
       - 內層每個群組與底部「📁 未分類」板塊各自為可放置區域（Droppable + `SortableContext`），支援標的在同板塊內上下排序或跨板塊拖曳。
       - 點擊任一標的列即更新 `selectedStock`，連動右側 [`StockChart.tsx`](file:///Users/gavin/主要入口/coding/stock-screener/src/components/StockChart.tsx) 顯示 K 線圖，並完整支援鍵盤 `↑` `↓` 在當前觀察清單的有序標的間上下切換。

---

## 5. 錯誤處理與邊界情境

- **未登入狀態**：完全隱藏左側邊欄的 `★ 清單` 分頁 Tab 與篩選列表中的 `+` 按鈕；若使用者在 `★ 清單` 分頁點擊登出，介面自動切回 `台股` 篩選結果分頁。
- **配額達上限**：
  - 當觀察清單達 10 個時，「新增清單」按鈕禁用並提示已達上限 10/10。
  - 當某清單內群組達 10 個時，「新增群組」按鈕禁用並提示已達上限 10/10。
  - 當某清單內標的達 100 檔時，`+` 選單中該清單標示為「已滿 (100/100)」並禁用。
- **樂觀更新回滾（Rollback）**：拖曳排序或新增/刪除若因網路異常失敗，React Query 自動於 `onError` 回滾至變更前快取快照並顯示錯誤提示。

---

## 6. 測試策略（TDD）

1. **單元與整合測試（`tests/unit/`，Vitest + Testing Library）**：
   - `AuthHeaderControl.test.tsx`：驗證未登入顯示登入按鈕、輸入帳密登入呼叫、登入後顯示登出按鈕。
   - `AddToWatchlistMenu.test.tsx`：驗證點擊 `+` 同時觸發切換股票（K 線圖連動）、顯示清單列表、已存在標的禁用防呆、滿額 100 檔禁用防呆、點擊清單成功加入底部未分類區。
   - `WatchlistSidebar.test.tsx`：驗證觀察清單新增/改名/刪除（含 10 個上限檢查）、群組新增/改名/刪除（刪除群組後標的退回未分類）、跨板塊與排序變更邏輯。
2. **端對端測試（`tests/e2e/`，Playwright）**：
   - 驗證篩選列表結合登入態、點擊 `+` 切換圖表並加入觀察清單、切換至觀察清單分頁檢視與互動。
