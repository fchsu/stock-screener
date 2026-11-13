import { describe, it, expect } from 'vitest'
import {
  MAX_DRAWINGS_PER_SYMBOL,
  MAX_PATH_POINTS,
  getIntervalStepSeconds,
  getEffectiveIntervalStepSeconds,
  computeRequiredRightOffset,
  canCreateDrawing,
  validateDrawingPoints,
  dedupeConsecutivePoints,
  getStrokeDasharray,
  findBarIndexForTime,
  timeToLogicalIndex,
  logicalIndexToTime,
  pixelToDrawingPoint,
  drawingPointToPixel,
} from '@/lib/drawing-utils'
import type { OHLCVBar } from '@/lib/ohlcv'

const sampleDailyBars: OHLCVBar[] = [
  { time: 1700000000, open: 100, high: 105, low: 98, close: 102, volume: 1000 }, // idx 0
  { time: 1700086400, open: 102, high: 108, low: 101, close: 106, volume: 1200 }, // idx 1
  { time: 1700172800, open: 106, high: 110, low: 104, close: 109, volume: 1500 }, // idx 2 (lastBar)
]

describe('drawing-utils', () => {
  it('enforces 50 drawings quota and validates horizontal (1 point) vs path (2..50 points)', () => {
    expect(MAX_DRAWINGS_PER_SYMBOL).toBe(50)
    expect(MAX_PATH_POINTS).toBe(50)
    expect(canCreateDrawing(49)).toBe(true)
    expect(canCreateDrawing(50)).toBe(false)

    expect(validateDrawingPoints('horizontal', [{ time: 1700000000, price: 105.556 }])).toEqual([
      { time: 1700000000, price: 105.56 },
    ])
    expect(() => validateDrawingPoints('horizontal', [])).toThrow()
    expect(() => validateDrawingPoints('path', [{ time: 1700000000, price: 100 }])).toThrow(
      '路徑至少需要 2 個節點'
    )
  })

  it('dedupes consecutive identical points from double-click completion and maps strokeDasharray', () => {
    const pts = [
      { time: 1700000000, price: 100 },
      { time: 1700086400, price: 105 },
      { time: 1700086400, price: 105 },
    ]
    expect(dedupeConsecutivePoints(pts)).toEqual([
      { time: 1700000000, price: 100 },
      { time: 1700086400, price: 105 },
    ])
    expect(getStrokeDasharray('solid')).toBeUndefined()
    expect(getStrokeDasharray('dashed')).toBe('6 4')
    expect(getStrokeDasharray('dotted')).toBe('2 4')
  })

  it('maps cross-timeframe timestamps accurately (e.g. Wednesday daily point onto Monday weekly bar)', () => {
    const weeklyBars: OHLCVBar[] = [
      { time: 1700000000, open: 100, high: 110, low: 95, close: 108, volume: 5000 }, // Week 1 Monday
      { time: 1700604800, open: 108, high: 115, low: 105, close: 112, volume: 6000 }, // Week 2 Monday
    ]
    // Wednesday inside Week 1 (Monday + 2 days)
    const wednesdayTime = 1700000000 + 2 * 86400
    expect(findBarIndexForTime(weeklyBars, wednesdayTime)).toBe(0)
    expect(timeToLogicalIndex(weeklyBars, '1wk', wednesdayTime)).toBe(0)
  })

  it('extrapolates future P4/P5 points beyond the last K-bar and converts them back to logical coordinates', () => {
    expect(getIntervalStepSeconds('60m')).toBe(3600)
    expect(getIntervalStepSeconds('1d')).toBe(86400)
    expect(getIntervalStepSeconds('1wk')).toBe(604800)

    // User clicks 5 bars to the right of the last daily bar (idx 2 + 5 = logicalIndex 7)
    const futureTime = logicalIndexToTime(sampleDailyBars, '1d', 7)
    expect(futureTime).toBe(1700172800 + 5 * 86400)

    // Converting that future timestamp back to logical index in 1d returns 7
    expect(timeToLogicalIndex(sampleDailyBars, '1d', futureTime)).toBe(7)

    // Full round-trip via pixelToDrawingPoint & drawingPointToPixel
    const point = pixelToDrawingPoint({
      x: 700,
      y: 120,
      bars: sampleDailyBars,
      interval: '1d',
      coordinateToLogical: (x) => x / 100, // 700 -> logical 7
      coordinateToPrice: () => 118.456,
    })
    expect(point).toEqual({
      time: 1700172800 + 5 * 86400,
      price: 118.46,
    })

    const pixel = drawingPointToPixel({
      point: point!,
      bars: sampleDailyBars,
      interval: '1d',
      logicalToCoordinate: (logical) => logical * 100,
      priceToCoordinate: (price) => (price === 118.46 ? 120 : null),
    })
    expect(pixel).toEqual({ x: 700, y: 120 })
  })

  it('interpolates integer logical indices when switching timeframes so lightweight-charts never returns x=0 for fractional future indices', () => {
    // 模擬在 1d 最後一根 K 棒 (週五 2026-11-13) 右側 +12 根與 +23 根繪製未來破底翻 P4, P5
    const fridayDailyTime = 1763044200 // 2026-11-13 14:30 UTC
    const dailyBars: OHLCVBar[] = [
      { time: fridayDailyTime - 86400, open: 140, high: 145, low: 139, close: 142, volume: 1000 },
      { time: fridayDailyTime, open: 142, high: 146, low: 141, close: 144.48, volume: 1200 },
    ]

    const p4Time = logicalIndexToTime(dailyBars, '1d', 1 + 12) // +12 日K
    const p5Time = logicalIndexToTime(dailyBars, '1d', 1 + 23) // +23 日K

    // 切換至 1wk：最後一根週 K 時間戳為當週週一 (比週五早 4 天)
    const mondayWeeklyTime = fridayDailyTime - 4 * 86400
    const weeklyBars: OHLCVBar[] = [
      { time: mondayWeeklyTime - 604800, open: 135, high: 142, low: 132, close: 140, volume: 5000 },
      { time: mondayWeeklyTime, open: 141, high: 145, low: 140, close: 144.48, volume: 6000 },
    ]

    // 真實 lightweight-charts 的 _internal_indexToCoordinate 對非整數 logical 一律回傳 0
    const strictLightweightChartsLogicalToCoord = (logical: number): number | null => {
      if (!Number.isInteger(logical)) return 0
      return 800 + (logical - 1) * 14
    }

    const p4WeeklyPixel = drawingPointToPixel({
      point: { time: p4Time, price: 134.5 },
      bars: weeklyBars,
      interval: '1wk',
      logicalToCoordinate: strictLightweightChartsLogicalToCoord,
      priceToCoordinate: () => 300,
    })

    const p5WeeklyPixel = drawingPointToPixel({
      point: { time: p5Time, price: 143.0 },
      bars: weeklyBars,
      interval: '1wk',
      logicalToCoordinate: strictLightweightChartsLogicalToCoord,
      priceToCoordinate: () => 220,
    })

    // 絕不可掉回圖表最左側 x = 0，且必須在最新週 K (x = 800) 的右側並保持 P5.x > P4.x
    expect(p4WeeklyPixel).not.toBeNull()
    expect(p5WeeklyPixel).not.toBeNull()
    expect(p4WeeklyPixel!.x).toBeGreaterThan(800)
    expect(p5WeeklyPixel!.x).toBeGreaterThan(p4WeeklyPixel!.x)

    // 切換至 60m：包含跨日交易時段（每日 7 根 60m K 棒），最後一根為週五 20:30 UTC (:30 與日 K 有時差)
    const hourlyBars: OHLCVBar[] = []
    for (let day = 0; day < 3; day++) {
      const dayStart = fridayDailyTime - (2 - day) * 86400
      for (let h = 0; h < 7; h++) {
        hourlyBars.push({
          time: dayStart + h * 3600,
          open: 140,
          high: 145,
          low: 139,
          close: 144,
          volume: 200,
        })
      }
    }
    const lastHourlyIdx = hourlyBars.length - 1
    const strictHourlyLogicalToCoord = (logical: number): number | null => {
      if (!Number.isInteger(logical)) return 0
      return 700 + (logical - lastHourlyIdx) * 8
    }

    const p4HourlyPixel = drawingPointToPixel({
      point: { time: p4Time, price: 134.5 },
      bars: hourlyBars,
      interval: '60m',
      logicalToCoordinate: strictHourlyLogicalToCoord,
      priceToCoordinate: () => 300,
    })

    expect(p4HourlyPixel).not.toBeNull()
    expect(p4HourlyPixel!.x).toBeGreaterThan(700)
    expect(getEffectiveIntervalStepSeconds(hourlyBars, '60m')).toBeCloseTo(86400 / 7, 2)

    // 驗證 computeRequiredRightOffset 會自動擴展右側空白預留區以容納未來破底翻節點
    const requiredDailyOffset = computeRequiredRightOffset(
      dailyBars,
      '1d',
      [
        { time: p4Time, price: 134.5 },
        { time: p5Time, price: 143.0 },
      ],
      12
    )
    expect(requiredDailyOffset).toBe(26) // 23 + 3
  })
})
