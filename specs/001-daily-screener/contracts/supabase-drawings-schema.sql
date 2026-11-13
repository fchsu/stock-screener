-- Supabase Schema 契約: K 線圖互動畫線系統 (Chart Drawings)
-- 依賴 auth.users(id)

-- 1. K 線圖畫線資料表 (chart_drawings)
CREATE TABLE IF NOT EXISTS chart_drawings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    tool_type TEXT NOT NULL CHECK (tool_type IN ('horizontal', 'path')),
    points JSONB NOT NULL CHECK (
        jsonb_typeof(points) = 'array'
        AND (
            (tool_type = 'horizontal' AND jsonb_array_length(points) = 1)
            OR (tool_type = 'path' AND jsonb_array_length(points) BETWEEN 2 AND 50)
        )
    ),
    style JSONB NOT NULL DEFAULT '{"color":"#3b82f6","lineWidth":2,"lineStyle":"solid"}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chart_drawings_user_symbol
    ON chart_drawings(user_id, symbol, created_at);

-- 2. 配額上限守門員 (PostgreSQL Trigger: 每檔股票最多 50 條畫線)
CREATE OR REPLACE FUNCTION check_chart_drawing_quota()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM chart_drawings
        WHERE user_id = NEW.user_id AND symbol = NEW.symbol
    ) >= 50 THEN
        RAISE EXCEPTION '每檔股票最多只能建立 50 條畫線';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_chart_drawing_quota ON chart_drawings;
CREATE TRIGGER trg_check_chart_drawing_quota
BEFORE INSERT ON chart_drawings
FOR EACH ROW EXECUTE FUNCTION check_chart_drawing_quota();

-- 3. 資料列層級安全性 (Row Level Security, RLS)
ALTER TABLE chart_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on chart_drawings"
ON chart_drawings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
