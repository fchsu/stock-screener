'use client'

import type { ActiveDrawingTool, ChartDrawing, DrawingLineStyle, DrawingStyle } from '@/lib/types'
import { canCreateDrawing, DRAWING_COLORS, MAX_DRAWINGS_PER_SYMBOL } from '@/lib/drawing-utils'

export interface ChartDrawingToolbarProps {
  activeTool: ActiveDrawingTool
  onSelectTool: (tool: ActiveDrawingTool) => void
  currentStyle: DrawingStyle
  onChangeStyle: (patch: Partial<DrawingStyle>) => void
  selectedDrawing: ChartDrawing | null
  drawingCount: number
  onDeleteSelected: () => void
  onClearAll: () => void
}

const LINE_WIDTH_OPTIONS: Array<1 | 2 | 3> = [1, 2, 3]

const LINE_STYLE_OPTIONS: Array<{ value: DrawingLineStyle; label: string; symbol: string }> = [
  { value: 'solid', label: '實線', symbol: '──' },
  { value: 'dashed', label: '虛線', symbol: '--' },
  { value: 'dotted', label: '點線', symbol: '··' },
]

export default function ChartDrawingToolbar({
  activeTool,
  onSelectTool,
  currentStyle,
  onChangeStyle,
  selectedDrawing,
  drawingCount,
  onDeleteSelected,
  onClearAll,
}: ChartDrawingToolbarProps) {
  const isQuotaAvailable = canCreateDrawing(drawingCount)
  const effectiveStyle = selectedDrawing ? selectedDrawing.style : currentStyle

  return (
    <div
      data-testid="chart-drawing-toolbar"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100/90 px-1.5 py-0.5 dark:border-gray-800 dark:bg-gray-900"
      role="toolbar"
      aria-label="K線畫線工具列"
    >
      {/* 畫線工具切換群組 */}
      <div className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onSelectTool('cursor')}
          aria-pressed={activeTool === 'cursor'}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            activeTool === 'cursor'
              ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          ↖ 選取游標
        </button>

        <button
          type="button"
          disabled={!isQuotaAvailable}
          onClick={() => onSelectTool('horizontal')}
          aria-pressed={activeTool === 'horizontal'}
          title={!isQuotaAvailable ? '已達每檔 50 條上限' : '點擊圖表繪製水平線'}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            activeTool === 'horizontal'
              ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          ─ 水平線
        </button>

        <button
          type="button"
          disabled={!isQuotaAvailable}
          onClick={() => onSelectTool('path')}
          aria-pressed={activeTool === 'path'}
          title={
            !isQuotaAvailable ? '已達每檔 50 條上限' : '依序點擊繪製路徑，按右鍵或雙擊完成繪製'
          }
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            activeTool === 'path'
              ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          ╱╲ 路徑
        </button>
      </div>

      <span className="h-3.5 w-px bg-gray-300 dark:bg-gray-700" aria-hidden="true" />

      {/* 顏色選擇器 */}
      <div className="inline-flex items-center gap-1" role="group" aria-label="畫線顏色">
        {DRAWING_COLORS.map((color) => {
          const isSelected = effectiveStyle.color.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              aria-label={`畫線顏色 ${color}`}
              onClick={() => onChangeStyle({ color })}
              style={{ backgroundColor: color }}
              className={`h-3.5 w-3.5 rounded-full transition-transform ${
                isSelected
                  ? 'scale-110 ring-2 ring-gray-900 ring-offset-1 dark:ring-white dark:ring-offset-gray-900'
                  : 'opacity-75 hover:opacity-100'
              }`}
            />
          )
        })}
      </div>

      {/* 粗細選擇器 */}
      <div className="inline-flex items-center gap-0.5" role="group" aria-label="畫線粗細">
        {LINE_WIDTH_OPTIONS.map((w) => {
          const isSelected = effectiveStyle.lineWidth === w
          return (
            <button
              key={w}
              type="button"
              aria-label={`線寬 ${w}px`}
              onClick={() => onChangeStyle({ lineWidth: w })}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                isSelected
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {w}px
            </button>
          )
        })}
      </div>

      {/* 虛實線選擇器 */}
      <div className="inline-flex items-center gap-0.5" role="group" aria-label="畫線樣式">
        {LINE_STYLE_OPTIONS.map((opt) => {
          const isSelected = effectiveStyle.lineStyle === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-label={opt.label}
              title={opt.label}
              onClick={() => onChangeStyle({ lineStyle: opt.value })}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                isSelected
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {opt.symbol}
            </button>
          )
        })}
      </div>

      {/* 配額與刪除控制 */}
      <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">
        {drawingCount}/{MAX_DRAWINGS_PER_SYMBOL}
      </span>

      {selectedDrawing && (
        <button
          type="button"
          aria-label="刪除選取畫線"
          onClick={onDeleteSelected}
          className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/70 dark:text-red-300"
        >
          刪除
        </button>
      )}

      {drawingCount > 0 && (
        <button
          type="button"
          aria-label="清除全部畫線"
          onClick={onClearAll}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          清除全部
        </button>
      )}
    </div>
  )
}
