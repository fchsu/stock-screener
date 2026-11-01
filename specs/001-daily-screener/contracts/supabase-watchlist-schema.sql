-- Supabase Schema 契約: 自選觀察清單 (Watchlists)
-- 依賴 specs/001-daily-screener/contracts/supabase-schema.sql 之 market_type 列舉型別

-- 1. 觀察清單主表 (watchlists)
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_sort
    ON watchlists(user_id, sort_order, created_at);

-- 2. 觀察清單群組表 (watchlist_groups)
CREATE TABLE IF NOT EXISTS watchlist_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_groups_list_sort
    ON watchlist_groups(watchlist_id, sort_order, created_at);

-- 3. 觀察清單標的表 (watchlist_items)
-- 當群組刪除時，透過 ON DELETE SET NULL 自動將群組內標的退回「未分類 (group_id = NULL)」
CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    group_id UUID REFERENCES watchlist_groups(id) ON DELETE SET NULL,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    market market_type NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(watchlist_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_list_group_sort
    ON watchlist_items(watchlist_id, group_id, sort_order, created_at);

-- 4. 配額上限守門員 (PostgreSQL Triggers: 10 清單 / 10 群組 / 100 標的)
CREATE OR REPLACE FUNCTION check_watchlist_quota()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM watchlists WHERE user_id = NEW.user_id) >= 10 THEN
        RAISE EXCEPTION '每個帳號最多只能建立 10 個觀察清單';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_watchlist_quota ON watchlists;
CREATE TRIGGER trg_check_watchlist_quota
BEFORE INSERT ON watchlists
FOR EACH ROW EXECUTE FUNCTION check_watchlist_quota();

CREATE OR REPLACE FUNCTION check_watchlist_group_quota()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM watchlist_groups WHERE watchlist_id = NEW.watchlist_id) >= 10 THEN
        RAISE EXCEPTION '每個觀察清單最多只能建立 10 個群組';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_watchlist_group_quota ON watchlist_groups;
CREATE TRIGGER trg_check_watchlist_group_quota
BEFORE INSERT ON watchlist_groups
FOR EACH ROW EXECUTE FUNCTION check_watchlist_group_quota();

CREATE OR REPLACE FUNCTION check_watchlist_item_quota()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM watchlist_items WHERE watchlist_id = NEW.watchlist_id) >= 100 THEN
        RAISE EXCEPTION '每個觀察清單最多只能加入 100 檔標的';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_watchlist_item_quota ON watchlist_items;
CREATE TRIGGER trg_check_watchlist_item_quota
BEFORE INSERT ON watchlist_items
FOR EACH ROW EXECUTE FUNCTION check_watchlist_item_quota();

-- 5. 資料列層級安全性 (Row Level Security, RLS)
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on watchlists"
ON watchlists
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner full access on watchlist_groups"
ON watchlist_groups
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM watchlists w
        WHERE w.id = watchlist_groups.watchlist_id
          AND w.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM watchlists w
        WHERE w.id = watchlist_groups.watchlist_id
          AND w.user_id = auth.uid()
    )
);

CREATE POLICY "Owner full access on watchlist_items"
ON watchlist_items
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM watchlists w
        WHERE w.id = watchlist_items.watchlist_id
          AND w.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM watchlists w
        WHERE w.id = watchlist_items.watchlist_id
          AND w.user_id = auth.uid()
    )
);
