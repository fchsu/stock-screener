import os
import requests
import yfinance as yf
import pandas as pd
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_fixed
from supabase import create_client, Client
from dotenv import load_dotenv

from automation.logic import evaluate_trend_reversal_criteria

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
            return symbols, name_map
    except Exception as e:
        print(f"Failed to fetch TWSE dynamic list: {e}")
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
        return "closed"
        
    symbols, name_map = get_twse_symbols()
    if not symbols:
        return "closed"
        
    results = []
    tickers = [f"{s}.TW" for s in symbols]
    
    try:
        data = bulk_download_with_retry(tickers)
        if data.empty:
            return results

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
                    
                weekly_data = convert_to_weekly(df_ticker)
                match_level = evaluate_trend_reversal_criteria(df_ticker, weekly_data)
                if match_level in ('strict', 'momentum'):
                    results.append({
                        "symbol": ticker,
                        "name": name_map.get(symbol, symbol),
                        "market": "TWSE",
                        "tradingViewUrl": f"https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE%3A{symbol}",
                        "matchLevel": match_level
                    })
            except Exception as e:
                print(f"Failed to process TWSE {symbol}: {e}")
    except Exception as e:
        print(f"Failed to bulk fetch TWSE: {e}")
            
    return results

def fetch_and_screen_us():
    if not is_market_open(run_date):
        return "closed"
        
    results = []
    try:
        # Fetch S&P 500 symbols from wikipedia
        url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        html = requests.get(url, headers=headers).text
        from io import StringIO
        tables = pd.read_html(StringIO(html))
        df_sp500 = tables[0]
        tickers = df_sp500['Symbol'].tolist()
        
        # Replace dot with hyphen for yfinance
        tickers = [t.replace('.', '-') for t in tickers]
        
        # 一次性發送 500 個併發請求，直接抓取 4 年歷史資料
        data = bulk_download_with_retry(tickers)
        if data.empty:
            return "closed"
            
        for ticker in tickers:
            try:
                # 從 MultiIndex 取出單一股票的 OHLCV
                if ticker not in data.columns.levels[1]:
                    continue
                df_ticker = data.xs(ticker, level=1, axis=1).dropna(how='all')
                if df_ticker.empty or len(df_ticker) < 60:
                    continue
                    
                close_price = df_ticker['Close'].iloc[-1]
                volume = df_ticker['Volume'].iloc[-1]
                
                # 前置過濾：股價 >= 10 且成交量 >= 1M
                if pd.isna(close_price) or pd.isna(volume):
                    continue
                if close_price < 10 or volume < 1000000:
                    continue
                    
                # 滿足條件則進行老余三問篩選
                weekly_data = convert_to_weekly(df_ticker)
                match_level = evaluate_trend_reversal_criteria(df_ticker, weekly_data)
                if match_level in ('strict', 'momentum'):
                    # yfinance batch download 無法直接取得 shortName，暫以 ticker 代替
                    results.append({
                        "symbol": ticker,
                        "name": ticker,
                        "market": "US",
                        "tradingViewUrl": f"https://tw.tradingview.com/chart/eEagIIPe/?symbol={ticker}",
                        "matchLevel": match_level
                    })
            except Exception as e:
                print(f"Failed to process US {ticker}: {e}")
                
    except Exception as e:
        print(f"Failed to fetch US bulk data: {e}")
            
    return results

def cleanup_old_data():
    # 刪除超過 5 天的舊資料，符合 0 成本目標
    if supabase:
        five_days_ago = (run_date - pd.Timedelta(days=5)).strftime("%Y-%m-%d")
        try:
            supabase.table("screening_results").delete().lt("date", five_days_ago).execute()
            print("Old data cleanup completed.")
        except Exception as e:
            print(f"Failed to cleanup old data: {e}")


def run_automation_flow():
    """
    Main function to run the automation flow and update Supabase.
    """
    today = run_date.strftime("%Y-%m-%d")
    
    # Write status fetching for both markets
    if supabase:
        supabase.table("screening_results").upsert([
            {"date": today, "market": "TWSE", "status": "fetching", "assets": []},
            {"date": today, "market": "NASDAQ", "status": "fetching", "assets": []}
        ], on_conflict="date,market").execute()
        
    try:
        print(f"[{today}] Fetching TWSE data...")
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
            if isinstance(twse_results, list):
                print(f"TWSE: successfully screened {len(twse_results)} stocks: {[r['symbol'] for r in twse_results]}")
            else:
                print(f"TWSE: status is {twse_status}")
            
        print(f"[{today}] Fetching NASDAQ data...")
        us_results = fetch_and_screen_us()
        if supabase:
            us_status = us_results if isinstance(us_results, str) else "completed"
            us_assets = [] if isinstance(us_results, str) else us_results
            supabase.table("screening_results").upsert({
                "date": today,
                "market": "NASDAQ",
                "status": us_status,
                "assets": us_assets
            }, on_conflict="date,market").execute()
            if isinstance(us_results, list):
                print(f"NASDAQ: successfully screened {len(us_results)} stocks: {[r['symbol'] for r in us_results]}")
            else:
                print(f"NASDAQ: status is {us_status}")
            
        # 執行舊資料清理
        cleanup_old_data()
            
    except Exception as e:
        if supabase:
            # We don't know which one failed exactly without catching inside, but we can just set both to failed for simplicity, or we can handle them individually.
            # For this simple script, we'll mark any pending as failed
            supabase.table("screening_results").upsert([
                {"date": today, "market": "TWSE", "status": "failed", "assets": []},
                {"date": today, "market": "NASDAQ", "status": "failed", "assets": []}
            ], on_conflict="date,market").execute()
        raise e

if __name__ == "__main__":
    run_automation_flow()
