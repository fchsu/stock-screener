import { NextResponse } from 'next/server'
import {
  parseYahooChartResponse,
  calculateSupportBoundary,
  type ChartInterval,
  type OHLCVBar,
  type OHLCVResponse,
} from '@/lib/ohlcv'

const VALID_INTERVALS: Record<ChartInterval, string> = {
  '60m': '60d',
  '1d': '2y',
  '1wk': '4y',
}

const SYMBOL_REGEX = /^[A-Za-z0-9.^=-]{1,20}$/

const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const CACHE_TTL_MS = 1000 * 60 * 15
const memoryCache = new Map<string, { expiresAt: number; bars: OHLCVBar[] }>()

async function fetchYahooChart(
  symbol: string,
  interval: ChartInterval,
  range: string
): Promise<OHLCVBar[]> {
  const cacheKey = `${symbol}:${interval}`
  const cached = memoryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bars
  }

  let lastStatus = 0
  for (const host of YAHOO_HOSTS) {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=${range}&interval=${interval}&includePrePost=false`

    const res = await fetch(url, {
      headers: {
        // Yahoo ATS WAF 會針對偽造 Chrome/120 且未帶 Cookie 的請求回傳 429，使用精簡 Mozilla/5.0 可穩定通過
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    })

    if (res.ok) {
      const json = await res.json()
      const bars = parseYahooChartResponse(json)
      if (bars.length > 0) {
        memoryCache.set(cacheKey, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          bars,
        })
      }
      return bars
    }
    lastStatus = res.status
  }

  throw new Error(`Yahoo Finance 回應錯誤 (${lastStatus})`)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawSymbol = searchParams.get('symbol')?.trim() ?? ''
  const rawInterval = (searchParams.get('interval')?.trim() ?? '1d') as ChartInterval

  if (!rawSymbol || !SYMBOL_REGEX.test(rawSymbol)) {
    return NextResponse.json({ error: '無效或缺少的股票代號 (symbol)' }, { status: 400 })
  }

  const interval: ChartInterval = rawInterval in VALID_INTERVALS ? rawInterval : '1d'
  const range = VALID_INTERVALS[interval]

  try {
    // 同步拉取目標時框與 4 年週線（用於計算老余三問關鍵支撐邊界），並由記憶體快取消除同標的跨時框重複抓取
    const [bars, weeklyBars] = await Promise.all([
      fetchYahooChart(rawSymbol, interval, range),
      interval === '1wk'
        ? Promise.resolve(null)
        : fetchYahooChart(rawSymbol, '1wk', VALID_INTERVALS['1wk']).catch(() => []),
    ])

    const supportBoundary = calculateSupportBoundary(weeklyBars ?? bars)

    const payload: OHLCVResponse = {
      symbol: rawSymbol,
      interval,
      bars,
      supportBoundary,
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        // 設定 Vercel CDN 快取 15 分鐘，確保 $0 成本與極速回應
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法取得 K 線資料'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
