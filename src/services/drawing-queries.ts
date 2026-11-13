'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ChartDrawing, DrawingPoint, DrawingStyle, DrawingToolType } from '@/lib/types'
import { canCreateDrawing, DEFAULT_DRAWING_STYLE, validateDrawingPoints } from '@/lib/drawing-utils'

export const fetchChartDrawings = async (
  userId: string,
  symbol: string
): Promise<ChartDrawing[]> => {
  if (typeof supabase?.from !== 'function') return []
  const query = supabase.from('chart_drawings')
  if (!query || typeof query.select !== 'function') return []

  const { data, error } = await query
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as unknown as ChartDrawing[]
}

export const useChartDrawings = (
  userId: string | null | undefined,
  symbol: string | null | undefined
) => {
  return useQuery({
    queryKey: ['chartDrawings', userId, symbol],
    queryFn: () => fetchChartDrawings(userId!, symbol!),
    enabled: Boolean(userId && symbol),
    staleTime: Infinity,
  })
}

export const useChartDrawingMutations = (
  userId: string | null | undefined,
  symbol: string | null | undefined
) => {
  const queryClient = useQueryClient()
  const queryKey = ['chartDrawings', userId, symbol]

  const getCached = (): ChartDrawing[] => {
    return queryClient.getQueryData<ChartDrawing[]>(queryKey) ?? []
  }

  const setCached = (updater: (prev: ChartDrawing[]) => ChartDrawing[]) => {
    queryClient.setQueryData<ChartDrawing[]>(queryKey, (old) => updater(old ?? []))
  }

  const createDrawing = useMutation({
    mutationFn: async ({
      toolType,
      points,
      style = DEFAULT_DRAWING_STYLE,
    }: {
      toolType: DrawingToolType
      points: DrawingPoint[]
      style?: DrawingStyle
    }): Promise<ChartDrawing> => {
      if (!userId || !symbol) throw new Error('請先登入並選取股票')
      const current = getCached()
      if (!canCreateDrawing(current.length)) {
        throw new Error('每檔股票最多只能建立 50 條畫線')
      }

      const validPoints = validateDrawingPoints(toolType, points)
      const now = new Date().toISOString()
      const optimisticId = `temp-drawing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const optimisticDrawing: ChartDrawing = {
        id: optimisticId,
        user_id: userId,
        symbol,
        tool_type: toolType,
        points: validPoints,
        style,
        created_at: now,
        updated_at: now,
      }

      setCached((prev) => [...prev, optimisticDrawing])

      if (typeof supabase?.from !== 'function') {
        return optimisticDrawing
      }
      const table = supabase.from('chart_drawings')
      if (!table || typeof table.insert !== 'function') {
        return optimisticDrawing
      }

      const { data, error } = await table
        .insert({
          user_id: userId,
          symbol,
          tool_type: toolType,
          points: validPoints,
          style,
        })
        .select('*')
        .single()

      if (error) {
        setCached((prev) => prev.filter((d) => d.id !== optimisticId))
        throw new Error(error.message)
      }

      const created = (data ?? optimisticDrawing) as unknown as ChartDrawing
      setCached((prev) => prev.map((d) => (d.id === optimisticId ? created : d)))
      return created
    },
  })

  const updateDrawing = useMutation({
    mutationFn: async ({
      id,
      points,
      style,
    }: {
      id: string
      points?: DrawingPoint[]
      style?: DrawingStyle
    }) => {
      const updatedAt = new Date().toISOString()
      let normalizedPoints: DrawingPoint[] | undefined

      setCached((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d
          normalizedPoints = points ? validateDrawingPoints(d.tool_type, points) : d.points
          return {
            ...d,
            points: normalizedPoints,
            style: style ?? d.style,
            updated_at: updatedAt,
          }
        })
      )

      if (typeof supabase?.from !== 'function') return
      const table = supabase.from('chart_drawings')
      if (!table || typeof table.update !== 'function') return

      const updatePayload: Partial<Pick<ChartDrawing, 'points' | 'style' | 'updated_at'>> = {
        updated_at: updatedAt,
      }
      if (normalizedPoints) updatePayload.points = normalizedPoints
      if (style) updatePayload.style = style

      const { error } = await table.update(updatePayload).eq('id', id)
      if (error) throw new Error(error.message)
    },
  })

  const deleteDrawing = useMutation({
    mutationFn: async (id: string) => {
      setCached((prev) => prev.filter((d) => d.id !== id))
      if (typeof supabase?.from !== 'function') return
      const table = supabase.from('chart_drawings')
      if (!table || typeof table.delete !== 'function') return

      const { error } = await table.delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  })

  const clearSymbolDrawings = useMutation({
    mutationFn: async () => {
      if (!userId || !symbol) return
      setCached(() => [])
      if (typeof supabase?.from !== 'function') return
      const table = supabase.from('chart_drawings')
      if (!table || typeof table.delete !== 'function') return

      const { error } = await table.delete().eq('user_id', userId).eq('symbol', symbol)
      if (error) throw new Error(error.message)
    },
  })

  return {
    createDrawing,
    updateDrawing,
    deleteDrawing,
    clearSymbolDrawings,
  }
}
