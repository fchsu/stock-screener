'use client'

import { useEffect, useRef } from 'react'
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
import type { StockAsset } from '@/lib/types'
import type { ChartInterval } from '@/lib/ohlcv'

export interface StockChartProps {
  stock: StockAsset
  activeInterval: ChartInterval
  onSelectInterval: (interval: ChartInterval) => void
  viewMode: 'single' | 'multi'
  onToggleViewMode: () => void
}

const INTERVAL_OPTIONS: Array<{ value: ChartInterval; label: string; shortcut: string }> = [
  { value: '60m', label: '60K', shortcut: '1' },
  { value: '1d', label: '日K', shortcut: '2' },
  { value: '1wk', label: '週K', shortcut: '3' },
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
  interval,
  title,
  height = 460,
}: {
  symbol: string
  interval: ChartInterval
  title?: string
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { data, isLoading, isError } = useStockOHLCV(symbol, interval)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !data || data.bars.length === 0) return

    const chart = createChart(container, {
      width: container.clientWidth || 640,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
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
          top: 0.08,
          bottom: 0.24,
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

    if (data.supportBoundary != null) {
      candleSeries.createPriceLine({
        price: data.supportBoundary,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '週線關鍵邊界',
      })
    }

    chart.timeScale().fitContent()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry && entry.contentRect.width > 0) {
          chart.applyOptions({ width: entry.contentRect.width })
        }
      })
      resizeObserver.observe(container)
    }

    return () => {
      resizeObserver?.disconnect()
      chart.remove()
    }
  }, [data, height, interval])

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      {title && (
        <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <span>{title}</span>
          {data?.supportBoundary != null && (
            <span className="text-amber-600 dark:text-amber-400">邊界：{data.supportBoundary}</span>
          )}
        </div>
      )}

      <div className="relative w-full" style={{ height }}>
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
  onToggleViewMode,
}: StockChartProps) {
  const { data: activeData } = useStockOHLCV(stock.symbol, activeInterval)
  const tvUrl = getTradingViewUrl(stock)
  const isStrict = stock.matchLevel === 'strict' || !stock.matchLevel

  return (
    <div className="flex flex-col space-y-3">
      {/* 頂部工具列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{stock.name}</h2>
          <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
            {stock.symbol}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              isStrict
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300'
            }`}
          >
            {isStrict ? '🎯 標準圖' : '🌊 慣性改變'}
          </span>
          {activeData?.supportBoundary != null && (
            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              關鍵邊界：{activeData.supportBoundary}
            </span>
          )}
          {stock.tradingDate && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              資料基準日：{stock.tradingDate}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 時框切換按鈕群 (單圖模式顯示高亮，並排模式點擊可切回單圖指定時框) */}
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

          {/* 單圖 / 三時框並排切換 */}
          <button
            type="button"
            onClick={onToggleViewMode}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'multi'
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
            }`}
          >
            {viewMode === 'multi' ? <span>單圖模式</span> : <span>三時框並排</span>}
          </button>

          {/* 在 TradingView 開啟 */}
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span>在 TradingView 開啟</span>
          </a>
        </div>
      </div>

      {/* K 線圖表區域 */}
      {viewMode === 'single' ? (
        <CandlestickPane symbol={stock.symbol} interval={activeInterval} height={500} />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <CandlestickPane
            symbol={stock.symbol}
            interval="1wk"
            title="週K（位置與長下影線）"
            height={420}
          />
          <CandlestickPane
            symbol={stock.symbol}
            interval="1d"
            title="日K（破底翻型態）"
            height={420}
          />
          <CandlestickPane
            symbol={stock.symbol}
            interval="60m"
            title="60K（短線轉折結構）"
            height={420}
          />
        </div>
      )}
    </div>
  )
}
