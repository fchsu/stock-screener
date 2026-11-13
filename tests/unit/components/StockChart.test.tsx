import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StockChart from '@/components/StockChart'
import * as queries from '@/services/queries'
import type { StockAsset } from '@/lib/types'

const mockCreatePriceLine = vi.fn()
const mockSetData = vi.fn()
const mockSetVisibleLogicalRange = vi.fn()
const mockSubscribeVisibleLogicalRangeChange = vi.fn()
const mockUnsubscribeVisibleLogicalRangeChange = vi.fn()
const mockSubscribeCrosshairMove = vi.fn()
const mockUnsubscribeCrosshairMove = vi.fn()
const mockSetCrosshairPosition = vi.fn()
const mockClearCrosshairPosition = vi.fn()
const mockRemove = vi.fn()

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      setData: mockSetData,
      createPriceLine: mockCreatePriceLine,
      priceToCoordinate: vi.fn(() => 180),
      coordinateToPrice: vi.fn(() => 508),
      attachPrimitive: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    })),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      setVisibleLogicalRange: mockSetVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: mockSubscribeVisibleLogicalRangeChange,
      unsubscribeVisibleLogicalRangeChange: mockUnsubscribeVisibleLogicalRangeChange,
      coordinateToLogical: vi.fn((x: number) => x / 100),
      logicalToCoordinate: vi.fn((logical: number) => logical * 100),
      timeToCoordinate: vi.fn(() => 100),
    })),
    subscribeCrosshairMove: mockSubscribeCrosshairMove,
    unsubscribeCrosshairMove: mockUnsubscribeCrosshairMove,
    setCrosshairPosition: mockSetCrosshairPosition,
    clearCrosshairPosition: mockClearCrosshairPosition,
    applyOptions: vi.fn(),
    remove: mockRemove,
  })),
  CandlestickSeries: 'Candlestick',
  HistogramSeries: 'Histogram',
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Dashed: 2 },
}))

vi.mock('@/services/queries', () => ({
  useStockOHLCV: vi.fn(),
}))

const mockCreateDrawingMutate = vi.fn()
const mockUpdateDrawingMutate = vi.fn()
const mockDeleteDrawingMutate = vi.fn()
const mockClearDrawingsMutate = vi.fn()

vi.mock('@/services/drawing-queries', () => ({
  useChartDrawings: vi.fn(() => ({
    data: [
      {
        id: 'd-existing-1',
        user_id: 'u-1',
        symbol: '2330.TW',
        tool_type: 'horizontal',
        points: [{ time: 1700000000, price: 500 }],
        style: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },
        created_at: '',
        updated_at: '',
      },
    ],
    isLoading: false,
  })),
  useChartDrawingMutations: vi.fn(() => ({
    createDrawing: { mutate: mockCreateDrawingMutate },
    updateDrawing: { mutate: mockUpdateDrawingMutate },
    deleteDrawing: { mutate: mockDeleteDrawingMutate },
    clearSymbolDrawings: { mutate: mockClearDrawingsMutate },
  })),
}))

const mockStock: StockAsset = {
  symbol: '2330.TW',
  name: '台積電',
  market: 'TWSE',
  matchLevel: 'strict',
  tradingViewUrl: 'https://www.tradingview.com/chart/?symbol=TWSE:2330',
  tradingDate: '2026-04-17',
}

describe('StockChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render top-left OHLCV legend with 張 for TWSE and update on crosshair move', () => {
    vi.mocked(queries.useStockOHLCV).mockReturnValue({
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: [
          { time: 1700000000, open: 500, high: 510, low: 495, close: 500, volume: 10000000 },
          { time: 1700086400, open: 505, high: 525, low: 502, close: 520, volume: 25000000 },
        ],
        supportBoundary: 495,
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="single"
        onChangeViewMode={vi.fn()}
      />
    )

    // 預設顯示最新一根 K 棒資訊：開 505、高 525、低 502、收 520、+20 (+4%)、量 25,000 張
    const legend = screen.getByTestId('ohlcv-legend')
    expect(legend).toHaveTextContent('開 505')
    expect(legend).toHaveTextContent('高 525')
    expect(legend).toHaveTextContent('低 502')
    expect(legend).toHaveTextContent('收 520')
    expect(legend).toHaveTextContent('+20')
    expect(legend).toHaveTextContent('+4%')
    expect(legend).toHaveTextContent('25,000 張')

    // 模擬滑鼠移至第一根 K 棒 (time: 1700000000)
    const crosshairHandler = mockSubscribeCrosshairMove.mock.calls[0]?.[0]
    expect(crosshairHandler).toBeDefined()
    act(() => {
      crosshairHandler({ time: 1700000000 })
    })

    expect(screen.getByTestId('ohlcv-legend')).toHaveTextContent('開 500')
    expect(screen.getByTestId('ohlcv-legend')).toHaveTextContent('10,000 張')
  })

  it('should render Picture-in-Picture (子母模式) with 30% width overlay and swap 日K/週K', () => {
    vi.mocked(queries.useStockOHLCV).mockReturnValue({
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: [{ time: 1700000000, open: 500, high: 520, low: 495, close: 515, volume: 12000000 }],
        supportBoundary: 495,
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="pip"
        onChangeViewMode={vi.fn()}
      />
    )

    // 驗證左下角 30% 寬度子圖容器存在，預設主圖日K、子圖週K
    const pipSubContainer = screen.getByTestId('pip-sub-chart')
    expect(pipSubContainer).toBeInTheDocument()
    expect(pipSubContainer.className).toContain('w-[30%]')
    expect(pipSubContainer.className).toContain('h-[30%]')
    expect(screen.getByText('子圖：週K')).toBeInTheDocument()
    expect(screen.getByTestId('chart-canvas-1d')).toBeInTheDocument()
    expect(screen.getByTestId('chart-canvas-1wk')).toBeInTheDocument()

    // 點擊「切換日/週線」按鈕後，子圖應變為日K，主圖變為週K
    const swapBtn = screen.getByRole('button', { name: /切換日\/週線/ })
    fireEvent.click(swapBtn)
    expect(screen.getByText('子圖：日K')).toBeInTheDocument()
  })

  it('should synchronize crosshair position between main and sub charts in pip mode', () => {
    const mock1wkResult = {
      data: {
        symbol: '2330.TW',
        interval: '1wk',
        bars: [
          { time: 1792944000, open: 500, high: 520, low: 495, close: 510, volume: 50000000 },
          { time: 1793548800, open: 510, high: 535, low: 505, close: 530, volume: 60000000 },
        ],
        supportBoundary: 495,
      },
      isLoading: false,
      isError: false,
    }
    const mock1dResult = {
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: [
          { time: 1793322000, open: 505, high: 520, low: 500, close: 510, volume: 12000000 },
          { time: 1793754000, open: 515, high: 535, low: 512, close: 530, volume: 18000000 },
        ],
        supportBoundary: 495,
      },
      isLoading: false,
      isError: false,
    }
    vi.mocked(queries.useStockOHLCV).mockImplementation((_symbol, interval) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (interval === '1wk' ? mock1wkResult : mock1dResult) as any
    })

    render(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="pip"
        onChangeViewMode={vi.fn()}
      />
    )

    // 主圖 (1d) 為第一個註冊的 crosshair handler，子圖 (1wk) 為第二個
    const mainCrosshairHandler = mockSubscribeCrosshairMove.mock.calls[0]?.[0]
    const subCrosshairHandler = mockSubscribeCrosshairMove.mock.calls[1]?.[0]
    expect(mainCrosshairHandler).toBeDefined()
    expect(subCrosshairHandler).toBeDefined()

    // 1. 滑鼠在主圖 (1d) 移動至 11/04 (1793754000)，子圖 (1wk) 應同步顯示十字線於當週 11/02 (1793548800)
    act(() => {
      mainCrosshairHandler({ time: 1793754000, point: { x: 200, y: 120 } })
    })
    expect(mockSetCrosshairPosition).toHaveBeenCalledWith(508, 1793548800, expect.anything())

    // 2. 滑鼠在子圖 (1wk) 移動至 10/26 當週 (1792944000)，主圖 (1d) 應同步顯示十字線於該週交易日 10/30 (1793322000) 並更新左上角圖例
    mockSetCrosshairPosition.mockClear()
    act(() => {
      subCrosshairHandler({ time: 1792944000, point: { x: 80, y: 60 } })
    })
    expect(mockSetCrosshairPosition).toHaveBeenCalledWith(508, 1793322000, expect.anything())
    expect(screen.getByTestId('ohlcv-legend')).toHaveTextContent('開 505')

    // 3. 滑鼠移出子圖時，應清除另一側的十字線
    act(() => {
      subCrosshairHandler({})
    })
    expect(mockClearCrosshairPosition).toHaveBeenCalled()
  })

  it('should preserve zoomed bar count across timeframe and stock switches', () => {
    vi.mocked(queries.useStockOHLCV).mockReturnValue({
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: Array.from({ length: 200 }, (_, i) => ({
          time: 1700000000 + i * 86400,
          open: 500,
          high: 520,
          low: 495,
          close: 515,
          volume: 12000,
        })),
        supportBoundary: 495,
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { rerender } = render(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="single"
        onChangeViewMode={vi.fn()}
      />
    )

    const rangeChangeHandler = mockSubscribeVisibleLogicalRangeChange.mock.calls[0]?.[0]
    rangeChangeHandler({ from: 150, to: 200 })

    mockSetVisibleLogicalRange.mockClear()

    const nextStock: StockAsset = {
      ...mockStock,
      symbol: '2317.TW',
      name: '鴻海',
    }
    rerender(
      <StockChart
        stock={nextStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="single"
        onChangeViewMode={vi.fn()}
      />
    )

    expect(mockSetVisibleLogicalRange).toHaveBeenCalled()
    const appliedRange = mockSetVisibleLogicalRange.mock.calls[0][0]
    expect(Math.round(appliedRange.to - appliedRange.from)).toBe(50)
  })

  it('leaves 12 bars of future rightOffset by default and shows drawing toolbar & overlay only when authenticated', () => {
    vi.mocked(queries.useStockOHLCV).mockReturnValue({
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: [
          { time: 1700000000, open: 500, high: 510, low: 495, close: 500, volume: 10000000 },
          { time: 1700086400, open: 505, high: 525, low: 502, close: 520, volume: 25000000 },
        ],
        supportBoundary: 495,
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { rerender } = render(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="single"
        onChangeViewMode={vi.fn()}
        user={null}
      />
    )

    // 驗證預設右側未來預留空間為 12 根 K 棒 (totalBars=2, lastIdx=1 -> to = 1 + 12 = 13)
    expect(mockSetVisibleLogicalRange).toHaveBeenCalledWith(expect.objectContaining({ to: 13 }))

    // 未登入時不顯示畫線工具列
    expect(screen.queryByTestId('chart-drawing-toolbar')).not.toBeInTheDocument()

    // 登入後顯示畫線工具列與 SVG 畫線圖層，並可切換工具繪製水平線
    rerender(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={vi.fn()}
        viewMode="single"
        onChangeViewMode={vi.fn()}
        user={{ id: 'u-1', email: 'owner@example.com' }}
      />
    )

    expect(screen.getByTestId('chart-drawing-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('drawing-line-d-existing-1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /水平線/ }))
    const overlay = screen.getByTestId('chart-drawing-overlay-1d')
    fireEvent.click(overlay, { clientX: 100, clientY: 140 })

    expect(mockCreateDrawingMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolType: 'horizontal',
        points: [{ time: 1700086400, price: 508 }],
      })
    )
  })
})
