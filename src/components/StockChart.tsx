'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useStockOHLCV } from '@/services/queries'
import {
  computeBarLegendData,
  type BarLegendData,
  type ChartInterval,
  type OHLCVBar,
} from '@/lib/ohlcv'
import type { StockAsset } from '@/lib/types'

export type ChartViewMode = 'single' | 'pip' | 'multi'

export interface StockChartProps {
  stock: StockAsset
  activeInterval: ChartInterval
  onSelectInterval: (interval: ChartInterval) => void
  viewMode: ChartViewMode
  onChangeViewMode?: (mode: ChartViewMode) => void
  onToggleViewMode?: () => void
}

interface ViewportPreference {
  barCount: number
  rightOffset: number
}

const DEFAULT_BAR_COUNT = 90
const DEFAULT_RIGHT_OFFSET = 2

const INTERVAL_OPTIONS: Array<{ value: ChartInterval; label: string; shortcut: string }> = [
  { value: '60m', label: '60K', shortcut: '1' },
  { value: '1d', label: '日K', shortcut: '2' },
  { value: '1wk', label: '週K', shortcut: '3' },
]

const VIEW_MODE_OPTIONS: Array<{ value: ChartViewMode; label: string }> = [
  { value: 'single', label: '單圖模式' },
  { value: 'pip', label: '子母模式' },
  { value: 'multi', label: '三時框並排' },
]

export function getTradingViewUrl(stock: StockAsset): string {
  const code = stock.market === 'TWSE' ? stock.symbol.split('.')[0] : stock.symbol
  return (
    stock.tradingViewUrl ||
    (stock.market === 'TWSE'
      ? `https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE%3A${code}`
      : `https://tw.tradingview.com/chart/eEagIIPe/?symbol=${stock.market || 'US'}:${code}`)
  )
}

function CandlestickPane({
  symbol,
  market,
  interval,
  title,
  viewportRef,
  compact = false,
  onSwapPip,
}: {
  symbol: string
  market: string
  interval: ChartInterval
  title?: string
  viewportRef: React.MutableRefObject<ViewportPreference>
  compact?: boolean
  onSwapPip?: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const boundaryLabelRef = useRef<HTMLDivElement | null>(null)
  const prevIntervalRef = useRef<ChartInterval>(interval)
  const { data, isLoading, isError } = useStockOHLCV(symbol, interval)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)

  // 建立時間戳對應 K 棒與前一根 K 棒的索引表，供十字線移動時 O(1) 查詢
  const barLookup = useMemo(() => {
    const map = new Map<number, { bar: OHLCVBar; prevBar: OHLCVBar | null }>()
    const bars = data?.bars ?? []
    for (let i = 0; i < bars.length; i++) {
      map.set(bars[i].time, {
        bar: bars[i],
        prevBar: i > 0 ? bars[i - 1] : null,
      })
    }
    return map
  }, [data])

  const legendData: BarLegendData | null = useMemo(() => {
    const bars = data?.bars ?? []
    if (bars.length === 0) return null
    if (hoveredTime != null && barLookup.has(hoveredTime)) {
      const entry = barLookup.get(hoveredTime)!
      return computeBarLegendData(entry.bar, entry.prevBar, market)
    }
    const lastIdx = bars.length - 1
    return computeBarLegendData(bars[lastIdx], lastIdx > 0 ? bars[lastIdx - 1] : null, market)
  }, [barLookup, data, hoveredTime, market])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !data || data.bars.length === 0) return

    let isApplyingRange = true

    const chart = createChart(container, {
      width: container.clientWidth || (compact ? 260 : 800),
      height: container.clientHeight || (compact ? 160 : 520),
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontSize: compact ? 10 : 12,
      },
      grid: {
        vertLines: { color: 'rgba(156, 163, 175, 0.12)' },
        horzLines: { color: 'rgba(156, 163, 175, 0.12)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
        scaleMargins: {
          top: compact ? 0.1 : 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
        timeVisible: interval === '60m',
        secondsVisible: false,
      },
    })

    // 國際習慣配色：綠漲紅跌
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })

    candleSeries.setData(
      data.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    )

    volumeSeries.setData(
      data.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
      }))
    )

    const syncLeftBoundaryLabel = () => {
      const labelEl = boundaryLabelRef.current
      if (!labelEl || data.supportBoundary == null) return
      const coord = candleSeries.priceToCoordinate?.(data.supportBoundary)
      const paneHeight = container.clientHeight || (compact ? 160 : 520)
      if (coord == null || Number.isNaN(coord) || coord < 8 || coord > paneHeight - 24) {
        labelEl.style.opacity = '0'
      } else {
        labelEl.style.opacity = '1'
        labelEl.style.top = `${coord}px`
      }
    }

    if (data.supportBoundary != null) {
      candleSeries.createPriceLine({
        price: data.supportBoundary,
        color: '#f59e0b',
        lineWidth: compact ? 1 : 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      })

      candleSeries.attachPrimitive?.({
        updateAllViews: syncLeftBoundaryLabel,
      })
    }

    const totalBars = data.bars.length
    const isIntervalSwitch = prevIntervalRef.current !== interval
    prevIntervalRef.current = interval

    if (isIntervalSwitch) {
      viewportRef.current.rightOffset = DEFAULT_RIGHT_OFFSET
    }

    const barCount = Math.max(10, viewportRef.current.barCount)
    const to = totalBars - 1 + viewportRef.current.rightOffset
    const from = to - barCount

    chart.timeScale().setVisibleLogicalRange?.({ from, to })
    syncLeftBoundaryLabel()
    isApplyingRange = false

    const handleLogicalRangeChange = (range: { from: number; to: number } | null) => {
      if (isApplyingRange || !range) return
      const nextSpan = range.to - range.from
      if (nextSpan >= 5) {
        viewportRef.current = {
          barCount: nextSpan,
          rightOffset: range.to - (totalBars - 1),
        }
      }
      syncLeftBoundaryLabel()
    }

    const handleCrosshairMove = (param: { time?: unknown }) => {
      if (typeof param?.time === 'number') {
        setHoveredTime(param.time)
      } else {
        setHoveredTime(null)
      }
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange?.(handleLogicalRangeChange)
    chart.subscribeCrosshairMove?.(handleCrosshairMove)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          chart.applyOptions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          })
          syncLeftBoundaryLabel()
        }
      })
      resizeObserver.observe(container)
    }

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange?.(handleLogicalRangeChange)
      chart.unsubscribeCrosshairMove?.(handleCrosshairMove)
      resizeObserver?.disconnect()
      chart.remove()
    }
  }, [compact, data, interval, symbol, viewportRef])

  const isUp = (legendData?.change ?? 0) >= 0
  const changeColorClass = isUp
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400'
  const sign = isUp ? '+' : ''

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
        compact
          ? 'bg-white/95 p-1.5 dark:bg-gray-950/95'
          : 'rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950'
      }`}
    >
      {title && (
        <div className="mb-1 flex shrink-0 items-center justify-between border-b border-gray-100 pb-1 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <span>{title}</span>
          <div className="flex items-center gap-2">
            {data?.supportBoundary != null && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                邊界：{data.supportBoundary}
              </span>
            )}
            {onSwapPip && (
              <button
                type="button"
                onClick={onSwapPip}
                className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950/70 dark:text-blue-300"
              >
                ⇄ 切換主圖
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative min-h-0 w-full flex-1">
        {/* 左上方 OHLCV 即時行情資訊列（主圖與多框顯示） */}
        {!compact && legendData && (
          <div
            data-testid="ohlcv-legend"
            className="pointer-events-none absolute top-1.5 left-2.5 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-md bg-white/85 px-2 py-1 font-mono text-xs backdrop-blur-xs dark:bg-gray-950/85"
          >
            <span className="text-gray-600 dark:text-gray-400">
              開 <strong className={changeColorClass}>{legendData.open}</strong>
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              高 <strong className={changeColorClass}>{legendData.high}</strong>
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              低 <strong className={changeColorClass}>{legendData.low}</strong>
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              收 <strong className={changeColorClass}>{legendData.close}</strong>
            </span>
            <span className={`font-semibold ${changeColorClass}`}>
              {sign}
              {legendData.change} ({sign}
              {legendData.changePercent}%)
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              量{' '}
              <strong className="text-gray-900 dark:text-gray-200">
                {legendData.formattedVolume}
              </strong>
            </span>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">
            載入 K 線資料中...
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-red-500">
            無法載入 K 線資料，請稍後再試或點擊右上角開啟 TradingView。
          </div>
        )}
        {!isLoading && !isError && data && data.bars.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">
            暫無此商品的 K 線數據
          </div>
        )}

        {/* 左側週線關鍵邊界浮動標籤 */}
        {data?.supportBoundary != null && !compact && (
          <div
            ref={boundaryLabelRef}
            data-testid="support-boundary-left-label"
            style={{ top: '50%' }}
            className="pointer-events-none absolute left-2.5 z-10 -translate-y-1/2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white shadow-xs transition-opacity duration-75"
          >
            週線關鍵邊界 {data.supportBoundary}
          </div>
        )}

        <div
          ref={containerRef}
          className="h-full w-full"
          data-testid={`chart-canvas-${interval}`}
        />
      </div>
    </div>
  )
}

export default function StockChart({
  stock,
  activeInterval,
  onSelectInterval,
  viewMode,
  onChangeViewMode,
  onToggleViewMode,
}: StockChartProps) {
  const [pipMainInterval, setPipMainInterval] = useState<'1d' | '1wk'>('1d')
  const pipSubInterval: ChartInterval = pipMainInterval === '1d' ? '1wk' : '1d'

  const effectiveMainInterval = viewMode === 'pip' ? pipMainInterval : activeInterval
  const { data: activeData } = useStockOHLCV(stock.symbol, effectiveMainInterval)
  const tvUrl = getTradingViewUrl(stock)
  const isStrict = stock.matchLevel === 'strict' || !stock.matchLevel

  const viewportRef = useRef<ViewportPreference>({
    barCount: DEFAULT_BAR_COUNT,
    rightOffset: DEFAULT_RIGHT_OFFSET,
  })

  const pipSubViewportRef = useRef<ViewportPreference>({
    barCount: 60,
    rightOffset: DEFAULT_RIGHT_OFFSET,
  })

  const handleModeSelect = (mode: ChartViewMode) => {
    if (onChangeViewMode) {
      onChangeViewMode(mode)
    } else if (onToggleViewMode) {
      onToggleViewMode()
    }
  }

  const handleSwapPip = () => {
    setPipMainInterval((prev) => (prev === '1d' ? '1wk' : '1d'))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* 緊湊型頂部工具列 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-xs dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{stock.name}</h2>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
            {stock.symbol}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              isStrict
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300'
            }`}
          >
            {isStrict ? '🎯 標準圖' : '🌊 慣性改變'}
          </span>
          {activeData?.supportBoundary != null && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              關鍵邊界：{activeData.supportBoundary}
            </span>
          )}
          {stock.tradingDate && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              資料基準日：{stock.tradingDate}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* 子母模式專屬：日線 / 週線互換按鈕 */}
          {viewMode === 'pip' && (
            <button
              type="button"
              onClick={handleSwapPip}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
            >
              <span>
                切換日/週線（主：{pipMainInterval === '1d' ? '日K' : '週K'} / 子：
                {pipSubInterval === '1d' ? '日K' : '週K'}）
              </span>
            </button>
          )}

          {/* 時框切換按鈕群 */}
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-800 dark:bg-gray-900"
            role="group"
            aria-label="K線時框切換"
          >
            {INTERVAL_OPTIONS.map((opt) => {
              const isSelected = viewMode === 'single' && activeInterval === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSelectInterval(opt.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                  <span className="ml-1 text-[10px] opacity-60">[{opt.shortcut}]</span>
                </button>
              )
            })}
          </div>

          {/* 檢視模式切換群組：單圖模式 / 子母模式 / 三時框並排 */}
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-800 dark:bg-gray-900"
            role="group"
            aria-label="檢視模式切換"
          >
            {VIEW_MODE_OPTIONS.map((modeOpt) => {
              const isSelected = viewMode === modeOpt.value
              return (
                <button
                  key={modeOpt.value}
                  type="button"
                  onClick={() => handleModeSelect(modeOpt.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-white text-blue-600 shadow-xs dark:bg-gray-800 dark:text-blue-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {modeOpt.label}
                </button>
              )
            })}
          </div>

          {/* 在 TradingView 開啟 */}
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span>在 TradingView 開啟</span>
          </a>
        </div>
      </div>

      {/* K 線圖表區域 */}
      {viewMode === 'single' && (
        <CandlestickPane
          symbol={stock.symbol}
          market={stock.market}
          interval={activeInterval}
          viewportRef={viewportRef}
        />
      )}

      {viewMode === 'pip' && (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <CandlestickPane
            symbol={stock.symbol}
            market={stock.market}
            interval={pipMainInterval}
            viewportRef={viewportRef}
          />
          {/* 左下角子圖：與單圖相同長寬比 (w-[30%] h-[30%]) */}
          <div
            data-testid="pip-sub-chart"
            className="absolute bottom-8 left-3 z-20 flex h-[30%] w-[30%] flex-col overflow-hidden rounded-xl border-2 border-blue-500/40 shadow-xl backdrop-blur-xs dark:border-blue-400/40"
          >
            <CandlestickPane
              symbol={stock.symbol}
              market={stock.market}
              interval={pipSubInterval}
              title={`子圖：${pipSubInterval === '1wk' ? '週K' : '日K'}`}
              viewportRef={pipSubViewportRef}
              compact={true}
              onSwapPip={handleSwapPip}
            />
          </div>
        </div>
      )}

      {viewMode === 'multi' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-3">
          <CandlestickPane
            symbol={stock.symbol}
            market={stock.market}
            interval="1wk"
            title="週K（位置與長下影線）"
            viewportRef={viewportRef}
          />
          <CandlestickPane
            symbol={stock.symbol}
            market={stock.market}
            interval="1d"
            title="日K（破底翻型態）"
            viewportRef={viewportRef}
          />
          <CandlestickPane
            symbol={stock.symbol}
            market={stock.market}
            interval="60m"
            title="60K（短線轉折結構）"
            viewportRef={viewportRef}
          />
        </div>
      )}
    </div>
  )
}
