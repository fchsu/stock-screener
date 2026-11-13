'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChartInterval, OHLCVBar } from '@/lib/ohlcv'
import type {
  ActiveDrawingTool,
  ChartDrawing,
  DrawingPoint,
  DrawingStyle,
  DrawingToolType,
} from '@/lib/types'
import {
  dedupeConsecutivePoints,
  drawingPointToPixel,
  getStrokeDasharray,
  MAX_PATH_POINTS,
  pixelToDrawingPoint,
} from '@/lib/drawing-utils'

export interface ChartCoordinateAdapter {
  coordinateToLogical: (x: number) => number | null
  logicalToCoordinate: (logical: number) => number | null
  timeToCoordinate?: (time: number) => number | null
  coordinateToPrice: (y: number) => number | null
  priceToCoordinate: (price: number) => number | null
  setChartInteractionLocked?: (locked: boolean) => void
}

export interface ChartDrawingOverlayProps {
  bars: OHLCVBar[]
  interval: ChartInterval
  adapter: ChartCoordinateAdapter | null
  drawings: ChartDrawing[]
  activeTool: ActiveDrawingTool
  currentStyle: DrawingStyle
  selectedDrawingId: string | null
  revision: number
  interactive: boolean
  onSelectDrawing: (id: string | null) => void
  onCreateDrawing: (payload: {
    toolType: DrawingToolType
    points: DrawingPoint[]
    style: DrawingStyle
  }) => void
  onUpdateDrawingPoints: (id: string, points: DrawingPoint[]) => void
}

interface DragState {
  drawingId: string
  pointIndex: number
  points: DrawingPoint[]
}

export default function ChartDrawingOverlay({
  bars,
  interval,
  adapter,
  drawings,
  activeTool,
  currentStyle,
  selectedDrawingId,
  revision,
  interactive,
  onSelectDrawing,
  onCreateDrawing,
  onUpdateDrawingPoints,
}: ChartDrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([])
  const [hoverPoint, setHoverPoint] = useState<DrawingPoint | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  // 標記已讀取 revision，確保視窗縮放平移時觸發重新計算座標
  void revision

  const getRelativePoint = useCallback(
    (clientX: number, clientY: number): DrawingPoint | null => {
      if (!adapter || bars.length === 0) return null
      const rect = svgRef.current?.getBoundingClientRect()
      const x = rect ? clientX - rect.left : clientX
      const y = rect ? clientY - rect.top : clientY

      return pixelToDrawingPoint({
        x,
        y,
        bars,
        interval,
        coordinateToLogical: adapter.coordinateToLogical,
        coordinateToPrice: adapter.coordinateToPrice,
      })
    },
    [adapter, bars, interval]
  )

  const finishDraftPath = useCallback(
    (pointsToCommit: DrawingPoint[]) => {
      const deduped = dedupeConsecutivePoints(pointsToCommit)
      setDraftPoints([])
      setHoverPoint(null)
      if (deduped.length >= 2) {
        onCreateDrawing({
          toolType: 'path',
          points: deduped,
          style: currentStyle,
        })
      }
    },
    [currentStyle, onCreateDrawing]
  )

  // 當切換工具或繪製中按下 Enter / Escape 時處理草稿完成或取消
  useEffect(() => {
    if (activeTool !== 'path') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (draftPoints.length > 0) {
          e.preventDefault()
          finishDraftPath(draftPoints)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, draftPoints, finishDraftPath])

  // 處理控制點拖曳的全局 pointermove / pointerup
  useEffect(() => {
    if (!dragState || !adapter) return

    const handlePointerMove = (e: PointerEvent) => {
      const pt = getRelativePoint(e.clientX, e.clientY)
      if (!pt) return
      setDragState((prev) => {
        if (!prev) return null
        const nextPoints = prev.points.map((existing, idx) =>
          idx === prev.pointIndex ? pt : existing
        )
        return { ...prev, points: nextPoints }
      })
    }

    const handlePointerUp = (e: PointerEvent) => {
      const pt = getRelativePoint(e.clientX, e.clientY)
      const finalPoints = dragState.points.map((existing, idx) =>
        idx === dragState.pointIndex && pt ? pt : existing
      )
      adapter.setChartInteractionLocked?.(false)
      setDragState(null)
      onUpdateDrawingPoints(dragState.drawingId, finalPoints)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [adapter, dragState, getRelativePoint, onUpdateDrawingPoints])

  if (!interactive || !adapter || bars.length === 0) {
    return null
  }

  const isDrawingMode = activeTool === 'horizontal' || activeTool === 'path'

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawingMode) return
    const pt = getRelativePoint(e.clientX, e.clientY)
    setHoverPoint(pt)
  }

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'horizontal') {
      const pt = getRelativePoint(e.clientX, e.clientY)
      if (!pt) return
      setHoverPoint(null)
      onCreateDrawing({
        toolType: 'horizontal',
        points: [pt],
        style: currentStyle,
      })
      return
    }

    if (activeTool === 'path') {
      const pt = getRelativePoint(e.clientX, e.clientY)
      if (!pt) return
      setDraftPoints((prev) => {
        if (prev.length >= MAX_PATH_POINTS) return prev
        return [...prev, pt]
      })
    }
  }

  const handleSvgContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'path') {
      e.preventDefault()
      e.stopPropagation()
      finishDraftPath(draftPoints)
    }
  }

  const handleSvgDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'path') {
      e.preventDefault()
      e.stopPropagation()
      finishDraftPath(draftPoints)
    }
  }

  const startDraggingHandle = (
    e: React.PointerEvent<SVGElement>,
    drawing: ChartDrawing,
    pointIndex: number
  ) => {
    if (activeTool !== 'cursor') return
    e.stopPropagation()
    e.preventDefault()
    onSelectDrawing(drawing.id)
    adapter.setChartInteractionLocked?.(true)
    setDragState({
      drawingId: drawing.id,
      pointIndex,
      points: drawing.points,
    })
  }

  const resolvePixel = (point: DrawingPoint) =>
    drawingPointToPixel({
      point,
      bars,
      interval,
      logicalToCoordinate: adapter.logicalToCoordinate,
      timeToCoordinate: adapter.timeToCoordinate,
      priceToCoordinate: adapter.priceToCoordinate,
    })

  // 計算繪製中草稿的像素座標
  const activeDraftPoints =
    activeTool === 'path' && draftPoints.length > 0
      ? hoverPoint
        ? [...draftPoints, hoverPoint]
        : draftPoints
      : []

  const draftPixels = activeDraftPoints
    .map(resolvePixel)
    .filter((p): p is { x: number; y: number } => p !== null)

  const hoverHorizontalY =
    activeTool === 'horizontal' && hoverPoint ? adapter.priceToCoordinate(hoverPoint.price) : null

  return (
    <svg
      ref={svgRef}
      data-testid={`chart-drawing-overlay-${interval}`}
      onMouseMove={handleSvgMouseMove}
      onMouseLeave={() => setHoverPoint(null)}
      onClick={handleSvgClick}
      onContextMenu={handleSvgContextMenu}
      onDoubleClick={handleSvgDoubleClick}
      className={`absolute inset-0 z-15 h-full w-full overflow-hidden select-none ${
        isDrawingMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
    >
      {/* 渲染已儲存之畫線 */}
      {drawings.map((drawing) => {
        const effectivePoints =
          dragState?.drawingId === drawing.id ? dragState.points : drawing.points
        const isSelected = selectedDrawingId === drawing.id
        const dashArray = getStrokeDasharray(drawing.style.lineStyle)

        if (drawing.tool_type === 'horizontal') {
          const pt = effectivePoints[0]
          if (!pt) return null
          const y = adapter.priceToCoordinate(pt.price)
          if (y == null || !Number.isFinite(y)) return null
          const anchorPixel = resolvePixel(pt)
          const handleX = anchorPixel ? anchorPixel.x : 120

          return (
            <g key={drawing.id} data-testid={`drawing-group-${drawing.id}`}>
              {/* 寬感應區供滑鼠點擊選取與上下拖曳 */}
              <line
                x1="0%"
                x2="100%"
                y1={y}
                y2={y}
                stroke="transparent"
                strokeWidth={12}
                className="pointer-events-auto cursor-ns-resize"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectDrawing(drawing.id)
                }}
                onPointerDown={(e) => startDraggingHandle(e, drawing, 0)}
              />
              <line
                data-testid={`drawing-line-${drawing.id}`}
                x1="0%"
                x2="100%"
                y1={y}
                y2={y}
                stroke={drawing.style.color}
                strokeWidth={drawing.style.lineWidth}
                strokeDasharray={dashArray}
                className="pointer-events-none"
              />
              <text
                x={8}
                y={Math.max(12, y - 5)}
                fill={drawing.style.color}
                fontSize={11}
                fontFamily="monospace"
                fontWeight="600"
                className="pointer-events-none"
              >
                {pt.price}
              </text>
              {isSelected && (
                <circle
                  data-testid={`drawing-handle-${drawing.id}-0`}
                  cx={handleX}
                  cy={y}
                  r={5}
                  fill="#ffffff"
                  stroke={drawing.style.color}
                  strokeWidth={2}
                  className="pointer-events-auto cursor-ns-resize"
                  onPointerDown={(e) => startDraggingHandle(e, drawing, 0)}
                />
              )}
            </g>
          )
        }

        // 路徑 (path / polyline)
        const pixelPoints = effectivePoints
          .map((pt, idx) => ({ pt, idx, pixel: resolvePixel(pt) }))
          .filter(
            (item): item is { pt: DrawingPoint; idx: number; pixel: { x: number; y: number } } =>
              item.pixel !== null
          )

        if (pixelPoints.length < 2) return null
        const pointsAttr = pixelPoints.map((p) => `${p.pixel.x},${p.pixel.y}`).join(' ')

        return (
          <g key={drawing.id} data-testid={`drawing-group-${drawing.id}`}>
            {/* 寬感應區供滑鼠點擊選取 */}
            <polyline
              points={pointsAttr}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onSelectDrawing(drawing.id)
              }}
            />
            <polyline
              data-testid={`drawing-path-${drawing.id}`}
              points={pointsAttr}
              fill="none"
              stroke={drawing.style.color}
              strokeWidth={drawing.style.lineWidth}
              strokeDasharray={dashArray}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="pointer-events-none"
            />
            {isSelected &&
              pixelPoints.map(({ idx, pixel }) => (
                <circle
                  key={idx}
                  data-testid={`drawing-handle-${drawing.id}-${idx}`}
                  cx={pixel.x}
                  cy={pixel.y}
                  r={5}
                  fill="#ffffff"
                  stroke={drawing.style.color}
                  strokeWidth={2}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDraggingHandle(e, drawing, idx)}
                />
              ))}
          </g>
        )
      })}

      {/* 水平線繪製預覽 */}
      {activeTool === 'horizontal' &&
        hoverHorizontalY != null &&
        Number.isFinite(hoverHorizontalY) &&
        hoverPoint && (
          <g data-testid="draft-horizontal-preview" className="pointer-events-none opacity-70">
            <line
              x1="0%"
              x2="100%"
              y1={hoverHorizontalY}
              y2={hoverHorizontalY}
              stroke={currentStyle.color}
              strokeWidth={currentStyle.lineWidth}
              strokeDasharray="4 4"
            />
            <text
              x={8}
              y={Math.max(12, hoverHorizontalY - 5)}
              fill={currentStyle.color}
              fontSize={11}
              fontFamily="monospace"
            >
              {hoverPoint.price}
            </text>
          </g>
        )}

      {/* 路徑繪製預覽 (含橡皮筋折線與節點) */}
      {activeTool === 'path' && draftPixels.length > 0 && (
        <g className="pointer-events-none">
          <polyline
            data-testid="draft-path-polyline"
            points={draftPixels.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={currentStyle.color}
            strokeWidth={currentStyle.lineWidth}
            strokeDasharray={getStrokeDasharray(currentStyle.lineStyle)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {draftPixels.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="#ffffff"
              stroke={currentStyle.color}
              strokeWidth={2}
            />
          ))}
        </g>
      )}
    </svg>
  )
}
