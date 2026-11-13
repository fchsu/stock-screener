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

vi.mock('@/services/watchlist-queries', () => ({
  useWatchlists: vi.fn(() => ({
    data: [
      {
        id: 'wl-1',
        user_id: 'u-1',
        name: '自選一',
        sort_order: 0,
        created_at: '',
        updated_at: '',
        groups: [],
        items: [],
      },
    ],
    isLoading: false,
  })),
  useWatchlistMutations: vi.fn(() => ({
    createWatchlist: { mutate: vi.fn(), mutateAsync: vi.fn() },
    renameWatchlist: { mutate: vi.fn() },
    deleteWatchlist: { mutate: vi.fn() },
    createGroup: { mutate: vi.fn() },
    renameGroup: { mutate: vi.fn() },
    deleteGroup: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
    reorderGroups: { mutate: vi.fn() },
    moveOrReorderItem: { mutate: vi.fn() },
  })),
}))

vi.mock('@/services/drawing-queries', () => ({
  useChartDrawings: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useChartDrawingMutations: vi.fn(() => ({
    createDrawing: { mutate: vi.fn() },
    updateDrawing: { mutate: vi.fn() },
    deleteDrawing: { mutate: vi.fn() },
    clearSymbolDrawings: { mutate: vi.fn() },
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

    // 驗證側邊欄兩個群組標題（標準圖、慣性改變）且具備 sticky top-0 固定置頂樣式
    const stickyHeaders = screen.getAllByTestId('sticky-group-header')
    expect(stickyHeaders).toHaveLength(2)
    expect(stickyHeaders[0].className).toContain('sticky')
    expect(stickyHeaders[0].className).toContain('top-0')
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

    // 使用鍵盤左方向鍵 (ArrowLeft) 切換回台股，再用右方向鍵 (ArrowRight) 切換至美股
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('當日數據')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('前一交易日數據（當日尚未開盤）')).toBeInTheDocument()
  })

  it('should switch selected stock and scroll it into view when pressing ArrowDown', () => {
    const scrollIntoViewMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
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

    scrollIntoViewMock.mockClear()

    // 按下 ArrowDown 切換至下一檔「中鴻」，並確認自動捲動至可視區域
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' })

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

  it('hides watchlist tab and + buttons when unauthenticated, and shows them + switches chart on clicking + when authenticated', () => {
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

    const { rerender } = render(<StockList date="2026-10-01" user={null} />)

    // 未登入時不顯示觀察清單 Tab 與 + 按鈕
    expect(screen.queryByRole('tab', { name: /清單/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /加入觀察清單/ })).not.toBeInTheDocument()

    // 登入後顯示 ★ 清單 Tab 與每檔標的右側 + 按鈕
    rerender(<StockList date="2026-10-01" user={{ id: 'u-1', email: 'owner@example.com' }} />)
    expect(screen.getByRole('tab', { name: /清單/ })).toBeInTheDocument()

    // 點擊第二檔「中鴻」右側的 + 按鈕，應同時將右側 K 線圖切換為 2014.TW
    fireEvent.click(screen.getByRole('button', { name: /加入觀察清單：中鴻/ }))
    const tvLink = screen.getByRole('link', { name: /在 TradingView 開啟/i })
    expect(tvLink).toHaveAttribute(
      'href',
      'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2014'
    )
  })
})
