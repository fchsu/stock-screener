import os
import requests
import yfinance as yf
import pandas as pd
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_fixed
from supabase import create_client, Client
from dotenv import load_dotenv

from automation.logic import evaluate_trend_reversal_criteria

import tempfile
import yfinance.cache as yf_cache

# 避免多執行緒下載時 SQLite 鎖定 (database is locked) 同時避免傳入 None 導致 os.stat TypeError
cache_dir = os.path.join(tempfile.gettempdir(), 'py-yfinance')
os.makedirs(cache_dir, exist_ok=True)
yf.set_tz_cache_location(cache_dir)
yf_cache._TzCacheManager._tz_cache = yf_cache._TzCacheDummy()

load_dotenv()

# 允許透過環境變數指定執行日期（用於假日測試或歷史回測）
target_date_env = os.environ.get("TARGET_DATE")
if target_date_env:
    run_date = datetime.strptime(target_date_env, "%Y-%m-%d")
else:
    run_date = datetime.now()

# We expect NEXT_PUBLIC_SUPABASE_URL to be available
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")

# 寫入操作需要越過 RLS，因此優先使用 SERVICE_ROLE_KEY，如果沒有再退回 ANON_KEY (可能會被 RLS 擋下)
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def get_twse_symbols():
    """從 TWSE OpenAPI 取得當日全市場行情，過濾成交量 >= 1,000,000 股的標的。
    回傳 (symbols, name_map)，name_map 為 {代號: 中文名稱} 的映射。
    """
    url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
    print(f"[TWSE Step 1/4] Querying TWSE OpenAPI ({url})...", flush=True)
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data:
            df = pd.DataFrame(data)
            # TradeVolume 是字串格式，需轉數值
            df['TradeVolume'] = pd.to_numeric(df['TradeVolume'].str.replace(',', ''), errors='coerce')
            filtered = df[df['TradeVolume'] >= 1000000]
            filtered = filtered.sort_values(by='TradeVolume', ascending=False)

            symbols = filtered['Code'].tolist()
            name_map = dict(zip(filtered['Code'], filtered['Name']))
            print(f"[TWSE Step 1/4] Total stocks returned: {len(data)}, passed volume filter (>= 1,000,000): {len(symbols)}", flush=True)
            return symbols, name_map
    except Exception as e:
        print(f"[TWSE ERROR] Failed to fetch TWSE dynamic list: {e}", flush=True)
    return [], {}

# US symbols are fetched directly inside fetch_and_screen_us to optimize bulk download

def is_market_open(dt: datetime) -> bool:
    # 週末休市判斷 (0=週一, 5=週六, 6=週日)
    if dt.weekday() >= 5:
        return False
    return True

def convert_to_weekly(df: pd.DataFrame) -> pd.DataFrame:
    # 確保 index 是 datetime
    if not isinstance(df.index, pd.DatetimeIndex):
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
        elif 'Date' in df.columns:
            df['Date'] = pd.to_datetime(df['Date'])
            df.set_index('Date', inplace=True)
            
    # 重採樣為每週五
    df_weekly = df.resample('W-FRI').agg({
        'Open': 'first',
        'High': 'max',
        'Low': 'min',
        'Close': 'last'
    }).dropna()
    return df_weekly

@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def bulk_download_with_retry(tickers):
    """用 yfinance 批次下載股票歷史資料，包含自動重試與進度隱藏。"""
    return yf.download(tickers, period="4y", progress=False, threads=True)

def fetch_and_screen_twse():
    if not is_market_open(run_date):
        print(f"[TWSE] Market is closed on {run_date.strftime('%Y-%m-%d')} (Weekend).", flush=True)
        return "closed"
        
    symbols, name_map = get_twse_symbols()
    if not symbols:
        print(f"[TWSE] No symbols retrieved from OpenAPI. Market closed or data unavailable.", flush=True)
        return "closed"
        
    results = []
    tickers = [f"{s}.TW" for s in symbols]
    print(f"[TWSE Step 2/4] Downloading 4-year history for {len(tickers)} tickers via yfinance...", flush=True)
    
    try:
        data = bulk_download_with_retry(tickers)
        if data.empty:
            print("[TWSE ERROR] yfinance bulk download returned empty dataset!", flush=True)
            return results

        latest_market_date = data.index[-1].strftime("%Y-%m-%d") if not data.empty else ""
        print(f"[TWSE Step 2/4] Note: Latest market trading date available in data is {latest_market_date}.", flush=True)
        print(f"[TWSE Step 3/4] Screening stocks against 'Old Yu's Three Questions' criteria...", flush=True)
        stats = {"total": len(symbols), "valid_history": 0, "momentum": 0, "strict": 0}
        for symbol in symbols:
            ticker = f"{symbol}.TW"
            try:
                if len(tickers) == 1:
                    df_ticker = data.copy()
                else:
                    if ticker not in data.columns.levels[1]:
                        continue
                    df_ticker = data.xs(ticker, level=1, axis=1).dropna(how='all')

                if df_ticker.empty or len(df_ticker) < 60:
                    continue
                
                stats["valid_history"] += 1
                weekly_data = convert_to_weekly(df_ticker)
                match_level = evaluate_trend_reversal_criteria(df_ticker, weekly_data)
                if match_level in ('strict', 'momentum'):
                    if match_level == 'strict':
                        stats["strict"] += 1
                    else:
                        stats["momentum"] += 1
                    stock_name = name_map.get(symbol, symbol)
                    print(f"  🎯 [TWSE Match] {ticker} ({stock_name}) -> matchLevel: {match_level}", flush=True)
                    results.append({
                        "symbol": ticker,
                        "name": stock_name,
                        "market": "TWSE",
                        "tradingViewUrl": f"https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE%3A{symbol}",
                        "matchLevel": match_level,
                        "tradingDate": latest_market_date
                    })
            except Exception as e:
                print(f"[TWSE Warning] Failed to process {symbol}: {e}", flush=True)
        
        print(f"[TWSE Summary] Analyzed={stats['total']}, ValidHistory={stats['valid_history']}, Momentum={stats['momentum']}, Strict={stats['strict']}", flush=True)
    except Exception as e:
        print(f"[TWSE ERROR] Bulk fetch error: {e}", flush=True)
            
    return results

def fetch_and_screen_us():
    if not is_market_open(run_date):
        print(f"[US] Market is closed on {run_date.strftime('%Y-%m-%d')} (Weekend).", flush=True)
        return "closed"
        
    results = []
    try:
        # Fetch S&P 500 symbols from wikipedia
        print(f"[US Step 1/4] Fetching S&P 500 constituent list from Wikipedia...", flush=True)
        url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        html = requests.get(url, headers=headers, timeout=15).text
        from io import StringIO
        tables = pd.read_html(StringIO(html))
        df_sp500 = tables[0]
        tickers = df_sp500['Symbol'].tolist()
        
        # Replace dot with hyphen for yfinance
        tickers = [t.replace('.', '-') for t in tickers]
        print(f"[US Step 1/4] Retrieved {len(tickers)} S&P 500 constituent tickers.", flush=True)
        
        # 一次性發送併發請求，直接抓取 4 年歷史資料
        print(f"[US Step 2/4] Downloading 4-year history for {len(tickers)} tickers via yfinance...", flush=True)
        data = bulk_download_with_retry(tickers)
        if data.empty:
            print("[US ERROR] yfinance bulk download returned empty dataset!", flush=True)
            return results
            
        latest_market_date = data.index[-1].strftime("%Y-%m-%d") if not data.empty else ""
        print(f"[US Step 2/4] Note: Latest market trading date available in data is {latest_market_date}.", flush=True)
        print(f"[US Step 2/4] Successfully downloaded historical matrix: shape={data.shape}", flush=True)
        print(f"[US Step 3/4] Screening stocks against 'Old Yu's Three Questions' criteria...", flush=True)
        stats = {"total": len(tickers), "valid_history": 0, "pre_filter": 0, "momentum": 0, "strict": 0}
        for ticker in tickers:
            try:
                # 從 MultiIndex 取出單一股票的 OHLCV
                if ticker not in data.columns.levels[1]:
                    continue
                df_ticker = data.xs(ticker, level=1, axis=1).dropna(how='all')
                if df_ticker.empty or len(df_ticker) < 60:
                    continue
                
                stats["valid_history"] += 1
                close_price = df_ticker['Close'].iloc[-1]
                volume = df_ticker['Volume'].iloc[-1]
                
                # 前置過濾：股價 >= 10 且成交量 >= 1M
                if pd.isna(close_price) or pd.isna(volume):
                    continue
                if close_price < 10 or volume < 1000000:
                    continue
                    
                stats["pre_filter"] += 1
                # 滿足條件則進行老余三問篩選
                weekly_data = convert_to_weekly(df_ticker)
                match_level = evaluate_trend_reversal_criteria(df_ticker, weekly_data)
                
                if match_level in ('strict', 'momentum'):
                    if match_level == 'strict': stats["strict"] += 1
                    else: stats["momentum"] += 1
                    
                    # 取得實際交易所資訊以符合 TradingView 分類
                    ticker_obj = yf.Ticker(ticker)
                    try:
                        info = ticker_obj.info
                        if info is None: info = {}
                    except Exception:
                        info = {}
                        
                    exchange = info.get('exchange', 'US')
                    # 將 yfinance 的交易所名稱對應到 TradingView 格式
                    tv_exchange = exchange
                    if exchange == 'NMS': tv_exchange = 'NASDAQ'
                    elif exchange == 'NYQ': tv_exchange = 'NYSE'
                    
                    short_name = info.get('shortName', ticker)
                    print(f"  🎯 [US Match] {ticker} ({short_name}, {tv_exchange}) -> matchLevel: {match_level}", flush=True)
                    results.append({
                        "symbol": ticker,
                        "name": short_name,
                        "market": tv_exchange,
                        "tradingViewUrl": f"https://tw.tradingview.com/chart/eEagIIPe/?symbol={tv_exchange}:{ticker.replace('-', '.')}",
                        "matchLevel": match_level,
                        "tradingDate": latest_market_date
                    })
            except Exception as e:
                print(f"[US Warning] Failed to process {ticker}: {e}", flush=True)
        
        print(f"[US Screening Summary] Total={stats['total']}, ValidHistory={stats['valid_history']}, Passed Pre-filter={stats['pre_filter']}, Momentum={stats['momentum']}, Strict={stats['strict']}", flush=True)
            
    except Exception as e:
        print(f"[US ERROR] Failed to fetch US bulk data: {e}", flush=True)
            
    return results

def cleanup_old_data():
    # 刪除超過 5 天的舊資料，符合 0 成本目標
    if supabase:
        five_days_ago = (run_date - pd.Timedelta(days=5)).strftime("%Y-%m-%d")
        try:
            print(f"[Cleanup] Purging records older than {five_days_ago}...", flush=True)
            supabase.table("screening_results").delete().lt("date", five_days_ago).execute()
            print("[Cleanup] Old data cleanup completed successfully.", flush=True)
        except Exception as e:
            print(f"[Cleanup Warning] Failed to cleanup old data: {e}", flush=True)


def run_automation_flow():
    """
    Main function to run the automation flow and update Supabase.
    """
    today = run_date.strftime("%Y-%m-%d")
    print(f"==================================================", flush=True)
    print(f"🚀 Running Daily Screener for Target Date: {today}", flush=True)
    print(f"==================================================", flush=True)
    
    # Write status fetching for both markets
    if supabase:
        print("[Supabase] Setting initial status to 'fetching' for TWSE & S&P 500...", flush=True)
        supabase.table("screening_results").upsert([
            {"date": today, "market": "TWSE", "status": "fetching", "assets": []},
            {"date": today, "market": "S&P 500", "status": "fetching", "assets": []}
        ], on_conflict="date,market").execute()
        
    try:
        print(f"\n--- [1/2] Processing TWSE Market ---", flush=True)
        twse_results = fetch_and_screen_twse()
        if supabase:
            twse_status = twse_results if isinstance(twse_results, str) else "completed"
            twse_assets = [] if isinstance(twse_results, str) else twse_results
            supabase.table("screening_results").upsert({
                "date": today,
                "market": "TWSE",
                "status": twse_status,
                "assets": twse_assets
            }, on_conflict="date,market").execute()
            print(f"[Supabase] TWSE status updated to '{twse_status}' (matches: {len(twse_assets)})", flush=True)
            
        print(f"\n--- [2/2] Processing S&P 500 Market ---", flush=True)
        us_results = fetch_and_screen_us()
        if supabase:
            us_status = us_results if isinstance(us_results, str) else "completed"
            us_assets = [] if isinstance(us_results, str) else us_results
            supabase.table("screening_results").upsert({
                "date": today,
                "market": "S&P 500",
                "status": us_status,
                "assets": us_assets
            }, on_conflict="date,market").execute()
            print(f"[Supabase] S&P 500 status updated to '{us_status}' (matches: {len(us_assets)})", flush=True)
            
        # 執行舊資料清理
        print(f"\n--- Maintenance ---", flush=True)
        cleanup_old_data()
        print(f"✅ Daily Screener workflow completed successfully.", flush=True)
            
    except Exception as e:
        if supabase:
            supabase.table("screening_results").upsert([
                {"date": today, "market": "TWSE", "status": "failed", "assets": []},
                {"date": today, "market": "S&P 500", "status": "failed", "assets": []}
            ], on_conflict="date,market").execute()
        print(f"❌ [CRITICAL ERROR] Daily Screener failed: {e}", flush=True)
        raise e

if __name__ == "__main__":
    run_automation_flow()
