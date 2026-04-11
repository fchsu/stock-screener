<!-- 
Sync Impact Report
- Version: 1.0.0
- Modified principles: 將預設佔位符替換為 11 項使用者自訂且在地化的核心原則。
- Added sections: Governance
- Removed sections: 預設佔位符區塊與註解 (Default placeholder guidelines)
- Templates requiring updates:
  - .specify/templates/plan-template.md ⚠ pending
  - .specify/templates/spec-template.md ⚠ pending
  - .specify/templates/tasks-template.md ⚠ pending
-->
# 專案憲法 (Project Constitution)

## 核心原則

### 1. 高程式碼品質
專案必須維持最高標準的程式碼品質，遵循 Clean Code 原則，保持程式碼的可讀性、可維護性及模組化，避免撰寫難以理解的複雜邏輯。

### 2. 測試驅動開發 (TDD)
必須嚴格遵守測試驅動開發原則。開發新功能前應先撰寫測試，符合紅-綠-重構 (Red-Green-Refactor) 循環，並參考 `@[/tdd]` 與 `@[/playwright-best-practices]` 實作各層級的單元測試與端對端 (E2E) 測試，確保系統可靠度。

### 3. 使用者體驗一致性
所有使用者介面需維持高度的一致性，並遵循 `@[/frontend-design]` 與 `@[/building-components]` 模式，打造現代化、無障礙且可重複使用的 UI 元件，提供符合預期且絕佳的使用體驗。

### 4. 高效能表現
系統架構需以高效能為優先考量，避免不必要的重新渲染、冗餘的大型 bundle 載入及低效的非同步呼叫，確保終端使用者的流暢操作體驗。

### 5. 在地化語言規範
所有 Markdown 文件及程式碼內的註解，**一律強制使用「正體中文 (zh-tw)」**，並且必須符合「台灣習慣用語」（例如：專案、執行、快取、資料庫、網頁、伺服器、變數、記憶體、佈署）。

### 6. 技術債管理機制
任何開發過程中所遺留、待未來優化或因階段性妥協而產生的技術債，都必須嚴格使用特定的註解前綴標明，包含原因說明，以便日後追蹤與重構：
`// TODO(TECH-DEBT): 說明待修復或優化的具體原因`

### 7. 最小可行性產品 (MVP)
產品開發應專注於交付最小可行性產品 (MVP)，優先集中資源實現最核心的商業價值與核心功能，避免在初期納入非必要特性或糾結於邊緣情境。

### 8. 防止過度設計 (Overdesign)
強烈實踐 YAGNI (You Aren't Gonna Need It) 原則。僅撰寫滿足當前需求所需的程式碼與架構，拒絕預先加入未經驗證、過於複雜的設計模式與抽象層次。

### 9. 嚴格資訊安全防護
應用程式前端與資料庫後端層面皆必須落實嚴密且嚴格的資訊安全防護措施，包含防範 XSS、CSRF、資料隱碼 (SQL Injection) 等常見手段，並確保使用者資料存取權限的安全驗證無外洩風險。

### 10. 前端開發規範
前端應用開發需嚴格遵守 `@[/vercel-react-best-practices]` 指南中的效能優化與 React/Next.js 最佳實踐，致力於消除 Waterfall 請求、優化打包大小以及優化渲染流程。

### 11. 資料庫與後端設定規範
資料庫相關設計、查詢指令撰寫與後端環境安全設定皆需要遵守 `@[/supabase-postgres-best-practices]` 規範，實施正確的 Table 規劃、關聯表索引 (Indexing) 及 Row-Level Security (RLS) 資料列安全存取原則。

## 治理與專案管理 (Governance)

- 所有的 Pull Request 及程式碼審查 (Code Review) 都必須確保實作符合上述 11 項核心原則。
- 修改此專案憲法必須經過充分討論並更新版本號紀錄。
- 包含測試覆蓋率、效能檢測指標與靜態資安掃描，都應做為持續整合 (CI) 流程中不可或缺的品質閘門 (Quality Gates)。

**Version**: 1.0.0 | **Ratified**: 2026-04-11 | **Last Amended**: 2026-04-11
