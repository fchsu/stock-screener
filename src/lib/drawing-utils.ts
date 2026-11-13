import type { ChartInterval, OHLCVBar } from './ohlcv'
import type {
  DrawingLineStyle,
  DrawingPoint,
  DrawingStyle,
  DrawingToolType,
} from './database.types'

export const MAX_DRAWINGS_PER_SYMBOL = 50
export const MAX_PATH_POINTS = 50

export const DRAWING_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7'] as const

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#3b82f6',
  lineWidth: 2,
  lineStyle: 'solid',
}

export function getIntervalStepSeconds(interval: ChartInterval): number {
  if (interval === '60m') return 3600
  if (interval === '1wk') return 604800
  return 86400
}

/**
 * 計算跨時框未來區外推時的每根 K 棒對應秒數。
 * 60m 時框因股市非 24 小時交易（台股每日 5 根、美股每日 7 根），若存在跨日資料則依每日實際交易 K 棒數換算，
 * 確保在日 K 繪製的未來破底翻切至 60m 時維持相同交易日比例。
 */
export function getEffectiveIntervalStepSeconds(bars: OHLCVBar[], interval: ChartInterval): number {
  if (interval !== '60m' || bars.length < 2) {
    return getIntervalStepSeconds(interval)
  }

  let sessionCount = 1
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time - bars[i - 1].time > 14400) {
      sessionCount++
    }
  }

  if (sessionCount <= 1) {
    return 3600
  }

  const barsPerDay = Math.max(4, Math.min(12, Math.round(bars.length / sessionCount)))
  return 86400 / barsPerDay
}

export function canCreateDrawing(currentCount: number): boolean {
  return currentCount < MAX_DRAWINGS_PER_SYMBOL
}

export function dedupeConsecutivePoints(points: DrawingPoint[]): DrawingPoint[] {
  const result: DrawingPoint[] = []
  for (const pt of points) {
    const normalized: DrawingPoint = {
      time: Math.round(pt.time),
      price: Number(pt.price.toFixed(2)),
    }
    const prev = result[result.length - 1]
    if (!prev || prev.time !== normalized.time || prev.price !== normalized.price) {
      result.push(normalized)
    }
  }
  return result
}

export function validateDrawingPoints(
  toolType: DrawingToolType,
  points: DrawingPoint[]
): DrawingPoint[] {
  const normalized = dedupeConsecutivePoints(points)
  if (toolType === 'horizontal') {
    if (normalized.length !== 1) {
      throw new Error('水平線必須包含 1 個基準節點')
    }
    return normalized
  }

  if (normalized.length < 2) {
    throw new Error('路徑至少需要 2 個節點')
  }
  if (normalized.length > MAX_PATH_POINTS) {
    throw new Error(`每條路徑最多只能包含 ${MAX_PATH_POINTS} 個節點`)
  }
  return normalized
}

export function getStrokeDasharray(lineStyle: DrawingLineStyle): string | undefined {
  if (lineStyle === 'dashed') return '6 4'
  if (lineStyle === 'dotted') return '2 4'
  return undefined
}

/**
 * 以二分搜尋找出滿足 bars[i].time <= targetTime 的最大索引（若小於首根 K 棒則回傳 0）
 */
export function findBarIndexForTime(bars: OHLCVBar[], targetTime: number): number {
  if (bars.length === 0) return -1
  if (targetTime <= bars[0].time) return 0

  let low = 0
  let high = bars.length - 1
  let bestIdx = 0

  while (low <= high) {
    const mid = (low + high) >> 1
    if (bars[mid].time <= targetTime) {
      bestIdx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return bestIdx
}

/**
 * 將 Unix 時間戳轉換為該時框的邏輯索引（支援最新 K 棒右側的未來預留區外推）
 */
export function timeToLogicalIndex(
  bars: OHLCVBar[],
  interval: ChartInterval,
  targetTime: number
): number {
  if (bars.length === 0) return 0
  const lastIdx = bars.length - 1
  const lastBar = bars[lastIdx]

  if (targetTime > lastBar.time) {
    const step = getEffectiveIntervalStepSeconds(bars, interval)
    return lastIdx + (targetTime - lastBar.time) / step
  }

  return findBarIndexForTime(bars, targetTime)
}

/**
 * 將邏輯索引轉換為標準 Unix 時間戳（當索引超出最後一根 K 棒時，按時框步長推算未來時間戳）
 */
export function logicalIndexToTime(
  bars: OHLCVBar[],
  interval: ChartInterval,
  logicalIndex: number
): number {
  if (bars.length === 0) return 0
  const roundedIdx = Math.round(logicalIndex)
  const lastIdx = bars.length - 1

  if (roundedIdx <= 0) {
    return bars[0].time
  }
  if (roundedIdx <= lastIdx) {
    return bars[roundedIdx].time
  }

  const futureSteps = roundedIdx - lastIdx
  return (
    bars[lastIdx].time + Math.round(futureSteps * getEffectiveIntervalStepSeconds(bars, interval))
  )
}

export function pixelToDrawingPoint(params: {
  x: number
  y: number
  bars: OHLCVBar[]
  interval: ChartInterval
  coordinateToLogical: (x: number) => number | null
  coordinateToPrice: (y: number) => number | null
}): DrawingPoint | null {
  const { x, y, bars, interval, coordinateToLogical, coordinateToPrice } = params
  if (bars.length === 0) return null

  const rawPrice = coordinateToPrice(y)
  const rawLogical = coordinateToLogical(x)
  if (
    rawPrice == null ||
    !Number.isFinite(rawPrice) ||
    rawLogical == null ||
    !Number.isFinite(rawLogical)
  ) {
    return null
  }

  const time = logicalIndexToTime(bars, interval, rawLogical)
  return {
    time,
    price: Number(rawPrice.toFixed(2)),
  }
}

/**
 * lightweight-charts 的 _internal_indexToCoordinate 內部檢查 isInteger(index)，
 * 若直接傳入跨時框換算產生的小數邏輯索引會直接回傳 0（導致未來折線跳回圖表最左側）。
 * 此處將邏輯索引拆分為相鄰整數索引並執行線性內插，確保跨時框與未來區座標精準對齊。
 */
function interpolateLogicalCoordinate(
  logicalIdx: number,
  logicalToCoordinate: (logical: number) => number | null
): number | null {
  if (!Number.isFinite(logicalIdx)) return null
  const floorIdx = Math.floor(logicalIdx)
  const fraction = logicalIdx - floorIdx
  const x0 = logicalToCoordinate(floorIdx)
  if (x0 == null || !Number.isFinite(x0)) return null
  if (fraction === 0) return x0

  const x1 = logicalToCoordinate(floorIdx + 1)
  if (x1 == null || !Number.isFinite(x1)) return x0
  return x0 + (x1 - x0) * fraction
}

export function drawingPointToPixel(params: {
  point: DrawingPoint
  bars: OHLCVBar[]
  interval: ChartInterval
  logicalToCoordinate: (logical: number) => number | null
  timeToCoordinate?: (time: number) => number | null
  priceToCoordinate: (price: number) => number | null
}): { x: number; y: number } | null {
  const { point, bars, interval, logicalToCoordinate, timeToCoordinate, priceToCoordinate } = params
  if (bars.length === 0) return null

  const y = priceToCoordinate(point.price)
  if (y == null || !Number.isFinite(y)) return null

  const logicalIdx = timeToLogicalIndex(bars, interval, point.time)
  let x = interpolateLogicalCoordinate(logicalIdx, logicalToCoordinate)

  if ((x == null || !Number.isFinite(x)) && timeToCoordinate && logicalIdx <= bars.length - 1) {
    const clampedIdx = Math.min(bars.length - 1, Math.max(0, Math.round(logicalIdx)))
    x = timeToCoordinate(bars[clampedIdx].time)
  }

  if (x == null || !Number.isFinite(x)) return null

  return { x, y }
}

/**
 * 根據目前已儲存畫線的未來節點位置，計算當前時框右側應預留的 K 棒空白數（rightOffset），
 * 確保切換時框或重整頁面後，使用者繪製的未來破底翻路徑不會被裁切在預設 12 根範圍之外。
 */
export function computeRequiredRightOffset(
  bars: OHLCVBar[],
  interval: ChartInterval,
  points: DrawingPoint[],
  defaultRightOffset: number,
  maxAutoRightOffset = 40
): number {
  if (bars.length === 0 || points.length === 0) return defaultRightOffset
  const lastIdx = bars.length - 1
  let maxFutureBars = 0

  for (const pt of points) {
    const logicalIdx = timeToLogicalIndex(bars, interval, pt.time)
    const futureBars = logicalIdx - lastIdx
    if (futureBars > maxFutureBars) {
      maxFutureBars = futureBars
    }
  }

  if (maxFutureBars <= 0 || maxFutureBars > maxAutoRightOffset) {
    return defaultRightOffset
  }

  return Math.max(defaultRightOffset, Math.ceil(maxFutureBars) + 3)
}
