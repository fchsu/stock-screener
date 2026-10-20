import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StockChart from '@/components/StockChart'
import * as queries from '@/services/queries'
import type { StockAsset } from '@/lib/types'

// Mock lightweight-charts for jsdom environment
const mockCreatePriceLine = vi.fn()
const mockSetData = vi.fn()
const mockFitContent = vi.fn()
const mockRemove = vi.fn()

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      setData: mockSetData,
      createPriceLine: mockCreatePriceLine,
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    })),
    timeScale: vi.fn(() => ({ fitContent: mockFitContent })),
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
  it('should render stock info, timeframe buttons, support boundary, and toggle view mode', () => {
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

    // 點擊 60K 按鈕
    fireEvent.click(screen.getByRole('button', { name: /60K/ }))
    expect(onSelectInterval).toHaveBeenCalledWith('60m')

    // 點擊週K 按鈕
    fireEvent.click(screen.getByRole('button', { name: /週K/ }))
    expect(onSelectInterval).toHaveBeenCalledWith('1wk')

    // 點擊三時框並排按鈕
    fireEvent.click(screen.getByRole('button', { name: /三時框並排/ }))
    expect(onToggleViewMode).toHaveBeenCalledTimes(1)

    // 檢查外開 TradingView 連結
    const tvLink = screen.getByRole('link', { name: /TradingView/i })
    expect(tvLink).toHaveAttribute('href', 'https://www.tradingview.com/chart/?symbol=TWSE:2330')
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
