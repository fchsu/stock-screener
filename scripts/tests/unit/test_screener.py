import pytest
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from automation.screener import (
    fetch_and_screen_twse,
    fetch_and_screen_us,
    get_twse_symbols,
    get_sp1500_symbols,
    is_market_open,
    check_twse_market_open,
    get_us_target_info,
    check_us_market_open,
    TW_TZ,
)

def test_is_market_open():
    sat = datetime(2026, 4, 11)  # Saturday
    assert is_market_open(sat) == False

    mon = datetime(2026, 4, 13)  # Monday
    assert is_market_open(mon) == True

def test_get_us_target_info():
    # 台灣週六 15:15 -> 美東週五 (平日，美股剛收盤)
    tw_sat = datetime(2026, 10, 3, 15, 15, tzinfo=TW_TZ)
    target_us_date, is_weekend = get_us_target_info(tw_sat)
    assert target_us_date == "2026-10-02"
    assert is_weekend == False

    # 台灣週一 15:15 -> 美東週日 (週末休市，美股週一尚未開盤)
    tw_mon = datetime(2026, 10, 5, 15, 15, tzinfo=TW_TZ)
    target_us_date, is_weekend = get_us_target_info(tw_mon)
    assert target_us_date == "2026-10-04"
    assert is_weekend == True

    # 台灣週日 15:15 -> 美東週六 (週末休市)
    tw_sun = datetime(2026, 10, 4, 15, 15, tzinfo=TW_TZ)
    target_us_date, is_weekend = get_us_target_info(tw_sun)
    assert target_us_date == "2026-10-03"
    assert is_weekend == True

    # 台灣週二 15:15 -> 美東週一 (平日交易日)
    tw_tue = datetime(2026, 10, 6, 15, 15, tzinfo=TW_TZ)
    target_us_date, is_weekend = get_us_target_info(tw_tue)
    assert target_us_date == "2026-10-05"
    assert is_weekend == False

def test_check_twse_market_open_weekend():
    # 週六或週日直接判定為 False，不需打網路探針
    assert check_twse_market_open("2026-10-03") == False
    assert check_twse_market_open("2026-10-04") == False

@patch("automation.screener.yf.download")
def test_check_twse_market_open_weekday_normal(mock_download):
    # 平日正常開市：0050.TW 最新日期等於目標日
    dates = pd.date_range("2026-09-25", "2026-09-30")
    mock_df = pd.DataFrame(index=dates, data={"Close": [100] * len(dates)})
    mock_download.return_value = mock_df

    assert check_twse_market_open("2026-09-30") == True

@patch("automation.screener.yf.download")
def test_check_twse_market_open_typhoon_or_holiday(mock_download):
    # 平日颱風假或國定假日：目標日為 2026-10-01，但 0050.TW 最新 K 線停留在 2026-09-30
    dates = pd.date_range("2026-09-25", "2026-09-30")
    mock_df = pd.DataFrame(index=dates, data={"Close": [100] * len(dates)})
    mock_download.return_value = mock_df

    assert check_twse_market_open("2026-10-01") == False

def test_check_us_market_open_weekend():
    # 前一曆日為六日直接休市
    assert check_us_market_open("2026-10-03", is_weekend=True) == False
    assert check_us_market_open("2026-10-04", is_weekend=True) == False

@patch("automation.screener.yf.download")
def test_check_us_market_open_weekday_normal(mock_download):
    # 美東平日正常開市：SPY 最新日期等於目標日
    dates = pd.date_range("2026-09-25", "2026-09-29")
    mock_df = pd.DataFrame(index=dates, data={"Close": [500] * len(dates)})
    mock_download.return_value = mock_df

    assert check_us_market_open("2026-09-29", is_weekend=False) == True

@patch("automation.screener.yf.download")
def test_check_us_market_open_holiday(mock_download):
    # 美東平日國定假日（如感恩節）：目標日為 2026-11-26，但 SPY 最新 K 線停在 2026-11-25
    dates = pd.date_range("2026-11-20", "2026-11-25")
    mock_df = pd.DataFrame(index=dates, data={"Close": [500] * len(dates)})
    mock_download.return_value = mock_df

    assert check_us_market_open("2026-11-26", is_weekend=False) == False

@patch("automation.screener.check_twse_market_open")
def test_fetch_and_screen_twse_closed(mock_check_twse):
    # 測試休市時應直接回傳 closed，不抓取資料
    mock_check_twse.return_value = False

    results = fetch_and_screen_twse()
    assert results == "closed"

@patch("automation.screener.requests.get")
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
    assert name_map["2330"] == "台積電"
    assert name_map["0050"] == "元大台灣50"

def create_passing_daily_data():
    dates = pd.date_range(end=datetime.now(), periods=1500, freq="B")
    df = pd.DataFrame(index=dates, columns=["Open", "High", "Low", "Close", "Volume"])
    df["Open"] = 80
    df["High"] = 80
    df["Low"] = 80
    df["Close"] = 80
    df["Volume"] = 2000000

    df.iloc[-900] = [1000, 1000, 1000, 1000, 2000000]
    df.iloc[-899] = [10, 10, 10, 10, 2000000]
    df.iloc[-20] = [80, 80, 50, 80, 2000000]
    df.iloc[-15] = [80, 100, 80, 80, 2000000]
    df.iloc[-10] = [80, 80, 20, 80, 2000000]
    df.iloc[-7] = [80, 90, 80, 80, 2000000]
    df.iloc[-1] = [80, 80, 50, 80, 2000000]

    return df

@patch("automation.screener.evaluate_trend_reversal_criteria")
@patch("automation.screener.yf.download")
@patch("automation.screener.pd.read_html")
@patch("automation.screener.check_us_market_open")
@patch("automation.screener.get_us_target_info")
@patch("automation.screener.requests.get")
def test_fetch_and_screen_us(mock_get, mock_get_target_info, mock_check_us, mock_read_html, mock_download, mock_evaluate):
    passing_data = create_passing_daily_data()
    latest_date_str = passing_data.index[-1].strftime("%Y-%m-%d")
    mock_get_target_info.return_value = (latest_date_str, False)
    mock_check_us.return_value = True
    mock_evaluate.return_value = "strict"

    mock_response = MagicMock()
    mock_response.text = "<html>dummy</html>"
    mock_get.return_value = mock_response

    mock_df = pd.DataFrame({"Symbol": ["AAPL", "MSFT"]})
    mock_read_html.return_value = [mock_df]

    columns = pd.MultiIndex.from_tuples([
        ("Open", "AAPL"), ("High", "AAPL"), ("Low", "AAPL"), ("Close", "AAPL"), ("Volume", "AAPL"),
        ("Open", "MSFT"), ("High", "MSFT"), ("Low", "MSFT"), ("Close", "MSFT"), ("Volume", "MSFT"),
    ])

    mock_yf_data = pd.DataFrame(index=passing_data.index, columns=columns)
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        mock_yf_data[(col, "AAPL")] = passing_data[col]
        mock_yf_data[(col, "MSFT")] = passing_data[col]
        if col == "Volume":
            mock_yf_data[(col, "MSFT")] = 500000

    mock_download.return_value = mock_yf_data

    results = fetch_and_screen_us()

    assert len(results) == 1
    assert results[0]["symbol"] == "AAPL"
    assert results[0]["tradingDate"] == latest_date_str

@patch("automation.screener.check_us_market_open")
def test_fetch_and_screen_us_closed(mock_check_us):
    mock_check_us.return_value = False
    assert fetch_and_screen_us() == "closed"

@patch("automation.screener.pd.read_html")
@patch("automation.screener.requests.get")
def test_get_sp1500_symbols_success(mock_get, mock_read_html):
    # 模擬 3 個維基百科頁面回傳不同欄位名 (Symbol, Ticker symbol, Ticker) 與點號代號
    mock_resp = MagicMock()
    mock_resp.text = "<html>table</html>"
    mock_get.return_value = mock_resp

    df1 = pd.DataFrame({"Symbol": ["AAPL", "BRK.B"]})
    df2 = pd.DataFrame({"Ticker symbol": ["MGY", "NNN"]})
    df3 = pd.DataFrame({"Ticker": ["WAFD", "AAPL"]})  # 包含重複 AAPL

    mock_read_html.side_effect = [[df1], [df2], [df3]]

    symbols = get_sp1500_symbols()
    # 應去重、轉換點為連字號 (BRK.B -> BRK-B) 並排序
    assert symbols == ["AAPL", "BRK-B", "MGY", "NNN", "WAFD"]
    assert mock_get.call_count == 3

@patch("automation.screener.requests.get")
def test_get_sp1500_symbols_all_fail(mock_get):
    mock_get.side_effect = Exception("Wikipedia timeout")
    symbols = get_sp1500_symbols()
    assert symbols == []

