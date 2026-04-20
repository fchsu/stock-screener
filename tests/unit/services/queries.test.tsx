import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { useScreeningResult } from '@/services/queries'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // 測試時不重試
      },
    },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'QueryClientWrapper'
  return Wrapper
}

describe('useScreeningResult', () => {
  it('should fetch screening results for a specific date successfully', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useScreeningResult('2026-04-17'), { wrapper })

    // 初始狀態應為載入中
    expect(result.current.isLoading).toBe(true)

    // 等待資料回傳
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // 驗證資料是否與 mock 一致
    expect(result.current.data).toBeDefined()
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].market).toBe('TWSE')
    expect(result.current.data?.[1].market).toBe('NASDAQ')
  })
})
