export type ChartInterval = '60m' | '1d' | '1wk'

export interface OHLCVBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OHLCVResponse {
  symbol: string
  interval: ChartInterval
  bars: OHLCVBar[]
  supportBoundary: number | null
}

interface YahooChartResponseShape {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
  }
}

/**
 * 解析 Yahoo Finance v8 chart JSON，過濾空值並依時間升冪排序去重
 */
export function parseYahooChartResponse(raw: unknown): OHLCVBar[] {
  const data = raw as YahooChartResponseShape
  const result = data?.chart?.result?.[0]
  const timestamps = result?.timestamp
  const quote = result?.indicators?.quote?.[0]

  if (!timestamps || !quote) {
    return []
  }

  const seenTimes = new Set<number>()
  const bars: OHLCVBar[] = []

  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i]
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    const volume = quote.volume?.[i] ?? 0

    if (
      time == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      Number.isNaN(open) ||
      Number.isNaN(high) ||
      Number.isNaN(low) ||
      Number.isNaN(close)
    ) {
      continue
    }

    if (seenTimes.has(time)) {
      continue
    }
    seenTimes.add(time)

    bars.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume),
    })
  }

  bars.sort((a, b) => a.time - b.time)
  return bars
}

/**
 * 依據老余三問週線規則（Swing Low window=2、5% 容差水平支撐帶、長下影線假跌破收回）計算關鍵支撐邊界價位
 */
export function calculateSupportBoundary(weeklyBars: OHLCVBar[]): number | null {
  const n = weeklyBars.length
  const windowSize = 2
  if (n < windowSize * 2 + 1) {
    return null
  }

  const swingLows: Array<[number, number]> = []
  for (let i = windowSize; i < n - windowSize; i++) {
    let isSwingLow = true
    for (let j = 1; j <= windowSize; j++) {
      if (
        weeklyBars[i].low >= weeklyBars[i - j].low ||
        weeklyBars[i].low >= weeklyBars[i + j].low
      ) {
        isSwingLow = false
        break
      }
    }
    if (isSwingLow) {
      swingLows.push([i, weeklyBars[i].low])
    }
  }

  if (swingLows.length < 2) {
    return null
  }

  const validBoundariesSet = new Set<number>()
  const nSl = swingLows.length

  for (let i = nSl - 1; i >= 0; i--) {
    const [idxA, priceA] = swingLows[i]
    if (n - idxA > 52 && nSl - 1 - i >= 5) {
      continue
    }
    for (let j = i - 1; j >= 0; j--) {
      const [, priceB] = swingLows[j]
      const maxAb = Math.max(priceA, priceB)
      if (maxAb > 0 && Math.abs(priceA - priceB) / maxAb <= 0.05) {
        validBoundariesSet.add(Math.min(priceA, priceB))
      }
    }
  }

  if (validBoundariesSet.size === 0) {
    return null
  }

  const validBoundaries = Array.from(validBoundariesSet).sort((a, b) => b - a)
  const currentWeek = weeklyBars[n - 1]
  const currentBodyBottom = Math.min(currentWeek.open, currentWeek.close)

  const candidateWeeks = [weeklyBars[n - 1]]
  if (n >= 3) {
    candidateWeeks.push(weeklyBars[n - 2])
  }

  for (const bLevel of validBoundaries) {
    if (currentBodyBottom < bLevel) {
      continue
    }

    for (const w of candidateWeeks) {
      if (w.high === w.low) continue
      const bodyBottom = Math.min(w.open, w.close)
      const lowerShadow = bodyBottom - w.low
      const totalRange = w.high - w.low

      if (lowerShadow / totalRange <= 0.5) continue
      if (w.low < bLevel && bodyBottom >= bLevel) {
        return Number(bLevel.toFixed(2))
      }
    }
  }

  // 若回看歷史篩選日、最新一週已脫離下影線週，回退至當前實體下方最近的有效支撐邊界
  const fallback = validBoundaries.find((b) => currentBodyBottom >= b)
  return fallback != null ? Number(fallback.toFixed(2)) : null
}
