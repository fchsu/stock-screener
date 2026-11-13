import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { useChartDrawings, useChartDrawingMutations } from '@/services/drawing-queries'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('drawing-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches drawings for (userId, symbol) and optimistically creates, updates, deletes, and clears drawings', async () => {
    const initialDrawings = [
      {
        id: 'd-1',
        user_id: 'u-1',
        symbol: '2330.TW',
        tool_type: 'horizontal',
        points: [{ time: 1700000000, price: 500 }],
        style: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },
        created_at: '2026-11-14T00:00:00Z',
        updated_at: '2026-11-14T00:00:00Z',
      },
    ]

    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'd-2',
        user_id: 'u-1',
        symbol: '2330.TW',
        tool_type: 'path',
        points: [
          { time: 1700000000, price: 500 },
          { time: 1700086400, price: 520 },
        ],
        style: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid' },
        created_at: '2026-11-14T00:01:00Z',
        updated_at: '2026-11-14T00:01:00Z',
      },
      error: null,
    })

    vi.mocked(supabase.from).mockImplementation(() => {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: initialDrawings, error: null }),
            }),
          }),
          single: mockSingle,
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: mockSingle }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    })

    const wrapper = createWrapper()
    const { result } = renderHook(
      () => ({
        query: useChartDrawings('u-1', '2330.TW'),
        mutations: useChartDrawingMutations('u-1', '2330.TW'),
      }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.query.data).toHaveLength(1))

    // 新增路徑畫線
    await act(async () => {
      await result.current.mutations.createDrawing.mutateAsync({
        toolType: 'path',
        points: [
          { time: 1700000000, price: 500 },
          { time: 1700086400, price: 520 },
        ],
        style: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid' },
      })
    })
    await waitFor(() => expect(result.current.query.data).toHaveLength(2))

    // 更新水平線價格與顏色
    await act(async () => {
      await result.current.mutations.updateDrawing.mutateAsync({
        id: 'd-1',
        points: [{ time: 1700000000, price: 512 }],
        style: { color: '#22c55e', lineWidth: 3, lineStyle: 'dashed' },
      })
    })
    await waitFor(() => {
      expect(result.current.query.data?.find((d) => d.id === 'd-1')?.points[0].price).toBe(512)
      expect(result.current.query.data?.find((d) => d.id === 'd-1')?.style.lineStyle).toBe('dashed')
    })

    // 刪除單條畫線
    await act(async () => {
      await result.current.mutations.deleteDrawing.mutateAsync('d-1')
    })
    await waitFor(() => expect(result.current.query.data?.map((d) => d.id)).toEqual(['d-2']))

    // 清除該股全部畫線
    await act(async () => {
      await result.current.mutations.clearSymbolDrawings.mutateAsync()
    })
    await waitFor(() => expect(result.current.query.data).toEqual([]))
  })
})
