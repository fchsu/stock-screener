// 對應 contracts/supabase-schema.sql 的型別定義
// 若之後透過 supabase gen types 自動產生，可直接替換此檔

export type MarketType = 'TWSE' | 'NASDAQ' | 'US'
export type ScreeningStatus = 'fetching' | 'completed' | 'failed' | 'closed'

export interface StockAsset {
  symbol: string
  name: string
  market: MarketType
  matchLevel: string
  tradingViewUrl: string
}

export interface ScreeningResult {
  id: string
  date: string // YYYY-MM-DD
  market: MarketType
  status: ScreeningStatus
  assets: StockAsset[]
  updated_at: string // ISO 8601 UTC
}

export interface Database {
  public: {
    Tables: {
      screening_results: {
        Row: ScreeningResult
        Insert: Omit<ScreeningResult, 'id' | 'updated_at'>
        Update: Partial<Omit<ScreeningResult, 'id'>>
      }
    }
    Enums: {
      market_type: MarketType
      screening_status: ScreeningStatus
    }
  }
}
