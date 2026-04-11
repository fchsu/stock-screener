# 第 0 階段：研究與框架決策

## 決策 1：資料抓取與排程使用的語言和工具
- **決策**: 使用 Python 撰寫資料抓取與篩選腳本，並透過 GitHub Actions 每日排程執行。
- **理由**: 您明確指定了 `yfinance` 與 `FinMind`。`yfinance` 是 Python 限定的套件，能免費且高效地抓取 Yahoo Finance 的市場資料。`FinMind` 也提供 Python API 與 REST API。考量到 Python 在金融數據處理 (如 Pandas) 上的強大優勢，用 Python 腳本封裝「抓取 -> 老余三問邏輯篩選 -> 寫入 Supabase」的流程是最佳選擇。
- **替代方案**: 使用 Node.js (`yahoo-finance2`)。但這不僅偏離了原始規格指定的工具，在處理 K 線技術指標時，Node.js 也不如 Python 簡潔穩定。

## 決策 2：Supabase 資料表結構與整合 (JSONB vs 關聯式表格)
- **決策**: 建立單一張 `screening_results` 關聯式資料表來記錄每日結果，並將當天篩選出來的股票清單 (`assets`) 以 **JSONB** 格式儲存在該張表的單一欄位中。同時使用資料列層級安全性 (RLS) 來保護資料寫入。
- **理由**: 每天的篩選結果只有少數幾檔股票，且應用程式只需要「一次讀取一整天的清單」，不需要針對單一股票進行複雜的跨表查詢。
  - **關聯式表格 (Relational Table) 是什麼？**：傳統的關聯庫做法會建立兩張表：`ScreeningResult` (記錄日期) 和 `StockAsset` (記錄單筆股票)，兩者用 Foreign Key 關聯起來。這樣的彈性高，適合複雜查詢，但會增加資料庫的行數 (Row Count) 開銷。
  - **JSONB 是什麼？**：PostgreSQL 支援將完整的 JSON 陣列直接存入單一欄位 (即 JSONB)。
  - **有什麼不同？**：若採用嚴格的兩張關聯式表格，每天 10 檔股票會寫入 1 筆 Result + 10 筆 Asset。若採用 JSONB，每天只需寫入 **1 筆資料**。由於我們是在 Supabase 完全免費方案下營運，採用 JSONB 能大幅節省資料庫寫入量與空間，完全符合 Minimal Viable Product (MVP) 原則與效能考量。
- **替代方案**: 將結果寫回 GitHub Repo 儲存成 .json 檔案。這已被 Spec 文件排除，因為每天自動 Commit 會製造過多無意義的版本紀錄。

## 決策 3：Next.js 前端資料提取策略
- **決策**: 使用 React 伺服器元件 (RSC) 與靜態/增量靜態生成 (ISR)，再搭配 `@tanstack/react-query` 與 Zustand 管理客戶端狀態 (歷史紀錄切換)。
- **理由**: 完全符合 `@[/vercel-react-best-practices]` 的效能優先原則。使用 ISR 可讓 15:00 產生的資料在伺服器端被快取起來，所有訪客只需讀取快取，能極大化減少對 Supabase 的查詢次數，保護免費額度並縮短延遲。
- **替代方案**: 純客戶端 (Client-side) 抓取。這會造成每個訪客都觸發資料庫查詢，且容易產生 Waterfall 請求，違背效能規範。
