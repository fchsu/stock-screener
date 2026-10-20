# AGENTS.md — 專案開發與營運準則

本檔案定義 AI 代理與開發者在此專案（Daily Stock Screener 老余三問自動選股系統）中必須嚴格遵守的核心規則。

---

## 1. 零成本營運原則（最高優先級硬性限制）

**整個專案必須在「完全不產生任何費用（$0 成本）」的前提下運作。** 任何功能設計、第三方服務選型或架構變更，皆不得違反以下限制：

- **禁止付費 API 與商業授權套件**：
  - 行情資料僅可使用免金鑰、無計費機制的公開來源（如 Yahoo Finance 公開 API / `yfinance`、TWSE 證交所 OpenAPI、Wikipedia 成分股清單）。
  - 前端圖表與 UI 僅可使用免費開源套件（如 TradingView 開源的 `lightweight-charts` Apache 2.0 授權），嚴禁引入需商業授權或依請求量計費的 SDK。
- **資料庫容量與讀寫控制（Supabase Free Tier）**：
  - 資料庫僅儲存每日篩選後的結果清單（`screening_results`），**禁止**將全市場歷史 K 線（OHLCV）原始資料寫入 Supabase，以確保資料庫體積遠低於 500MB 免費上限。
  - 自動化腳本必須維持每日清理超過 5 天的歷史紀錄（`cleanup_old_data`）。
  - 前端讀取必須透過 SSR 批次查詢（一次拉取 5 天）並注入 React Query 快取，避免重複查詢消耗免費配額。
- **無伺服器運算與頻寬節流（Vercel Hobby Free Tier）**：
  - 所有 Next.js API Route（如 K 線資料代理端點）必須設定 `Cache-Control`（`s-maxage` 與 `stale-while-revalidate`）以及前端 React Query 快取（`staleTime`），確保同一檔股票與時框不會重複觸發 Serverless Function。
  - 禁止使用任何需要升級 Vercel Pro 才能運作的功能。
- **排程運算控制（GitHub Actions Free Tier）**：
  - 每日盤後排程固定執行 1 次，並使用多執行緒批次下載避免超時或消耗過多 Actions 分鐘數。

---

## 2. 語言與程式碼風格規範

- **台灣正體中文（zh-TW）**：
  - 所有 Markdown 文件、對話、UI 文字與程式碼註解，一律使用**正體中文**並符合**台灣習慣用語**（例如：專案、執行、快取、資料庫、伺服器、變數、佈署、程式碼、品質）。
  - 註解應精簡自然，說明「為什麼這樣設計（Why）」而非複述程式碼表面行為。
- **遵守 Prettier 與 ESLint**：
  - 所有新增或修改的程式碼必須符合根目錄 `.prettierrc`（無分號、單引號、行寬 100）與 `eslint.config.mjs` 規範。
- **技術債標記**：
  - 階段性妥協或待優化項目必須統一標註：`// TODO(TECH-DEBT): 具體原因說明`。

---

## 3. 架構、效能與測試規範

- **防止過度設計（YAGNI & MVP）**：
  - 僅實作滿足當前明確需求的最小可行架構，不預先建立無用的抽象層。
- **前端效能（React 19 / Next.js 16 / TanStack Query）**：
  - 消除請求瀑布（Request Waterfall），重型或僅在瀏覽器繪製的元件（如 Canvas 圖表）應確保正確處理 Client 端生命週期與記憶體釋放（Unmount 時銷毀圖表實例）。
- **測試與驗證（TDD）**：
  - 新增或修改功能時，需同步更新或撰寫對應的單元測試（`tests/unit/`，使用 Vitest + Testing Library + MSW）與端對端測試（`tests/e2e/`，使用 Playwright）。
  - 完成修改前必須確認 `pnpm test` 與 `pnpm lint` 通過。
- **資訊安全**：
  - `SUPABASE_SERVICE_ROLE_KEY` 僅限後端自動化腳本使用，嚴禁暴露於前端或 `NEXT_PUBLIC_*` 環境變數中；Supabase 必須維持啟用 RLS（Row-Level Security）。
