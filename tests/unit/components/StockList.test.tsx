import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StockList from '@/components/StockList'
import * as queries from '@/services/queries'
import { mockScreeningResults } from '../msw/handlers'

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      setData: vi.fn(),
      createPriceLine: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    })),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  CandlestickSeries: 'Candlestick',
  HistogramSeries: 'Histogram',
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Dashed: 2 },
}))

vi.mock('@/services/queries', () => ({
  useScreeningResult: vi.fn(),
  useStockOHLCV: vi.fn(() => ({
    data: {
      symbol: '2330.TW',
      interval: '1d',
      bars: [{ time: 1700000000, open: 500, high: 520, low: 495, close: 515, volume: 12000 }],
      supportBoundary: 495,
    },
    isLoading: false,
    isError: false,
  })),
}))

describe('StockList (Sidebar + Chart Workspace)', () => {
  it('should display loading state', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isSuccess: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-04-17" />)
    expect(screen.getByText(/載入中/)).toBeInTheDocument()
  })

  it('should display error state', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      isSuccess: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-04-17" />)
    expect(screen.getByText(/發生錯誤/)).toBeInTheDocument()
  })

  it('should render sidebar with 標準圖 and 慣性改變 groups and switch between 台股 and 美股', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: mockScreeningResults,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-04-17" />)

    // 驗證側邊欄兩個群組標題（標準圖、慣性改變）
    expect(screen.getAllByText(/標準圖/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/慣性改變/).length).toBeGreaterThan(0)

    // 預設顯示台股標的並自動載入第一檔 K 線圖
    expect(screen.getAllByText('台積電').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2330.TW').length).toBeGreaterThan(0)
    expect(screen.getByText('當日數據')).toBeInTheDocument()

    // 點擊切換至「美股」Tab
    const usTab = screen.getByRole('tab', { name: /美股/ })
    fireEvent.click(usTab)

    expect(screen.getAllByText('NVIDIA Corporation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('NVDA').length).toBeGreaterThan(0)
    expect(screen.getByText('前一交易日數據（當日尚未開盤）')).toBeInTheDocument()
  })

  it('should switch selected stock in chart when clicking another item or pressing ArrowDown', () => {
    const multiTwseResults = [
      {
        id: 'mock-uuid-1',
        date: '2026-10-01',
        market: 'TWSE' as const,
        status: 'completed' as const,
        assets: [
          {
            symbol: '2330.TW',
            name: '台積電',
            market: 'TWSE' as const,
            matchLevel: 'strict',
            tradingViewUrl: 'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2330',
            tradingDate: '2026-10-01',
          },
          {
            symbol: '2014.TW',
            name: '中鴻',
            market: 'TWSE' as const,
            matchLevel: 'momentum',
            tradingViewUrl: 'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2014',
            tradingDate: '2026-10-01',
          },
        ],
        updated_at: '2026-10-01T07:00:00Z',
      },
    ]

    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: multiTwseResults,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-10-01" />)

    expect(screen.getAllByText(/資料基準日：2026-10-01/).length).toBeGreaterThan(0)

    // 點擊側邊欄的「中鴻」切換 K 線圖標的
    const stockItem = screen.getByRole('button', { name: /中鴻/ })
    fireEvent.click(stockItem)

    const tvLink = screen.getByRole('link', { name: /在 TradingView 開啟/i })
    expect(tvLink).toHaveAttribute(
      'href',
      'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2014'
    )
  })

  it('should display pending screening state with schedule info when empty on today', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
    }).format(new Date())

    render(<StockList date={todayStr} />)

    expect(screen.getByText('本日尚未執行篩選')).toBeInTheDocument()
    expect(screen.getByText(/15:15（台灣時間）/)).toBeInTheDocument()
  })

  it('should display no records message when empty on a past day', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2020-01-01" />)

    expect(screen.getByText(/該日無篩選紀錄/)).toBeInTheDocument()
  })

  it('should display clear closed notices for TWSE and US markets when switching tabs', () => {
    const closedResults = [
      {
        id: 'closed-twse',
        date: '2026-10-03',
        market: 'TWSE' as const,
        status: 'closed' as const,
        assets: [],
        updated_at: '2026-10-03T07:15:00Z',
      },
      {
        id: 'closed-us',
        date: '2026-10-03',
        market: 'S&P 500' as const,
        status: 'closed' as const,
        assets: [],
        updated_at: '2026-10-03T07:15:00Z',
      },
    ]

    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: closedResults,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-10-03" />)

    expect(screen.getByText('今日休市（未開盤交易，週末或國定假日／颱風假）')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /美股/ }))
    expect(screen.getByText('前一交易日休市（未開盤交易，週末或美國國定假日）')).toBeInTheDocument()
  })
})
