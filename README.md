# Daily Stock Screener (老余三問自動選股系統)

這是一個基於 Next.js (Frontend) 與 Python (Backend Automation) 的自動化選股系統。主要目的是透過自動化腳本每日盤後撈取台股與美股資料，運用嚴格的「老余三問」破底翻選股邏輯進行篩選，並將結果儲存於 Supabase 以供前端網頁展示。

## 系統架構

- **Frontend**: Next.js v16 (App Router), Tailwind CSS, shadcn-ui, React Query.
- **Backend Automation**: Python 3.9+, yfinance (美股與台股歷史資料), TWSE OpenAPI (台股股票代號), pandas, tenacity.
- **Database**: Supabase (PostgreSQL).

---

## 核心選股邏輯：「老余三問」

本系統實作了嚴格的破底翻型態篩選，必須同時滿足以下三個條件：

### 1. 位置 (Position) - 關鍵邊界支撐

- 系統會提取過去 200 週 K 線的所有轉折低點 (Swing Lows)。
- 找出最接近當前時間的**兩個連續轉折低點 A（最新）與 B（前一個）**。
- 若 A 與 B 的價格落差在 **5% 以內**，則這兩點建立了一個「**關鍵邊界**」，支撐最低點定義為 `min(A, B)`。
- _(淘汰條件)_：若無連續轉折點，或 A 與 B 落差大於 5%，則直接淘汰。

### 2. 慣性 (Momentum) - 假跌破與長下影線

- **長下影線**：最新一週的 K 棒，下影線長度必須大於整體 K 棒長度的一半 `(lower_shadow / total_range) > 0.5`。
- **跌破邊界**：最新週的最低價必須**小於**關鍵邊界最低點（代表曾經跌破支撐）。
- **實體站穩**：最新週的實體底部（開盤價與收盤價的較低者）必須**大於等於**關鍵邊界最低點（代表收盤或開盤穩在支撐之上，形成假跌破）。

### 3. 圖 (Pattern) - 破底翻回調比例

尋找日線等級的 P1 ~ P5 轉折點：

- P5（右腳）、P3（破底點）、P1（左腳）。P5 與 P1 的價格差距必須在 3% 以內。
- P2 為 P1 到 P3 之間的最高轉折點。
- **尋找小頸線 P4**：P3 到 P5 之間必須存在一個最高轉折點 P4。_(若沒有明顯反彈高點則淘汰)_。
- **右腳回調深度**：右腳 (P5) 相對於小頸線 (P4) 的回落距離，必須落在左腳跌幅 (P2-P3) 的 **25% ~ 75%** 之間。
  - 公式：`(P2 - P3) * 0.25 <= (P4 - P5) <= (P2 - P3) * 0.75`

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
