# Daily Stock Screener (老余三問自動選股系統)

這是一個基於 Next.js (Frontend) 與 Python (Backend Automation) 的自動化選股系統。主要目的是透過自動化腳本每日盤後撈取台股與美股資料，運用嚴格的「老余三問」破底翻選股邏輯進行篩選，並將結果儲存於 Supabase 以供前端網頁展示。

## 系統架構

- **Frontend**: Next.js v16 (App Router), Tailwind CSS, shadcn-ui, React Query.
- **Backend Automation**: Python 3.9+, yfinance (美股與台股歷史資料), TWSE OpenAPI (台股股票代號), pandas, tenacity.
- **Database**: Supabase (PostgreSQL).

---

## 篩選標的池與排程機制

- **台股母體**：TWSE 上市股票，過濾當日成交量 $\ge 1,000$ 張。
- **美股母體**：S&P Composite 1500 成分股（S&P 500 大型 + S&P 400 中型 + S&P 600 小型，約 1,504 檔），兼顧充足流動性與中小型股的週線轉折動能。
- **排程執行**：GitHub Actions 固定於每日 **15:15（台灣時間）** 自動執行。
  - **台股**：採當日收盤數據。
  - **美股**：美東尚未開盤，採美東前一交易日收盤數據（週六 15:15 會自動結算美股週五收盤）。
  - **休市判斷**：透過 `0050.TW` 與 `SPY` 最新交易日探針，動態辨識非固定休市（國定假日、颱風假等），避免誤寫空資料。

---

## 核心選股邏輯：「老余三問」

本系統實作了型態篩選，包含完全符合的「破底翻 (Strict)」與放寬過濾的「慣性翻轉 (Momentum)」：

### 1. 位置 (Position) - 關鍵邊界支撐

- 系統提取過去 200 週 K 線的所有轉折低點 (Swing Lows)。
- 掃描所有歷史低點組合，尋找任兩點價格差距在 **5% 以內**的水平確認區，建立「**關鍵邊界**」，支撐低點定義為 `min(A, B)`。
- 由高至低優先確認有效邊界，允許中間夾帶次級波動，不僵化綁定最後相鄰兩點。
- _(淘汰條件)_：若無任一組低點落差在 5% 以內，直接淘汰。

### 2. 慣性 (Momentum) - 假跌破與長下影線

- **候選檢驗週**：同時檢驗「當週」與「上週已收定週 K」，避免週中因當週未走完而錯失剛成型的反轉訊號。
- **長下影線**：下影線長度大於整體 K 棒振幅的一半 `(lower_shadow / total_range) >= 0.5`。
- **假跌破確認**：最低價跌破關鍵邊界，但實體底部（`min(Open, Close)`）守穩於關鍵邊界之上。
- **真破位淘汰**：當週實體底部若已跌破關鍵邊界（假跌破演變為真破位），直接淘汰。

### 3. 圖 (Pattern) - 破底翻回調比例

尋找日線等級的 P1 ~ P5 轉折點：

- P5（右腳）、P3（破底點）、P1（左腳）。P5 與 P1 的價格差距必須在 3% 以內。
- 右腳 P5 價格不得低於破底點 P3（`P5 >= P3`）。
- P2 為 P1 到 P3 之間的最高轉折點。
- **尋找小頸線 P4**：P3 到 P5 之間必須存在一個最高轉折點 P4。
- **右腳回調深度**：右腳 (P5) 相對於小頸線 (P4) 的回落距離，必須落在左腳跌幅 (P2-P3) 的 **25% ~ 75%** 之間。
  - 公式：`(P2 - P3) * 0.25 <= (P4 - P5) <= (P2 - P3) * 0.75`

若僅通過條件 1 與 2，系統歸類為「🌊 慣性過濾」；若三者皆符合，則標記為「🎯 完全符合 (破底翻)」。

---

## 本機開發與啟動步驟

### 1. 環境變數設定

請在專案根目錄與 `scripts/` 目錄下建立 `.env` 檔案，包含 Supabase 的相關金鑰：

```env
NEXT_PUBLIC_SUPABASE_URL="你的 Supabase URL"
NEXT_PUBLIC_SUPABASE_ANON_KEY="你的 Supabase Anon Key"
SUPABASE_SERVICE_ROLE_KEY="你的 Supabase Service Role Key"
```

### 2. 前端開發環境

確保你已安裝 Node.js (v18+) 與 pnpm。

```bash
# 安裝依賴
pnpm install

# 啟動開發伺服器
pnpm dev
```

瀏覽器開啟 `http://localhost:3000` 即可看到網頁介面。

### 3. 自動化腳本開發環境 (Python)

確保你已安裝 Python 3.9+。

```bash
cd scripts

# 建立並啟動虛擬環境
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# windows: .venv\Scripts\activate

# 安裝依賴
pip install -r automation/requirements.txt
```

---

## 如何手動觸發自動選股

自動化腳本 (`automation.screener`) 設計為每日盤後執行，會自動抓取當天的台美股資料，進行邏輯篩選並寫入 Supabase。

### 一般執行 (撈取今日最新資料)

請進入 `scripts/` 目錄，並在啟動虛擬環境的狀態下執行：

```bash
cd scripts
source .venv/bin/activate
python -m automation.screener
```

## 部署說明

- **Frontend**: 可直接部署於 Vercel，設定對應的 `NEXT_PUBLIC_SUPABASE_*` 環境變數。
- **Automation**: 透過 GitHub Actions 設定 `.github/workflows/screener.yml` 排程每日盤後執行，需在 GitHub Repository Secrets 中設定對應的環境變數。
