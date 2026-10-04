import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StockList from '@/components/StockList'
import * as queries from '@/services/queries'
import { mockScreeningResults } from '../msw/handlers'

// Mock useScreeningResult
vi.mock('@/services/queries', () => ({
  useScreeningResult: vi.fn(),
}))

describe('StockList', () => {
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

  it('should render the screening results', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: mockScreeningResults,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-04-17" />)

    // 台股區塊
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('2330.TW')).toBeInTheDocument()
    const twseLink = screen.getAllByRole('link', { name: /TradingView/i })[0]
    expect(twseLink).toHaveAttribute('href', 'https://www.tradingview.com/chart/?symbol=TWSE:2330')

    // 美股區塊
    expect(screen.getByText('NVIDIA Corporation')).toBeInTheDocument()
    expect(screen.getByText('NVDA')).toBeInTheDocument()
  })

  it('should display tradingDate when provided', () => {
    const resultsWithTradingDate = [
      {
        id: 'mock-uuid-1',
        date: '2026-10-01',
        market: 'TWSE' as const,
        status: 'completed' as const,
        assets: [
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
      data: resultsWithTradingDate,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-10-01" />)

    expect(screen.getByText('資料基準日：2026-10-01')).toBeInTheDocument()
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

  it('should display market section badges for time-lag clarity', () => {
    vi.mocked(queries.useScreeningResult).mockReturnValue({
      data: mockScreeningResults,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StockList date="2026-04-17" />)

    expect(screen.getByText('當日數據')).toBeInTheDocument()
    expect(screen.getByText('前一交易日數據（當日尚未開盤）')).toBeInTheDocument()
  })

  it('should display clear closed notices for TWSE and US markets', () => {
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
    expect(screen.getByText('前一交易日休市（未開盤交易，週末或美國國定假日）')).toBeInTheDocument()
  })
})
