# 快速啟動指南：001-daily-screener

## 事前準備

- Node.js & pnpm
- Python 3.11 以上版本
- Supabase 帳號與專案
- Vercel CLI (本機開發時為選擇性安裝項目)

## Supabase 環境設定

1. 在 Supabase 中建立一個新專案。
2. 進入 SQL Editor，執行 `contracts/supabase-schema.sql` 中的 Schema 指令。
3. 取得並保留好您的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`，以及後端專用的 `SUPABASE_SERVICE_ROLE_KEY`。

## 前端環境設定

1. 安裝所有依賴套件：
   ```bash
   pnpm install
   ```
2. 建立 `.env.local` 檔案並填寫環境變數：
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=你的URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的匿名金鑰
   ```
3. 啟動本機開發伺服器：
   ```bash
   pnpm dev
   ```

## 後端腳本與自動化排程設定 (Python)

1. 初始化 Python 虛擬環境：
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
2. 安裝必要的依賴套件：
   ```bash
   pip install yfinance pandas supabase requests
   ```
3. 為腳本設定環境變數：
   ```bash
   export SUPABASE_URL=你的URL
   export SUPABASE_SERVICE_KEY=你的服務特權金鑰
   ```
4. 在本機執行測試爬蟲腳本：
   ```bash
   python scripts/screener.py
   ```
