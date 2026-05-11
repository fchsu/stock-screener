import pytest
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from automation.screener import fetch_and_screen_twse, fetch_and_screen_us, get_twse_symbols, is_market_open

def test_is_market_open():
    # 週末休市
    sat = datetime(2026, 4, 11) # Saturday
    assert is_market_open(sat) == False
    
    # 平日開市
    mon = datetime(2026, 4, 13) # Monday
    assert is_market_open(mon) == True

@patch('automation.screener.is_market_open')
def test_fetch_and_screen_twse_closed(mock_is_open):
    # 測試休市時應直接回傳 closed，不抓取資料
    mock_is_open.return_value = False
    
    results = fetch_and_screen_twse()
    assert results == "closed"

@patch('automation.screener.requests.get')
def test_get_twse_symbols(mock_get):
    # TWSE OpenAPI STOCK_DAY_ALL 格式
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {"Code": "2330", "Name": "台積電", "TradeVolume": "50000000", "ClosingPrice": "800"},
        {"Code": "2317", "Name": "鴻海", "TradeVolume": "500000", "ClosingPrice": "150"},
        {"Code": "0050", "Name": "元大台灣50", "TradeVolume": "3000000", "ClosingPrice": "180"},
    ]
    mock_get.return_value = mock_response

    symbols, name_map = get_twse_symbols()
    # 成交量 >= 1,000,000 股：2330 (50M) 和 0050 (3M) 通過，2317 (500K) 被過濾
    assert "2330" in symbols
    assert "0050" in symbols
    assert "2317" not in symbols
    # name_map 應包含通過過濾的股票名稱
    assert name_map["2330"] == "台積電"
    assert name_map["0050"] == "元大台灣50"

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

@patch('automation.screener.evaluate_trend_reversal_criteria')
@patch('automation.screener.yf.download')
@patch('automation.screener.pd.read_html')
@patch('automation.screener.is_market_open')
@patch('automation.screener.requests.get')
def test_fetch_and_screen_us(mock_get, mock_is_open, mock_read_html, mock_download, mock_evaluate):
    mock_is_open.return_value = True
    # Default evaluate to False, but True for AAPL
    def side_effect(daily, weekly):
        # The mock setup defines AAPL in index/columns. We can just return True.
        # But wait, there are multiple symbols passed inside fetch_and_screen_us loop!
        # Let's just return True for everything, and let the assertions fail? No.
        # MSFT is filtered out BEFORE evaluate is called because volume < 1,000,000.
        # So evaluate is ONLY called for AAPL.
        return 'strict'
    mock_evaluate.side_effect = side_effect
    
    # Mock requests.get to prevent real network call
    mock_response = MagicMock()
    mock_response.text = "<html>dummy</html>"
    mock_get.return_value = mock_response
    
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
