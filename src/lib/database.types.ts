// 對應 contracts/supabase-schema.sql 與 supabase-watchlist-schema.sql 的型別定義
// 若之後透過 supabase gen types 自動產生，可直接替換此檔

export type MarketType = 'TWSE' | 'NASDAQ' | 'NYSE' | 'S&P 500' | 'US'
export type ScreeningStatus = 'fetching' | 'completed' | 'failed' | 'closed'

export type StockAsset = {
  symbol: string
  name: string
  market: MarketType
  matchLevel: string
  tradingViewUrl: string
  tradingDate?: string
}

export type ScreeningResult = {
  id: string
  date: string // YYYY-MM-DD
  market: MarketType
  status: ScreeningStatus
  assets: StockAsset[]
  updated_at: string // ISO 8601 UTC
}

export type Watchlist = {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type WatchlistGroup = {
  id: string
  watchlist_id: string
  name: string
  sort_order: number
  created_at: string
}

export type WatchlistItem = {
  id: string
  watchlist_id: string
  group_id: string | null
  symbol: string
  name: string
  market: MarketType
  sort_order: number
  created_at: string
}

export type WatchlistWithDetails = Watchlist & {
  groups: WatchlistGroup[]
  items: WatchlistItem[]
}

export type Database = {
  public: {
    Tables: {
      screening_results: {
        Row: ScreeningResult
        Insert: Omit<ScreeningResult, 'id' | 'updated_at'>
        Update: Partial<Omit<ScreeningResult, 'id'>>
        Relationships: []
      }
      watchlists: {
        Row: Watchlist
        Insert: Omit<Watchlist, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Watchlist, 'id' | 'user_id' | 'created_at'>>
        Relationships: []
      }
      watchlist_groups: {
        Row: WatchlistGroup
        Insert: Omit<WatchlistGroup, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<WatchlistGroup, 'id' | 'watchlist_id' | 'created_at'>>
        Relationships: []
      }
      watchlist_items: {
        Row: WatchlistItem
        Insert: Omit<WatchlistItem, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<WatchlistItem, 'id' | 'watchlist_id' | 'created_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      market_type: MarketType
      screening_status: ScreeningStatus
    }
    CompositeTypes: Record<string, never>
  }
}
