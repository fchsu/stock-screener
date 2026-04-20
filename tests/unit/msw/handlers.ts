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
]
