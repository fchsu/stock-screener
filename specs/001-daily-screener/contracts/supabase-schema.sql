-- Supabase Schema 契約: 001-daily-screener

-- 定義市場別的列舉型別 (Enum)
CREATE TYPE market_type AS ENUM ('TWSE', 'NASDAQ', 'US');

-- 定義篩選狀態的列舉型別
CREATE TYPE screening_status AS ENUM ('fetching', 'completed', 'failed', 'closed');

-- 建立主要資料表：篩選結果 (screening_results)
CREATE TABLE IF NOT EXISTS screening_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    date DATE NOT NULL,
    market market_type NOT NULL,
    status screening_status NOT NULL DEFAULT 'fetching',
    assets JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, market)
);

-- 啟用資料列層級安全性 (Row Level Security, RLS) 來保護資料
ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;

-- 允許所有人 (包含匿名訪客) 進行唯讀 (SELECT) 存取
CREATE POLICY "Allow public read access" 
ON screening_results 
FOR SELECT 
USING (true);

-- 允許後端 (透過特權 Service Role 驗證) 進行新增與修改
-- (將由 GitHub Actions 腳本使用 Supabase Service Role Key 來達成)

