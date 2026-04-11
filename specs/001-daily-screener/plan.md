# 實作計畫：自動股票篩選網站

**分支**: `001-daily-screener` | **日期**: 2026-04-11 | **規格**: [specs/001-daily-screener/spec.md](file:///Users/gavin/Desktop/Gavin_app/self-side-project/stock-screener/specs/001-daily-screener/spec.md)
**輸入**: 來自 `/specs/001-daily-screener/spec.md` 的功能規格

**備註**: 此範本由 `/speckit-plan` 指令填寫。執行流程請見 `.specify/templates/plan-template.md`。

## 總結

建立一個零成本的自動化股票篩選系統。透過 GitHub Actions 每天台灣時間 15:00 執行 Python 爬蟲抓取台股 (FinMind) 及美股納斯達克 (yfinance) 盤後資料，應用「老余三問（位置、慣性、圖-破底翻）」邏輯篩選後，寫入 Supabase 資料庫。前端採用 Next.js v16 搭配 Tailwind CSS 顯示篩選結果，並支援查看近 5 天歷史紀錄，全程遵守測試驅動開發 (TDD) 與高效能開發規範。

## 技術背景

**語言/版本**: 前端使用 TypeScript (Next.js v16)，自動化腳本使用 Python 3.11+
**主要依賴**: React v19, Tailwind CSS, Zustand, @tanstack/react-query, shadcn-ui, date-fns, yfinance, FinMind, pandas  
**儲存方案**: Supabase (PostgreSQL 搭配資料列層級安全性 RLS)  
**測試框架**: Mock Service Worker (MSW), Vitest, Playwright (前端), GitHub Actions (排程)  
**部署平台**: Vercel (前端), GitHub Actions (後端腳本)  
**專案類型**: 網頁應用程式 + 自動化資料管線  
**效能目標**: 頁面載入與切換小於 3 秒 (運用 Next.js 快取與伺服器元件)  
**限制條件**: 零成本營運 (利用 Supabase, Vercel, GitHub Actions 免費額度)，嚴格執行 TDD  
**規模/範圍**: 個人使用，極低的資料庫讀寫量 (最多儲存/查詢近 5 天的資料)

## 專案憲法檢查

*閘門：必須在進入開發前通過檢查。*

- **1. 高程式碼品質**: 通過 (設計採用模組化 Next.js 元件與分離的 Python 計算腳本)
- **2. TDD**: 通過 (前端配置 Vitest + MSW，依賴 Spec 的 User Story)
- **3. 使用者體驗一致性**: 通過 (整合 shadcn-ui 與 Tailwind)
- **4. 高效能表現**: 通過 (使用 Next.js ISR/SSR 避免頻繁發送請求，消除 Waterfall)
- **5. 在地化語言**: 通過 (已落實於 Spec/Plan 皆採用台灣習慣用語)
- **6. 債務管理**: 通過 (使用 `// TODO(TECH-DEBT)` 標記處理例外狀況)
- **7. MVP 優先**: 通過 (只顯示清單並外連 TradingView，不自行實作 K 線圖)
- **8. 防止過度設計**: 通過 (無須設立複雜伺服器，改用 GitHub Actions 排程與 Serverless DB)
- **9. 嚴格資安防護**: 通過 (Supabase 啟用 RLS，Next.js App router 隱藏環境變數)
- **10. 前端規範**: 通過 (遵循 `@[/vercel-react-best-practices]`)
- **11. 後端規範**: 通過 (遵循 `@[/supabase-postgres-best-practices]`)

## 專案結構

### 文件 (當前功能)

```text
specs/001-daily-screener/
├── plan.md              # 此檔案
├── research.md          # 決策與研究結果
├── data-model.md        # 資料模型
├── quickstart.md        # 快速啟動指南
├── contracts/           # API 或資料庫結構契約
└── tasks.md             # 待辦任務列表
```

### 原始碼 (儲存庫根目錄)

```text
frontend/
├── src/
│   ├── app/                # Next.js App Router (頁面與佈局)
│   ├── components/         # shadcn-ui 與客製化 React 元件
│   ├── lib/                # 工具函式 (date-fns, Supabase client), 狀態管理 (Zustand)
│   └── services/           # 資料提取 (react-query 查詢)
├── tests/
│   ├── e2e/                # Playwright 端對端測試
│   └── unit/               # Vitest + MSW 測試輔助

scripts/
└── automation/
    ├── screener.py         # 抓取 FinMind/yfinance 資料的 Python 腳本
    ├── logic.py            # 老余三問技術分析邏輯
    └── requirements.txt    # Python 依賴清單
    
.github/
└── workflows/
    └── daily-screener.yml  # GitHub Actions 排程定義
```

**結構決策**: 採用分離的前端與腳本資料夾架構 (Frontend + Automation Script)。前端處理介面展示與狀態切換，腳本處理厚重的資料抓取與運算，寫入共用的 Supabase 資料庫。

## 複雜度追蹤

> **僅在專案憲法檢查有例外狀況需解釋時填寫**

| 違規項目 | 為什麼需要 | 較簡單的替代方案為何被拒絕 |
|-----------|------------|-------------------------------------|
| 無違規 | N/A | N/A |
