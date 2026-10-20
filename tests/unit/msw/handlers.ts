import { http, HttpResponse } from 'msw'
import type { ScreeningResult } from '@/lib/database.types'

// MSW handler 範例：攔截 Supabase REST 請求
// 實際的 Supabase URL pattern 會在 US1 測試中依需求擴充

export const mockScreeningResults: ScreeningResult[] = [
  {
    id: 'mock-uuid-1',
    date: '2026-04-17',
    market: 'TWSE',
    status: 'completed',
    assets: [
      {
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        matchLevel: 'strict',
        tradingViewUrl: 'https://www.tradingview.com/chart/?symbol=TWSE:2330',
      },
    ],
    updated_at: '2026-04-17T07:00:00Z',
  },
  {
    id: 'mock-uuid-2',
    date: '2026-04-17',
    market: 'NASDAQ',
    status: 'completed',
    assets: [
      {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        market: 'NASDAQ',
        matchLevel: 'momentum',
        tradingViewUrl: 'https://www.tradingview.com/chart/?symbol=NASDAQ:NVDA',
      },
    ],
    updated_at: '2026-04-17T07:00:00Z',
  },
]

export const handlers = [
  // Supabase REST: GET screening_results
  http.get('*/rest/v1/screening_results', () => {
    return HttpResponse.json(mockScreeningResults)
  }),
  // 站內 K 線 API: GET /api/ohlcv
  http.get('*/api/ohlcv', ({ request }) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol') || '2330.TW'
    const interval = url.searchParams.get('interval') || '1d'
    return HttpResponse.json({
      symbol,
      interval,
      bars: [
        { time: 1700000000, open: 500, high: 520, low: 495, close: 515, volume: 12000 },
        { time: 1700086400, open: 515, high: 530, low: 510, close: 525, volume: 15000 },
      ],
      supportBoundary: 495,
    })
  }),
]
