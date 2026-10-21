import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StockChart from '@/components/StockChart'
import * as queries from '@/services/queries'
import type { StockAsset } from '@/lib/types'

const mockCreatePriceLine = vi.fn()
const mockSetData = vi.fn()
const mockSetVisibleLogicalRange = vi.fn()
const mockSubscribeVisibleLogicalRangeChange = vi.fn()
const mockUnsubscribeVisibleLogicalRangeChange = vi.fn()
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

  it('should render stock info, timeframe buttons, left-aligned support boundary label, and toggle view mode', () => {
    vi.mocked(queries.useStockOHLCV).mockReturnValue({
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: Array.from({ length: 120 }, (_, i) => ({
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

    const onSelectInterval = vi.fn()
    const onToggleViewMode = vi.fn()

    render(
      <StockChart
        stock={mockStock}
        activeInterval="1d"
        onSelectInterval={onSelectInterval}
        viewMode="single"
        onToggleViewMode={onToggleViewMode}
      />
    )

    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('2330.TW')).toBeInTheDocument()
    expect(screen.getByText(/關鍵邊界：495/)).toBeInTheDocument()

    // 確認 createPriceLine 的 title 為空字串（避免右側擋住近期 K 棒），並於左側渲染標籤
    expect(mockCreatePriceLine).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 495,
        title: '',
      })
    )
    const leftLabel = screen.getByTestId('support-boundary-left-label')
    expect(leftLabel).toBeInTheDocument()
    expect(leftLabel).toHaveTextContent('週線關鍵邊界')

    // 點擊 60K 按鈕
    fireEvent.click(screen.getByRole('button', { name: /60K/ }))
    expect(onSelectInterval).toHaveBeenCalledWith('60m')

    // 點擊週K 按鈕
    fireEvent.click(screen.getByRole('button', { name: /週K/ }))
    expect(onSelectInterval).toHaveBeenCalledWith('1wk')

    // 點擊三時框並排按鈕
    fireEvent.click(screen.getByRole('button', { name: /三時框並排/ }))
    expect(onToggleViewMode).toHaveBeenCalledTimes(1)
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
        onToggleViewMode={vi.fn()}
      />
    )

    // 模擬使用者透過滾輪縮放將可見範圍調整為 50 根 K 棒 (例如從 150 到 200)
    const rangeChangeHandler = mockSubscribeVisibleLogicalRangeChange.mock.calls[0]?.[0]
    expect(rangeChangeHandler).toBeDefined()
    rangeChangeHandler({ from: 150, to: 200 })

    mockSetVisibleLogicalRange.mockClear()

    // 切換至另一檔股票，應維持相同的 50 根 K 棒區間寬度
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
        onToggleViewMode={vi.fn()}
      />
    )

    expect(mockSetVisibleLogicalRange).toHaveBeenCalled()
    const appliedRange = mockSetVisibleLogicalRange.mock.calls[0][0]
    expect(Math.round(appliedRange.to - appliedRange.from)).toBe(50)
  })

  it('should render three chart panes when viewMode is multi', () => {
    vi.mocked(queries.useStockOHLCV).mockReturnValue({
      data: {
        symbol: '2330.TW',
        interval: '1d',
        bars: [{ time: 1700000000, open: 500, high: 520, low: 495, close: 515, volume: 12000 }],
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
        viewMode="multi"
        onToggleViewMode={vi.fn()}
      />
    )

    expect(screen.getByText('週K（位置與長下影線）')).toBeInTheDocument()
    expect(screen.getByText('日K（破底翻型態）')).toBeInTheDocument()
    expect(screen.getByText('60K（短線轉折結構）')).toBeInTheDocument()
  })
})
