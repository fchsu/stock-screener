# 資料模型：001-daily-screener

## 主要實體 (Entities)

### 1. `StockAsset`

代表系統中篩選出的單一股票標的。

| 欄位名稱         | 型別     | 描述                                             |
| ---------------- | -------- | ------------------------------------------------ |
| `symbol`         | `string` | 股票代號 (例如: "2330.TW", "AAPL")               |
| `name`           | `string` | 股票名稱 (例如: "台積電", "Apple Inc.")          |
| `market`         | `enum`   | 市場別: `'TWSE'` (台股) 或 `'NASDAQ'` (納斯達克) |
| `tradingViewUrl` | `string` | 該股票於 TradingView 的 K 線圖頁面連結           |

### 2. `ScreeningResult`

特定日期符合「老余三問」篩選條件的股票列表組合。因成本考量，此實體會儲存為 Supabase 的單筆紀錄 (Row)。

| 欄位名稱    | 型別        | 描述                                                                                            |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `id`        | `uuid`      | 主鍵 (Primary Key)                                                                              |
| `date`      | `date`      | 用來代表「交易日」(例如 `'2026-04-11'`)。**注意**：交易日只關乎該市場的特定日期，不包含時間點。 |
| `market`    | `enum`      | 市場別: `'TWSE'` 或 `'NASDAQ'` (為了區分不同市場的狀態)                                         |
| `status`    | `enum`      | 更新狀態: `'fetching'`, `'completed'`, `'failed'`, `'closed'` (休市)                            |
| `assets`    | `jsonb`     | 符合條件的 `StockAsset` 陣列，若無則為空陣列 `[]`                                               |
| `updatedAt` | `timestamp` | 紀錄最後更新的絕對時間點 (使用 ISO 8601 UTC 格式)。                                             |

#### 關於時間儲存格式 (Date vs Timestamp / ISO 8601 UTC)

- **單純的 Date (YYYY-MM-DD)**：最適合做為 `date` 欄位。因為我們是在紀錄「哪一個交易日」的結果，而不是「哪個精確瞬間」。台股和美股的 4/11 在絕對時間基準下是錯開的，統一使用字串格式的交易日能避免跨時區轉換帶來的錯亂。
- **Timestamp (含時區) 與 ISO 8601 UTC 的差異**：
  - Timestamp (PostgreSQL 的 `timestamp with time zone`) 內部儲存的本質等同於原生的絕對毫秒數，而 **ISO 8601 (`2026-04-11T07:00:00Z`)** 是一種國際標準的文字表示法，帶有 `Z` 代表這就是 UTC 時間。
  - 在目前的系統中，我們讓資料庫層面的 `updatedAt` 儲存包含時區資訊的 Timestamp，API 取出時自動被轉化為 ISO 8601 UTC 字串。
- **前端顯示策略**：前端透過 API 取得 `updatedAt` 的 ISO 8601 UTC 字串後，會使用 date-fns 或原生 `Intl.DateTimeFormat`，根據使用者的瀏覽器本機設定，自動轉化並渲染為他們當地的正確時間。

## 狀態轉換 (State Transitions)

### `ScreeningResult.status` 狀態機

1. **初始觸發 (通常為 15:00 台灣時間)**: `status` 設為 `'fetching'`。
2. **休市判斷 / 無新資料**: 若判斷當日該市場休市或資料尚未結算更新，狀態更新為 `'closed'`。
3. **抓取與計算成功**: 將篩選出的股票清單寫入 `assets` JSONB 陣列，狀態更新為 `'completed'`。
4. **抓取失敗 (重試 3 次後)**: 狀態更新為 `'failed'`。
