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
})
