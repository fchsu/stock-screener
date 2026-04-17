# Tasks: 自動股票篩選網站

**輸入**: 設計文件來自 `/specs/001-daily-screener/`
**前置條件**: plan.md (必填), spec.md (使用者故事), research.md, data-model.md

## Phase 1: Setup (環境設定)

**目標**: 專案基礎結構與套件初始化

- [ ] T001 建立專案基礎結構，劃分 `frontend/` 與 `scripts/` 目錄
- [ ] T002 初始化 Next.js v16 專案並安裝 Tailwind CSS, shadcn-ui, react-query 等依賴至 `frontend/`
- [ ] T003 [P] 建立 Python 虛擬環境並建立 `scripts/automation/requirements.txt` (包含 yfinance, FinMind, pandas, pytest)
- [ ] T004 [P] 設定前端程式碼檢查與格式化工具 (Prettier/ESLint) 於 `frontend/`

---

## Phase 2: Foundational (核心基礎)

**目標**: 完成所有後續功能開發所必須依賴的基礎建設

**⚠️ CRITICAL**: 在此階段完成前，不得開始實作任何使用者故事

- [ ] T005 設定 Supabase 專案，建立 `screening_results` 資料表及 RLS 規則
- [ ] T006 建立前端 Supabase client 實例於 `frontend/src/lib/supabase.ts`
- [ ] T007 [P] 設定前端 Vitest 與 MSW 測試輔助環境於 `frontend/tests/unit/`
- [ ] T008 [P] 設定前端 Playwright E2E 測試環境於 `frontend/tests/e2e/`

---

## Phase 3: User Story 1 - 瀏覽每日篩選結果清單 (Priority: P1) 🎯 MVP

**目標**: 前端能順利載入當日篩選結果並顯示股票名稱、代號及 TradingView 連結。首頁預設為當天內容。
**獨立測試**: 給定 mock 資料時，網頁能正確顯示股票列表與有效的跳轉連結。

*遵守 TDD (Vertical Slices)：每個切面包含對應的 Unit / E2E 測試，先紅 (Red) 後綠 (Green)。*

- [ ] T009 [US1] 撰寫「瀏覽每日篩選結果清單」之 Playwright E2E 測試 (Red) 於 `frontend/tests/e2e/us1-view-list.spec.ts`
- [ ] T010 [US1] 撰寫 `useScreeningResult` React Query Hook 單元測試 (Red) 於 `frontend/tests/unit/services/queries.test.ts`
- [ ] T011 [US1] 實作 `StockAsset`、`ScreeningResult` 型別定義與 `useScreeningResult` Hook，使 Hook 單元測試通過 (Green/Refactor) 於 `frontend/src/lib/types.ts` 與 `frontend/src/services/queries.ts`
- [ ] T012 [US1] 撰寫首頁 UI 渲染清單（含載入中、股票列表、TradingView連結）之單元測試 (Red) 於 `frontend/tests/unit/components/StockList.test.tsx`
- [ ] T013 [US1] 實作首頁 UI 渲染元件，使單元測試通過，並確認整體 E2E 測試順利通過 (Green/Refactor) 於 `frontend/src/app/page.tsx`

---

## Phase 4: User Story 2 - 切換查看歷史篩選紀錄 (Priority: P2)

**目標**: 使用者可以透過點擊相對天數按鈕（如「當天」、「前1天」等），以固定參數連結的頁面切換方式，查看最近 5 個工作天內的任何一天結果。
**獨立測試**: 點擊相對日期按鈕後，能產生帶有固定參數（如 `/?offset=1`）的網址並透過 App Router 更新畫面，且只提供近 5 天的按鈕。

- [ ] T014 [US2] 撰寫「點擊相對天數按鈕進行頁面切換查看歷史紀錄」之 Playwright E2E 測試 (Red) 於 `frontend/tests/e2e/us2-history.spec.ts`
- [ ] T015 [US2] 撰寫「日期切換按鈕群 (DateNav)」元件（顯示「當天」至「前4天」，並產生如 `/?offset=x` 的固定連結）之單元測試 (Red) 於 `frontend/tests/unit/components/DateNav.test.tsx`
- [ ] T016 [US2] 實作 `DateNav` 元件，使元件單元測試通過 (Green/Refactor) 於 `frontend/src/components/DateNav.tsx`
- [ ] T017 [US2] 實作 Next.js 頁面參數讀取（讀取 URL search params `/?offset=X`）並整合 `DateNav` 更新首頁，確保整體 E2E 測試通過 (Green/Refactor) 於 `frontend/src/app/page.tsx`

---

## Phase 5: User Story 3 - 系統每日自動執行盤後篩選 (Priority: P1)

**目標**: 透過 GitHub Actions 與 Python 腳本自動抓取資料、套用老余三問邏輯並更新 Supabase。
**獨立測試**: 執行排程腳本整合測試能正確觸發爬蟲，遇錯誤能重試 3 次，並成功寫入狀態與結果至資料庫。

- [ ] T018 [US3] 撰寫 Python 腳本「爬取資料並寫入資料庫」之整合測試 (Integration Test，使用 pytest) (Red) 於 `scripts/tests/integration/test_automation_flow.py`
- [ ] T019 [US3] 撰寫「老余三問（位置、慣性、圖-破底翻）」技術分析邏輯之單元測試 (Red) 於 `scripts/tests/unit/test_logic.py`
- [ ] T020 [US3] 實作老余三問篩選邏輯，使邏輯單元測試通過 (Green/Refactor) 於 `scripts/automation/logic.py`
- [ ] T021 [US3] 撰寫「FinMind 台股及 yfinance 美股爬蟲與 Supabase 資料庫寫入」之單元/整合測試 (Red) 於 `scripts/tests/unit/test_screener.py`
- [ ] T022 [US3] 實作爬蟲模組與狀態寫入邏輯，使爬蟲單元測試及自動化整合測試通過 (Green/Refactor) 於 `scripts/automation/screener.py`
- [ ] T023 [US3] 前端實作狀態顯示元件（區分台股與美股不同狀態），包含對應之單元與 E2E 測試更新於 `frontend/src/app/page.tsx`
- [ ] T024 [US3] 建立 GitHub Actions workflow 排程（每日 15:00 執行）於 `.github/workflows/daily-screener.yml`

---

## Phase 6: Polish & Cross-Cutting Concerns

**目標**: 整體效能優化、文件完善

- [ ] T025 [P] 補充專案 README.md，包含本機啟動步驟與部署說明
- [ ] T026 確保 Next.js SSR/ISR 設定生效，檢查效能指標並消除 Waterfall 請求於 `frontend/src/app/page.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴，可立即開始
- **Foundational (Phase 2)**: 依賴 Setup 完成，阻擋所有使用者故事
- **User Stories (Phase 3+)**: 依賴 Foundational 完成後即可進行
- **Polish (Final Phase)**: 依賴所有選定的使用者故事完成

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 完成後即可開始，無其他依賴
- **User Story 2 (P2)**: 依賴 US1 的基礎，依循 TDD 確保不破壞既有功能
- **User Story 3 (P1)**: 腳本開發可與前端平行，依循 TDD 確保各自穩健

### Parallel Opportunities & TDD Workflow

- 嚴格遵守 **TDD Vertical Slices**: 每個小節 (Red) -> (Green) 必須循序進行，不應在未通過測試前撰寫下一段實作。
- Phase 1 & 2 內的設定任務可由不同成員平行處理。
- Foundational 完成後，US1 (前端 UI) 與 US3 (爬蟲腳本) 的 TDD 循環可完全由不同成員平行開發。
