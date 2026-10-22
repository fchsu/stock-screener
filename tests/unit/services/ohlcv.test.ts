import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import {
  parseYahooChartResponse,
  calculateSupportBoundary,
  formatChartVolume,
  computeBarLegendData,
  type OHLCVBar,
} from '@/lib/ohlcv'
import { GET } from '@/app/api/ohlcv/route'

describe('ohlcv utilities', () => {
  it('should parse Yahoo Finance v8 chart JSON and filter out null bars', () => {
    const mockYahooJson = {
      chart: {
        result: [
          {
            timestamp: [1700000000, 1700086400, 1700172800],
            indicators: {
              quote: [
                {
                  open: [100, null, 105],
                  high: [110, null, 112],
                  low: [95, null, 101],
                  close: [108, null, 110],
                  volume: [1000, null, 1500],
                },
              ],
            },
          },
        ],
      },
    }

    const bars = parseYahooChartResponse(mockYahooJson)
    expect(bars).toHaveLength(2)
    expect(bars[0]).toEqual({
      time: 1700000000,
      open: 100,
      high: 110,
      low: 95,
      close: 108,
      volume: 1000,
    })
    expect(bars[1]).toEqual({
      time: 1700172800,
      open: 105,
      high: 112,
      low: 101,
      close: 110,
      volume: 1500,
    })
  })

  it('should calculate Old Yu weekly support boundary from weekly OHLCV bars', () => {
    // 建立 20 根週 K，包含兩個在 ~100 附近的 Swing Low (window=2)，以及最後一週出現假跌破長下影線
    const baseTime = 1700000000
    const weekSec = 7 * 86400
    const bars: OHLCVBar[] = Array.from({ length: 15 }, (_, i) => ({
      time: baseTime + i * weekSec,
      open: 115,
      high: 120,
      low: 110,
      close: 116,
      volume: 10000,
    }))

    // Swing Low 1 at index 3 (low = 100)
    bars[3] = { ...bars[3], open: 108, high: 110, low: 100, close: 106 }
    // Swing Low 2 at index 9 (low = 101, within 5% of 100 -> boundary = min(100, 101) = 100)
    bars[9] = { ...bars[9], open: 108, high: 110, low: 101, close: 105 }
    // Last week (index 14): 假跌破 100 (low = 95, open = 102, close = 104, high = 105)
    // bodyBottom = 102 >= 100, lowerShadow = 7, totalRange = 10 -> 7/10 = 0.7 > 0.5
    bars[14] = { ...bars[14], open: 102, high: 105, low: 95, close: 104 }

    const boundary = calculateSupportBoundary(bars)
    expect(boundary).toBe(100)
  })

  it('should return 400 when symbol is missing in GET /api/ohlcv', async () => {
    const req = new Request('http://localhost:3000/api/ohlcv?interval=1d')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('should return OHLCV bars and Cache-Control header from GET /api/ohlcv', async () => {
    server.use(
      http.get('https://query1.finance.yahoo.com/v8/finance/chart/:symbol', () => {
        return HttpResponse.json({
          chart: {
            result: [
              {
                timestamp: [1700000000, 1700086400],
                indicators: {
                  quote: [
                    {
                      open: [500, 510],
                      high: [515, 525],
                      low: [495, 505],
                      close: [512, 520],
                      volume: [20000, 25000],
                    },
                  ],
                },
              },
            ],
          },
        })
      })
    )

    const req = new Request('http://localhost:3000/api/ohlcv?symbol=2330.TW&interval=1d')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=900')

    const json = await res.json()
    expect(json.symbol).toBe('2330.TW')
    expect(json.interval).toBe('1d')
    expect(json.bars).toHaveLength(2)
  })

  it('should send Mozilla/5.0 User-Agent to avoid Yahoo WAF 429 and fallback to query2 on failure', async () => {
    let capturedUserAgent = ''
    server.use(
      http.get('https://query1.finance.yahoo.com/v8/finance/chart/:symbol', ({ request }) => {
        capturedUserAgent = request.headers.get('user-agent') || ''
        return new HttpResponse(null, { status: 429 })
      }),
      http.get('https://query2.finance.yahoo.com/v8/finance/chart/:symbol', ({ request }) => {
        capturedUserAgent = request.headers.get('user-agent') || ''
        return HttpResponse.json({
          chart: {
            result: [
              {
                timestamp: [1700000000],
                indicators: {
                  quote: [
                    {
                      open: [200],
                      high: [210],
                      low: [195],
                      close: [205],
                      volume: [10000],
                    },
                  ],
                },
              },
            ],
          },
        })
      })
    )

    const req = new Request('http://localhost:3000/api/ohlcv?symbol=2317.TW&interval=1wk')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(capturedUserAgent).toBe('Mozilla/5.0')
    const json = await res.json()
    expect(json.bars).toHaveLength(1)
  })

  it('should format volume in 張 for TWSE and K/M/B 股 for US stocks', () => {
    expect(formatChartVolume(12500000, 'TWSE')).toBe('12,500 張')
    expect(formatChartVolume(1500, 'TWSE')).toBe('2 張')
    expect(formatChartVolume(25400000, 'NASDAQ')).toBe('25.40M 股')
    expect(formatChartVolume(15400, 'US')).toBe('15.40K 股')
    expect(formatChartVolume(800, 'S&P 500')).toBe('800 股')
  })

  it('should compute OHLCV legend metrics including change and changePercent', () => {
    const prevBar: OHLCVBar = {
      time: 1700000000,
      open: 98,
      high: 102,
      low: 97,
      close: 100,
      volume: 5000000,
    }
    const currBar: OHLCVBar = {
      time: 1700086400,
      open: 101,
      high: 106,
      low: 99.5,
      close: 105,
      volume: 8000000,
    }

    const metrics = computeBarLegendData(currBar, prevBar, 'TWSE')
    expect(metrics.open).toBe(101)
    expect(metrics.high).toBe(106)
    expect(metrics.low).toBe(99.5)
    expect(metrics.close).toBe(105)
    expect(metrics.change).toBe(5)
    expect(metrics.changePercent).toBeCloseTo(5.0)
    expect(metrics.formattedVolume).toBe('8,000 張')
  })
})
