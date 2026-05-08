import pytest
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from automation.screener import fetch_single_twse, fetch_and_screen_twse, fetch_and_screen_us, get_twse_symbols, is_market_open

def test_is_market_open():
    # 週末休市
    sat = datetime(2026, 4, 11) # Saturday
    assert is_market_open(sat) == False
    
    # 平日開市
    mon = datetime(2026, 4, 13) # Monday
    assert is_market_open(mon) == True

@patch('automation.screener.requests.get')
def test_fetch_single_twse_success(mock_get):
    # Mock FinMind response
    mock_response = MagicMock()
    mock_response.status_code = 200
    
    # 模擬 4 年資料 (至少需要 200 根週線)
    mock_data = []
    base_date = datetime.now() - timedelta(days=1500)
    for i in range(1000): # 1000 個交易日約 4 年
        d = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
        mock_data.append({"date": d, "stock_id": "2330", "open": 800, "max": 820, "min": 790, "close": 810})
        
    mock_response.json.return_value = {
        "msg": "success",
        "data": mock_data
    }
    mock_get.return_value = mock_response
    
    daily_data, weekly_data = fetch_single_twse("2330")
    
    assert daily_data is not None
    assert weekly_data is not None
    assert len(daily_data) == 1000
    assert len(weekly_data) >= 140 # 約 140 週以上

@patch('automation.screener.is_market_open')
def test_fetch_and_screen_twse_holiday(mock_is_open):
    # 測試休市時應直接回傳 holiday，不抓取資料
    mock_is_open.return_value = False
    
    results = fetch_and_screen_twse()
    assert results == "holiday"

@patch('automation.screener.requests.get')
def test_get_twse_symbols(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "msg": "success",
        "data": [
            {"stock_id": "2330", "Trading_Volume": 2000000, "type": "twse"},
            {"stock_id": "2317", "Trading_Volume": 500000, "type": "twse"},
            {"stock_id": "0050", "Trading_Volume": 3000000, "type": "etf"}
        ]
    }
    mock_get.return_value = mock_response
    
    symbols = get_twse_symbols()
    # 應該只回傳 type='twse' 且 Trading_Volume >= 1000000 的 2330
    assert symbols == ["2330"]

def create_passing_daily_data():
    dates = pd.date_range(end=datetime.now(), periods=1500, freq='B')
    df = pd.DataFrame(index=dates, columns=['Open', 'High', 'Low', 'Close', 'Volume'])
    df['Open'] = 80
    df['High'] = 80
    df['Low'] = 80
    df['Close'] = 80
    df['Volume'] = 2000000  # >= 1M
    
    # Global max & min within the last 1000 days (200 weeks)
    df.iloc[-900] = [1000, 1000, 1000, 1000, 2000000]
    df.iloc[-899] = [10, 10, 10, 10, 2000000]
    
    # Day -20: P1
    df.iloc[-20] = [80, 80, 50, 80, 2000000]
    # Day -15: P2
    df.iloc[-15] = [80, 100, 80, 80, 2000000]
    # Day -10: P3
    df.iloc[-10] = [80, 80, 20, 80, 2000000]
    # Day -7: P4
    df.iloc[-7] = [80, 90, 80, 80, 2000000]
    # Day -1 (最新的一天): P5 (擔任週內的最低點，製造出下影線，同時也是 P5)
    df.iloc[-1] = [80, 80, 50, 80, 2000000]
    
    return df

@patch('automation.screener.yf.download')
@patch('automation.screener.pd.read_html')
@patch('automation.screener.is_market_open')
def test_fetch_and_screen_us(mock_is_open, mock_read_html, mock_download):
    mock_is_open.return_value = True
    
    # Mock Wikipedia response
    mock_df = pd.DataFrame({"Symbol": ["AAPL", "MSFT"]})
    mock_read_html.return_value = [mock_df]
    
    # 產生一組會完美通過老余三問的資料 (AAPL) 與一組會被過濾掉的資料 (MSFT)
    passing_data = create_passing_daily_data()
    
    columns = pd.MultiIndex.from_tuples([
        ('Open', 'AAPL'), ('High', 'AAPL'), ('Low', 'AAPL'), ('Close', 'AAPL'), ('Volume', 'AAPL'),
        ('Open', 'MSFT'), ('High', 'MSFT'), ('Low', 'MSFT'), ('Close', 'MSFT'), ('Volume', 'MSFT')
    ])
    
    # 建立 MultiIndex DataFrame
    mock_yf_data = pd.DataFrame(index=passing_data.index, columns=columns)
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        mock_yf_data[(col, 'AAPL')] = passing_data[col]
        # MSFT 成交量故意小於 1M，會在前置過濾就被刷掉
        mock_yf_data[(col, 'MSFT')] = passing_data[col]
        if col == 'Volume':
            mock_yf_data[(col, 'MSFT')] = 500000 
            
    mock_download.return_value = mock_yf_data
    
    results = fetch_and_screen_us()
    
    # 應該只有 AAPL 會通過過濾且通過所有整合邏輯判斷
    assert len(results) == 1
    assert results[0]['symbol'] == 'AAPL'
