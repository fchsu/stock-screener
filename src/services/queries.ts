import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ScreeningResult } from '@/lib/types'

// 提取特定日期的篩選結果
const fetchScreeningResults = async (date: string): Promise<ScreeningResult[]> => {
  const { data, error } = await supabase.from('screening_results').select('*').eq('date', date)

  if (error) {
    throw new Error(error.message)
  }

  // 因為 assets 在 Supabase schema 中定義為 JSONB，取回時通常是 any，需確保轉型
  return data as unknown as ScreeningResult[]
}

export const fetchScreeningResultsServer = fetchScreeningResults;

// React Query Hook
export const useScreeningResult = (date: string, initialData?: ScreeningResult[]) => {
  return useQuery({
    queryKey: ['screeningResults', date],
    queryFn: () => fetchScreeningResults(date),
    staleTime: 1000 * 60 * 5, // 5分鐘內不重新請求
    initialData,
  })
}
