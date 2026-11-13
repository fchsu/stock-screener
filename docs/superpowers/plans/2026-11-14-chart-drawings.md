# K 線圖互動畫線系統（水平線與路徑） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 K 線圖新增水平線（Horizontal Line）與多點折線路徑（Path / Polyline，支援在最新 K 棒右側的未來預留區繪製老余破底翻 `P0–P5` 預期結構，並支援右鍵 / 雙擊 / Enter / Escape 完成繪製）、跨時框（60K / 日K / 週K）時間刻度自動對齊、樣式編輯（顏色 / 粗細 / 虛實線）、控制點拖曳與 Supabase 資料庫持久化。

**Architecture:** 於 Supabase 建立 `chart_drawings` 資料表（含每檔股票上限 50 條之配額 Trigger 與 RLS 保護），前端透過 TanStack Query 樂觀更新（Optimistic Updates）管理畫線快取。在每個 `CandlestickPane` 上疊加一層原生 `<svg>` 互動圖層（`ChartDrawingOverlay`），利用 `lightweight-charts` 的 `attachPrimitive({ updateAllViews })` 訂閱圖表縮放平移，並透過 `drawing-utils.ts` 的跨時框時間與未來邏輯偏移演算法（`logicalToCoordinate` / `coordinateToLogical`）確保畫線在所有時框及未來空白區皆精準對齊。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, `lightweight-charts` v5.2.1, Supabase (`@supabase/supabase-js`), TanStack Query v5, Tailwind CSS v4, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-chart-drawings-design.md`

## Global Constraints

- 零成本營運（`$0` 成本）：嚴禁引入付費套件或商業圖表 SDK，完全基於現有 `lightweight-charts` v5.2.1 與原生 SVG 圖層實作。
- 權限隔離：與觀察清單一致，僅於已登入狀態（`user != null`）在 `StockChart` 頂部顯示畫線工具列並查詢／儲存個人畫線；未登入訪客不顯示畫線工具亦不發送查詢。
- 配額上限：單一帳號在每檔股票（`symbol`）最多儲存 `50` 條畫線（`MAX_DRAWINGS_PER_SYMBOL = 50`）；單一條路徑（`path`）節點數必須介於 `2` 至 `50` 點之間（`MAX_PATH_POINTS = 50`），水平線（`horizontal`）固定為 `1` 點。
- 右側未來空白區預留：將 `StockChart.tsx` 的 `DEFAULT_RIGHT_OFFSET` 由 `2` 調整為 `12`（預留 12 根 K 棒寬度），讓使用者能在最新 K 棒右側預畫尚未發生的 `P4`、`P5` 路徑節點。
- 路徑結束繪製條件：在 `path` 模式下，**按滑鼠右鍵（`contextmenu`）**、**左鍵雙擊（`dblclick`）**、或按鍵盤 **`Enter` / `Escape`** 皆可結束繪製（若已點選 $\ge 2$ 點則儲存完成並切回 `cursor` 模式；若僅 $0 \sim 1$ 點則取消草稿）。
- 程式碼風格：遵守 `.prettierrc`（無分號、單引號、行寬 100）與台灣正體中文（`zh-TW`）規範。

## Review Focus

1. **最新 K 棒右側的未來時間點（Future Extrapolation）雙向轉換**：在最新 K 棒（索引 `lastIdx`）往右 `k` 格點擊時，`pixelToDrawingPoint` 必須外推未來時間 `lastBar.time + k * stepSeconds`；而在 `drawingPointToPixel` 渲染該未來時間點時，必須反推浮點邏輯索引 `lastIdx + (point.time - lastBar.time) / stepSeconds` 並交由 `logicalToCoordinate` 換算 X 座標，不可被 Clamp 在最後一根 K 棒上。
2. **滑鼠右鍵（`contextmenu`）完成路徑繪製與雙擊防重覆點**：按右鍵時必須呼叫 `e.preventDefault()` 阻擋瀏覽器選單並完成路徑（若點數 $\ge 2$）；雙擊左鍵完成路徑時，若第二次點擊與前一點座標完全相同，必須去重避免產生重疊冗餘節點。
3. **跨時框時間對齊（60K ↔ 日K ↔ 週K）**：在日K週三或 60K 盤中畫出的路徑節點，切換到週K時（週K僅有週一時間戳），二分搜尋必須正確對齊至滿足 `bars[i].time <= point.time` 的最後一根週 K 棒。
4. **拖曳控制點時的底圖防滑動與單次寫入**：按下控制點拖曳（`pointerdown`）時必須暫時關閉圖表平移縮放（`chart.applyOptions({ handleScroll: false, handleScale: false })`），拖曳過程僅更新本地視覺座標，直到放開滑鼠（`pointerup`）才恢復圖表互動並觸發一次 `onUpdateDrawing` API 請求。
5. **切換股票或切換工具時的草稿清理**：當路徑畫到一半（尚未完成）即切換股票 `symbol` 或切換至其他工具時，必須自動清除未完成的草稿節點與選取狀態。

---

### Task 1: Supabase `chart_drawings` Schema、型別定義與跨時框／未來時間座標純函式 (`drawing-utils.ts`)

**Files:**

- Create: `specs/001-daily-screener/contracts/supabase-drawings-schema.sql`
- Modify: `src/lib/database.types.ts`
- Modify: `src/lib/types.ts`
- Create: `src/lib/drawing-utils.ts`
- Test: `tests/unit/services/drawing-utils.test.ts`

**Interfaces:**

- Consumes: `ChartInterval`, `OHLCVBar` from `src/lib/ohlcv.ts`
- Produces:
  - Constants in `src/lib/drawing-utils.ts`:
    - `MAX_DRAWINGS_PER_SYMBOL = 50`
    - `MAX_PATH_POINTS = 50`
    - `DRAWING_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7'] as const`
    - `DEFAULT_DRAWING_STYLE: DrawingStyle = { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' }`
  - Types in `src/lib/database.types.ts` & re-exported in `src/lib/types.ts`:
    - `DrawingToolType = 'horizontal' | 'path'`
    - `ActiveDrawingTool = 'cursor' | DrawingToolType`
    - `DrawingLineStyle = 'solid' | 'dashed' | 'dotted'`
    - `DrawingPoint = { time: number; price: number }`
    - `DrawingStyle = { color: string; lineWidth: 1 | 2 | 3; lineStyle: DrawingLineStyle }`
    - `ChartDrawing = { id: string; user_id: string; symbol: string; tool_type: DrawingToolType; points: DrawingPoint[]; style: DrawingStyle; created_at: string; updated_at: string }`
  - Functions in `src/lib/drawing-utils.ts`:
    - `getIntervalStepSeconds(interval: ChartInterval): number`
    - `canCreateDrawing(currentCount: number): boolean`
    - `validateDrawingPoints(toolType: DrawingToolType, points: DrawingPoint[]): DrawingPoint[]`
    - `dedupeConsecutivePoints(points: DrawingPoint[]): DrawingPoint[]`
    - `getStrokeDasharray(lineStyle: DrawingLineStyle): string | undefined`
    - `findBarIndexForTime(bars: OHLCVBar[], targetTime: number): number`
    - `timeToLogicalIndex(bars: OHLCVBar[], interval: ChartInterval, targetTime: number): number`
    - `logicalIndexToTime(bars: OHLCVBar[], interval: ChartInterval, logicalIndex: number): number`
    - `pixelToDrawingPoint(params: { x: number; y: number; bars: OHLCVBar[]; interval: ChartInterval; coordinateToLogical: (x: number) => number | null; coordinateToPrice: (y: number) => number | null }): DrawingPoint | null`
    - `drawingPointToPixel(params: { point: DrawingPoint; bars: OHLCVBar[]; interval: ChartInterval; logicalToCoordinate: (logical: number) => number | null; timeToCoordinate?: (time: number) => number | null; priceToCoordinate: (price: number) => number | null }): { x: number; y: number } | null`

- [ ] **Step 1: Write the failing test in `tests/unit/services/drawing-utils.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import {
  MAX_DRAWINGS_PER_SYMBOL,
  MAX_PATH_POINTS,
  getIntervalStepSeconds,
  canCreateDrawing,
  validateDrawingPoints,
  dedupeConsecutivePoints,
  getStrokeDasharray,
  findBarIndexForTime,
  timeToLogicalIndex,
  logicalIndexToTime,
  pixelToDrawingPoint,
  drawingPointToPixel,
} from '@/lib/drawing-utils'
import type { OHLCVBar } from '@/lib/ohlcv'

const sampleDailyBars: OHLCVBar[] = [
  { time: 1700000000, open: 100, high: 105, low: 98, close: 102, volume: 1000 }, // idx 0
  { time: 1700086400, open: 102, high: 108, low: 101, close: 106, volume: 1200 }, // idx 1
  { time: 1700172800, open: 106, high: 110, low: 104, close: 109, volume: 1500 }, // idx 2 (lastBar)
]

describe('drawing-utils', () => {
  it('enforces 50 drawings quota and validates horizontal (1 point) vs path (2..50 points)', () => {
    expect(MAX_DRAWINGS_PER_SYMBOL).toBe(50)
    expect(MAX_PATH_POINTS).toBe(50)
    expect(canCreateDrawing(49)).toBe(true)
    expect(canCreateDrawing(50)).toBe(false)

    expect(validateDrawingPoints('horizontal', [{ time: 1700000000, price: 105.556 }])).toEqual([
      { time: 1700000000, price: 105.56 },
    ])
    expect(() => validateDrawingPoints('horizontal', [])).toThrow()
    expect(() => validateDrawingPoints('path', [{ time: 1700000000, price: 100 }])).toThrow(
      '路徑至少需要 2 個節點'
    )
  })

  it('dedupes consecutive identical points from double-click completion and maps strokeDasharray', () => {
    const pts = [
      { time: 1700000000, price: 100 },
      { time: 1700086400, price: 105 },
      { time: 1700086400, price: 105 },
    ]
    expect(dedupeConsecutivePoints(pts)).toEqual([
      { time: 1700000000, price: 100 },
      { time: 1700086400, price: 105 },
    ])
    expect(getStrokeDasharray('solid')).toBeUndefined()
    expect(getStrokeDasharray('dashed')).toBe('6 4')
    expect(getStrokeDasharray('dotted')).toBe('2 4')
  })

  it('maps cross-timeframe timestamps accurately (e.g. Wednesday daily point onto Monday weekly bar)', () => {
    const weeklyBars: OHLCVBar[] = [
      { time: 1700000000, open: 100, high: 110, low: 95, close: 108, volume: 5000 }, // Week 1 Monday
      { time: 1700604800, open: 108, high: 115, low: 105, close: 112, volume: 6000 }, // Week 2 Monday
    ]
    // Wednesday inside Week 1 (Monday + 2 days)
    const wednesdayTime = 1700000000 + 2 * 86400
    expect(findBarIndexForTime(weeklyBars, wednesdayTime)).toBe(0)
    expect(timeToLogicalIndex(weeklyBars, '1wk', wednesdayTime)).toBe(0)
  })

  it('extrapolates future P4/P5 points beyond the last K-bar and converts them back to logical coordinates', () => {
    expect(getIntervalStepSeconds('60m')).toBe(3600)
    expect(getIntervalStepSeconds('1d')).toBe(86400)
    expect(getIntervalStepSeconds('1wk')).toBe(604800)

    // User clicks 5 bars to the right of the last daily bar (idx 2 + 5 = logicalIndex 7)
    const futureTime = logicalIndexToTime(sampleDailyBars, '1d', 7)
    expect(futureTime).toBe(1700172800 + 5 * 86400)

    // Converting that future timestamp back to logical index in 1d returns 7
    expect(timeToLogicalIndex(sampleDailyBars, '1d', futureTime)).toBe(7)

    // Full round-trip via pixelToDrawingPoint & drawingPointToPixel
    const point = pixelToDrawingPoint({
      x: 700,
      y: 120,
      bars: sampleDailyBars,
      interval: '1d',
      coordinateToLogical: (x) => x / 100, // 700 -> logical 7
      coordinateToPrice: () => 118.456,
    })
    expect(point).toEqual({
      time: 1700172800 + 5 * 86400,
      price: 118.46,
    })

    const pixel = drawingPointToPixel({
      point: point!,
      bars: sampleDailyBars,
      interval: '1d',
      logicalToCoordinate: (logical) => logical * 100,
      priceToCoordinate: (price) => (price === 118.46 ? 120 : null),
    })
    expect(pixel).toEqual({ x: 700, y: 120 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/services/drawing-utils.test.ts`
Expected: FAIL with `Cannot find module '@/lib/drawing-utils'`

- [ ] **Step 3: Create `specs/001-daily-screener/contracts/supabase-drawings-schema.sql`, update `src/lib/database.types.ts` & `src/lib/types.ts`, and implement `src/lib/drawing-utils.ts`**

1. Create `specs/001-daily-screener/contracts/supabase-drawings-schema.sql` containing `chart_drawings` table, `check_chart_drawing_quota()` trigger (max 50 per `user_id` + `symbol`), and RLS policy from Section 3 of the spec.
2. Add `DrawingToolType`, `ActiveDrawingTool`, `DrawingLineStyle`, `DrawingPoint`, `DrawingStyle`, `ChartDrawing`, and `chart_drawings` table definition to `src/lib/database.types.ts`, and re-export them in `src/lib/types.ts`.
3. Implement `src/lib/drawing-utils.ts` with all functions specified in **Interfaces**.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/services/drawing-utils.test.ts`
Expected: PASS (4 passed)

---

### Task 2: Supabase 畫線查詢與樂觀更新服務 (`drawing-queries.ts`)

**Files:**

- Create: `src/services/drawing-queries.ts`
- Test: `tests/unit/services/drawing-queries.test.tsx`

**Interfaces:**

- Consumes: `supabase` from `src/lib/supabase.ts`, `ChartDrawing`, `DrawingPoint`, `DrawingStyle`, `DrawingToolType` from `src/lib/types.ts`, `canCreateDrawing`, `validateDrawingPoints`, `DEFAULT_DRAWING_STYLE` from `src/lib/drawing-utils.ts`
- Produces:
  - `fetchChartDrawings(userId: string, symbol: string): Promise<ChartDrawing[]>`
  - `useChartDrawings(userId: string | null | undefined, symbol: string | null | undefined)`
  - `useChartDrawingMutations(userId: string | null | undefined, symbol: string | null | undefined)` returning `{ createDrawing, updateDrawing, deleteDrawing, clearSymbolDrawings }`

- [ ] **Step 1: Write the failing test in `tests/unit/services/drawing-queries.test.tsx`**

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { useChartDrawings, useChartDrawingMutations } from '@/services/drawing-queries'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('drawing-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches drawings for (userId, symbol) and optimistically creates, updates, deletes, and clears drawings', async () => {
    const initialDrawings = [
      {
        id: 'd-1',
        user_id: 'u-1',
        symbol: '2330.TW',
        tool_type: 'horizontal',
        points: [{ time: 1700000000, price: 500 }],
        style: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },
        created_at: '2026-11-14T00:00:00Z',
        updated_at: '2026-11-14T00:00:00Z',
      },
    ]

    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'd-2',
        user_id: 'u-1',
        symbol: '2330.TW',
        tool_type: 'path',
        points: [
          { time: 1700000000, price: 500 },
          { time: 1700086400, price: 520 },
        ],
        style: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid' },
        created_at: '2026-11-14T00:01:00Z',
        updated_at: '2026-11-14T00:01:00Z',
      },
      error: null,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation(() => {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: initialDrawings, error: null }),
            }),
          }),
          single: mockSingle,
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: mockSingle }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          }),
        }),
      } as any
    })

    const wrapper = createWrapper()
    const { result } = renderHook(
      () => ({
        query: useChartDrawings('u-1', '2330.TW'),
        mutations: useChartDrawingMutations('u-1', '2330.TW'),
      }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.query.data).toHaveLength(1))

    // 新增路徑畫線
    await act(async () => {
      await result.current.mutations.createDrawing.mutateAsync({
        toolType: 'path',
        points: [
          { time: 1700000000, price: 500 },
          { time: 1700086400, price: 520 },
        ],
        style: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid' },
      })
    })
    expect(result.current.query.data).toHaveLength(2)

    // 更新水平線價格與顏色
    await act(async () => {
      await result.current.mutations.updateDrawing.mutateAsync({
        id: 'd-1',
        points: [{ time: 1700000000, price: 512 }],
        style: { color: '#22c55e', lineWidth: 3, lineStyle: 'dashed' },
      })
    })
    expect(result.current.query.data?.find((d) => d.id === 'd-1')?.points[0].price).toBe(512)
    expect(result.current.query.data?.find((d) => d.id === 'd-1')?.style.lineStyle).toBe('dashed')

    // 刪除單條畫線
    await act(async () => {
      await result.current.mutations.deleteDrawing.mutateAsync('d-1')
    })
    expect(result.current.query.data?.map((d) => d.id)).toEqual(['d-2'])

    // 清除該股全部畫線
    await act(async () => {
      await result.current.mutations.clearSymbolDrawings.mutateAsync()
    })
    expect(result.current.query.data).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/services/drawing-queries.test.tsx`
Expected: FAIL with `Cannot find module '@/services/drawing-queries'`

- [ ] **Step 3: Implement `src/services/drawing-queries.ts`**

Implement `fetchChartDrawings`, `useChartDrawings` (with `queryKey: ['chartDrawings', userId, symbol]` and `staleTime: Infinity`), and `useChartDrawingMutations` (`createDrawing`, `updateDrawing`, `deleteDrawing`, `clearSymbolDrawings`) with optimistic cache updates on `['chartDrawings', userId, symbol]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/services/drawing-queries.test.tsx`
Expected: PASS (1 passed)

---

### Task 3: 畫線工具列元件 (`ChartDrawingToolbar.tsx`)

**Files:**

- Create: `src/components/ChartDrawingToolbar.tsx`
- Test: `tests/unit/components/ChartDrawingToolbar.test.tsx`

**Interfaces:**

- Consumes: `ActiveDrawingTool`, `DrawingStyle`, `DrawingLineStyle`, `ChartDrawing` from `src/lib/types.ts`, `DRAWING_COLORS`, `MAX_DRAWINGS_PER_SYMBOL`, `canCreateDrawing` from `src/lib/drawing-utils.ts`
- Produces:
  - `export interface ChartDrawingToolbarProps`:
    - `activeTool: ActiveDrawingTool`
    - `onSelectTool: (tool: ActiveDrawingTool) => void`
    - `currentStyle: DrawingStyle`
    - `onChangeStyle: (patch: Partial<DrawingStyle>) => void`
    - `selectedDrawing: ChartDrawing | null`
    - `drawingCount: number`
    - `onDeleteSelected: () => void`
    - `onClearAll: () => void`
  - `export default function ChartDrawingToolbar(props: ChartDrawingToolbarProps)`

- [ ] **Step 1: Write the failing test in `tests/unit/components/ChartDrawingToolbar.test.tsx`**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ChartDrawingToolbar from '@/components/ChartDrawingToolbar'
import type { ChartDrawing, DrawingStyle } from '@/lib/types'

const defaultStyle: DrawingStyle = {
  color: '#3b82f6',
  lineWidth: 2,
  lineStyle: 'solid',
}

const sampleSelectedDrawing: ChartDrawing = {
  id: 'd-1',
  user_id: 'u-1',
  symbol: '2330.TW',
  tool_type: 'horizontal',
  points: [{ time: 1700000000, price: 500 }],
  style: defaultStyle,
  created_at: '',
  updated_at: '',
}

describe('ChartDrawingToolbar', () => {
  it('switches tools, updates style (color, lineWidth, lineStyle), and triggers delete/clear callbacks', () => {
    const onSelectTool = vi.fn()
    const onChangeStyle = vi.fn()
    const onDeleteSelected = vi.fn()
    const onClearAll = vi.fn()

    render(
      <ChartDrawingToolbar
        activeTool="cursor"
        onSelectTool={onSelectTool}
        currentStyle={defaultStyle}
        onChangeStyle={onChangeStyle}
        selectedDrawing={sampleSelectedDrawing}
        drawingCount={3}
        onDeleteSelected={onDeleteSelected}
        onClearAll={onClearAll}
      />
    )

    // 切換至水平線與路徑工具
    fireEvent.click(screen.getByRole('button', { name: /水平線/ }))
    expect(onSelectTool).toHaveBeenCalledWith('horizontal')

    fireEvent.click(screen.getByRole('button', { name: /路徑/ }))
    expect(onSelectTool).toHaveBeenCalledWith('path')

    // 切換顏色、線寬與虛實線
    fireEvent.click(screen.getByRole('button', { name: '畫線顏色 #ef4444' }))
    expect(onChangeStyle).toHaveBeenCalledWith({ color: '#ef4444' })

    fireEvent.click(screen.getByRole('button', { name: '線寬 3px' }))
    expect(onChangeStyle).toHaveBeenCalledWith({ lineWidth: 3 })

    fireEvent.click(screen.getByRole('button', { name: '虛線' }))
    expect(onChangeStyle).toHaveBeenCalledWith({ lineStyle: 'dashed' })

    // 刪除選取與清除全部
    fireEvent.click(screen.getByRole('button', { name: /刪除選取畫線/ }))
    expect(onDeleteSelected).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /清除全部畫線/ }))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('disables horizontal and path drawing tools when 50 drawings limit is reached', () => {
    render(
      <ChartDrawingToolbar
        activeTool="cursor"
        onSelectTool={vi.fn()}
        currentStyle={defaultStyle}
        onChangeStyle={vi.fn()}
        selectedDrawing={null}
        drawingCount={50}
        onDeleteSelected={vi.fn()}
        onClearAll={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /水平線/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /路徑/ })).toBeDisabled()
    expect(screen.getByText('50/50')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components/ChartDrawingToolbar.test.tsx`
Expected: FAIL with `Cannot find module '@/components/ChartDrawingToolbar'`

- [ ] **Step 3: Implement `src/components/ChartDrawingToolbar.tsx`**

Implement `ChartDrawingToolbar` with accessible `aria-label`s (`選取游標`, `水平線`, `路徑`, `畫線顏色 ${color}`, `線寬 ${w}px`, `實線` / `虛線` / `點線`, `刪除選取畫線`, `清除全部畫線`) and quota badge (`${drawingCount}/${MAX_DRAWINGS_PER_SYMBOL}`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components/ChartDrawingToolbar.test.tsx`
Expected: PASS (2 passed)

---

### Task 4: 互動式 SVG 畫線圖層 (`ChartDrawingOverlay.tsx`)

**Files:**

- Create: `src/components/ChartDrawingOverlay.tsx`
- Test: `tests/unit/components/ChartDrawingOverlay.test.tsx`

**Interfaces:**

- Consumes: `OHLCVBar`, `ChartInterval` from `src/lib/ohlcv.ts`, `ActiveDrawingTool`, `ChartDrawing`, `DrawingPoint`, `DrawingStyle`, `DrawingToolType` from `src/lib/types.ts`, `pixelToDrawingPoint`, `drawingPointToPixel`, `dedupeConsecutivePoints`, `getStrokeDasharray`, `MAX_PATH_POINTS` from `src/lib/drawing-utils.ts`
- Produces:
  - `export interface ChartCoordinateAdapter`:
    - `coordinateToLogical: (x: number) => number | null`
    - `logicalToCoordinate: (logical: number) => number | null`
    - `timeToCoordinate?: (time: number) => number | null`
    - `coordinateToPrice: (y: number) => number | null`
    - `priceToCoordinate: (price: number) => number | null`
    - `setChartInteractionLocked?: (locked: boolean) => void`
  - `export interface ChartDrawingOverlayProps`:
    - `bars: OHLCVBar[]`
    - `interval: ChartInterval`
    - `adapter: ChartCoordinateAdapter | null`
    - `drawings: ChartDrawing[]`
    - `activeTool: ActiveDrawingTool`
    - `currentStyle: DrawingStyle`
    - `selectedDrawingId: string | null`
    - `revision: number` (incremented whenever `attachPrimitive.updateAllViews` or `ResizeObserver` fires)
    - `interactive: boolean` (`Boolean(user)`)
    - `onSelectDrawing: (id: string | null) => void`
    - `onCreateDrawing: (payload: { toolType: DrawingToolType; points: DrawingPoint[]; style: DrawingStyle }) => void`
    - `onUpdateDrawingPoints: (id: string, points: DrawingPoint[]) => void`
  - `export default function ChartDrawingOverlay(props: ChartDrawingOverlayProps)`

- [ ] **Step 1: Write the failing test in `tests/unit/components/ChartDrawingOverlay.test.tsx`**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ChartDrawingOverlay, { type ChartCoordinateAdapter } from '@/components/ChartDrawingOverlay'
import type { OHLCVBar } from '@/lib/ohlcv'
import type { ChartDrawing, DrawingStyle } from '@/lib/types'

const bars: OHLCVBar[] = [
  { time: 1700000000, open: 500, high: 510, low: 495, close: 505, volume: 1000 },
  { time: 1700086400, open: 505, high: 520, low: 500, close: 515, volume: 1200 },
  { time: 1700172800, open: 515, high: 530, low: 510, close: 525, volume: 1500 },
]

// 每個邏輯索引間隔 100px，價格 500 對應 y=200（每 +1 元 y -2px）
const mockAdapter: ChartCoordinateAdapter = {
  coordinateToLogical: (x) => x / 100,
  logicalToCoordinate: (logical) => logical * 100,
  coordinateToPrice: (y) => 500 + (200 - y) / 2,
  priceToCoordinate: (price) => 200 - (price - 500) * 2,
  setChartInteractionLocked: vi.fn(),
}

const defaultStyle: DrawingStyle = {
  color: '#3b82f6',
  lineWidth: 2,
  lineStyle: 'solid',
}

describe('ChartDrawingOverlay', () => {
  it('creates a horizontal line on a single click when activeTool is horizontal', () => {
    const onCreateDrawing = vi.fn()
    render(
      <ChartDrawingOverlay
        bars={bars}
        interval="1d"
        adapter={mockAdapter}
        drawings={[]}
        activeTool="horizontal"
        currentStyle={defaultStyle}
        selectedDrawingId={null}
        revision={1}
        interactive={true}
        onSelectDrawing={vi.fn()}
        onCreateDrawing={onCreateDrawing}
        onUpdateDrawingPoints={vi.fn()}
      />
    )

    const svg = screen.getByTestId('chart-drawing-overlay-1d')
    fireEvent.click(svg, { clientX: 100, clientY: 160 }) // y=160 -> price 520

    expect(onCreateDrawing).toHaveBeenCalledWith({
      toolType: 'horizontal',
      points: [{ time: 1700086400, price: 520 }],
      style: defaultStyle,
    })
  })

  it('draws a multi-point path (including future P5 point beyond last K-bar) and finishes on right-click (contextmenu)', () => {
    const onCreateDrawing = vi.fn()
    render(
      <ChartDrawingOverlay
        bars={bars}
        interval="1d"
        adapter={mockAdapter}
        drawings={[]}
        activeTool="path"
        currentStyle={defaultStyle}
        selectedDrawingId={null}
        revision={1}
        interactive={true}
        onSelectDrawing={vi.fn()}
        onCreateDrawing={onCreateDrawing}
        onUpdateDrawingPoints={vi.fn()}
      />
    )

    const svg = screen.getByTestId('chart-drawing-overlay-1d')

    // 點擊 P3 (idx 1, x=100, y=180 -> price 510)
    fireEvent.click(svg, { clientX: 100, clientY: 180 })
    // 點擊 P4 (idx 2, x=200, y=190 -> price 505)
    fireEvent.click(svg, { clientX: 200, clientY: 190 })
    // 點擊未來空白區的 P5 (idx 5, 距離最後一根 K 棒往右 3 格, x=500, y=140 -> price 530)
    fireEvent.click(svg, { clientX: 500, clientY: 140 })

    // 確認草稿折線已渲染
    expect(screen.getByTestId('draft-path-polyline')).toBeInTheDocument()

    // 按滑鼠右鍵 (contextmenu) 完成路徑繪製
    fireEvent.contextMenu(svg)

    expect(onCreateDrawing).toHaveBeenCalledWith({
      toolType: 'path',
      points: [
        { time: 1700086400, price: 510 },
        { time: 1700172800, price: 505 },
        { time: 1700172800 + 3 * 86400, price: 530 },
      ],
      style: defaultStyle,
    })
  })

  it('selects an existing drawing and updates its anchor point on pointer drag', () => {
    const onSelectDrawing = vi.fn()
    const onUpdateDrawingPoints = vi.fn()
    const existingDrawings: ChartDrawing[] = [
      {
        id: 'd-path-1',
        user_id: 'u-1',
        symbol: '2330.TW',
        tool_type: 'path',
        points: [
          { time: 1700000000, price: 500 },
          { time: 1700172800 + 2 * 86400, price: 520 }, // 未來點 idx 4 -> x=400, y=160
        ],
        style: defaultStyle,
        created_at: '',
        updated_at: '',
      },
    ]

    render(
      <ChartDrawingOverlay
        bars={bars}
        interval="1d"
        adapter={mockAdapter}
        drawings={existingDrawings}
        activeTool="cursor"
        currentStyle={defaultStyle}
        selectedDrawingId="d-path-1"
        revision={1}
        interactive={true}
        onSelectDrawing={onSelectDrawing}
        onCreateDrawing={vi.fn()}
        onUpdateDrawingPoints={onUpdateDrawingPoints}
      />
    )

    // 驗證第 2 個節點控制點存在 (data-testid="drawing-handle-d-path-1-1")
    const handle = screen.getByTestId('drawing-handle-d-path-1-1')
    expect(handle).toHaveAttribute('cx', '400')
    expect(handle).toHaveAttribute('cy', '160')

    // 拖曳該控制點至 x=600 (未來 idx 6), y=120 (price 540)
    fireEvent.pointerDown(handle, { clientX: 400, clientY: 160 })
    expect(mockAdapter.setChartInteractionLocked).toHaveBeenCalledWith(true)

    fireEvent.pointerMove(window, { clientX: 600, clientY: 120 })
    fireEvent.pointerUp(window, { clientX: 600, clientY: 120 })

    expect(mockAdapter.setChartInteractionLocked).toHaveBeenCalledWith(false)
    expect(onUpdateDrawingPoints).toHaveBeenCalledWith('d-path-1', [
      { time: 1700000000, price: 500 },
      { time: 1700172800 + 4 * 86400, price: 540 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components/ChartDrawingOverlay.test.tsx`
Expected: FAIL with `Cannot find module '@/components/ChartDrawingOverlay'`

- [ ] **Step 3: Implement `src/components/ChartDrawingOverlay.tsx`**

Implement `ChartDrawingOverlay` with:

- Relative client coordinate extraction (`clientX - rect.left`, `clientY - rect.top`).
- Horizontal line rendering (`<line data-testid={`drawing-line-${d.id}`}>` + price badge) and preview line on hover when `activeTool === 'horizontal'`.
- Multi-point path rendering (`<polyline data-testid={`drawing-path-${d.id}`}>`) and draft polyline (`<polyline data-testid="draft-path-polyline">`) with rubber-band cursor segment when `activeTool === 'path'`.
- Completion of `path` on `onContextMenu` (`e.preventDefault()`), `onDoubleClick` (with `dedupeConsecutivePoints`), and `Enter` / `Escape` keydown.
- Selection hit-target (`stroke="transparent" strokeWidth={12}`) and draggable anchor handles (`<circle data-testid={`drawing-handle-${d.id}-${idx}`}>`) that lock chart scroll/scale on `pointerdown`, update local preview on `window` `pointermove`, and commit once via `onUpdateDrawingPoints` on `window` `pointerup`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components/ChartDrawingOverlay.test.tsx`
Expected: PASS (3 passed)

---

### Task 5: 整合畫線系統至 `StockChart.tsx` 與 `StockList.tsx`（含右側未來留白與快捷鍵刪除）

**Files:**

- Modify: `src/components/StockChart.tsx`
- Modify: `src/components/StockList.tsx`
- Modify: `tests/unit/components/StockChart.test.tsx`

**Interfaces:**

- Consumes: `ChartDrawingToolbar`, `ChartDrawingOverlay`, `useChartDrawings`, `useChartDrawingMutations`, `DEFAULT_DRAWING_STYLE`, `AuthUser`
- Produces:
  - Updated `StockChartProps` in `src/components/StockChart.tsx`:
    - `user?: AuthUser | null`
  - `DEFAULT_RIGHT_OFFSET = 12` in `src/components/StockChart.tsx`

- [ ] **Step 1: Add failing test cases in `tests/unit/components/StockChart.test.tsx`**

Add tests in `tests/unit/components/StockChart.test.tsx` verifying:

1. `DEFAULT_RIGHT_OFFSET` is `12` (so the initial logical range `to` is `totalBars - 1 + 12`, leaving future space on the right for P4/P5 path drawing).
2. When `user={null}` (or omitted), `ChartDrawingToolbar` is not rendered.
3. When `user={{ id: 'u-1', email: 'owner@example.com' }}`, `ChartDrawingToolbar` and `ChartDrawingOverlay` are rendered, and the user can draw a horizontal line or path on the chart.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components/StockChart.test.tsx`
Expected: FAIL (missing toolbar when `user` is passed and `DEFAULT_RIGHT_OFFSET` still `2`)

- [ ] **Step 3: Update `src/components/StockChart.tsx` and `src/components/StockList.tsx`**

1. In `src/components/StockChart.tsx`:
   - Set `DEFAULT_RIGHT_OFFSET = 12`.
   - Accept `user?: AuthUser | null` in `StockChartProps`.
   - Call `useChartDrawings(user?.id, stock.symbol)` and `useChartDrawingMutations(user?.id, stock.symbol)`.
   - Manage `activeTool` (`'cursor' | 'horizontal' | 'path'`), `defaultStyle` (`DEFAULT_DRAWING_STYLE`), and `selectedDrawingId` (`string | null`), resetting `selectedDrawingId` and `activeTool` when `stock.symbol` changes.
   - Support `Delete` / `Backspace` keydown to delete the currently selected drawing.
   - When `user` is present, render `<ChartDrawingToolbar />` in the top header bar.
   - Inside `CandlestickPane`, expose a `ChartCoordinateAdapter` backed by `chart.timeScale().coordinateToLogical`, `chart.timeScale().logicalToCoordinate`, `chart.timeScale().timeToCoordinate`, `candleSeries.coordinateToPrice`, `candleSeries.priceToCoordinate`, and `chart.applyOptions({ handleScroll: !locked, handleScale: !locked })`. Attach a primitive (`candleSeries.attachPrimitive({ updateAllViews })`) regardless of whether `supportBoundary` exists so `ChartDrawingOverlay` updates on every zoom/pan!
2. In `src/components/StockList.tsx`:
   - Pass `user={user}` to `<StockChart stock={selectedStock} user={user} ... />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components/StockChart.test.tsx`
Expected: PASS

---

### Task 6: 端對端（E2E）畫線與跨時框／未來座標測試 (`tests/e2e/drawings.spec.ts`) 及全系統總驗證

**Files:**

- Create: `tests/e2e/drawings.spec.ts`

**Interfaces:**

- Consumes: Full Next.js application (`ScreenerDashboard`, `AuthHeaderControl`, `StockList`, `StockChart`, `ChartDrawingToolbar`, `ChartDrawingOverlay`)
- Produces: End-to-end Playwright verification of horizontal line & multi-point path drawing (including right-click completion and future space P5 drawing), cross-timeframe persistence, style editing, and deletion.

- [ ] **Step 1: Write the E2E test in `tests/e2e/drawings.spec.ts`**

Create `tests/e2e/drawings.spec.ts` testing:

1. Guest user does not see the drawing toolbar (`選取游標` / `水平線` / `路徑`).
2. User logs in: drawing toolbar appears on `StockChart`.
3. User selects `水平線` tool and clicks on the chart: horizontal line is rendered and persisted via `POST /rest/v1/chart_drawings`.
4. User selects `路徑` tool, clicks 3 points on the chart (including a future point on the right side of the last K-bar), and right-clicks (`contextmenu`) to finish: path polyline is rendered and persisted.
5. User switches timeframe from `日K` to `週K`: both the horizontal line and the path remain rendered and aligned on the weekly chart.
6. User selects a drawing, changes its color/style, and deletes it.

- [ ] **Step 2: Run full test suite, linter, formatter, build, and Playwright E2E**

Run: `pnpm test && pnpm lint && pnpm format:check && pnpm build && pnpm test:e2e`
Expected: All unit tests PASS, 0 ESLint errors, Prettier check PASS, Next.js build succeeds, and all Playwright E2E tests PASS.
