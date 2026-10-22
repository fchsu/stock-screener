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
const mockRemove = vi.fn()

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      setData: mockSetData,
      createPriceLine: mockCreatePriceLine,
      priceToCoordinate: vi.fn(() => 180),
      attachPrimitive: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    })),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      setVisibleLogicalRange: mockSetVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: mockSubscribeVisibleLogicalRangeChange,
      unsubscribeVisibleLogicalRangeChange: mockUnsubscribeVisibleLogicalRangeChange,
    })),
    subscribeCrosshairMove: mockSubscribeCrosshairMove,
    unsubscribeCrosshairMove: mockUnsubscribeCrosshairMove,
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
})
