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
