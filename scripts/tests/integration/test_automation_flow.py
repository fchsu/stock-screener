import pytest
from unittest.mock import patch, MagicMock

# Assuming the main function will be in automation.screener
from automation.screener import run_automation_flow

@patch('automation.screener.supabase')
@patch('automation.screener.fetch_and_screen_us')
@patch('automation.screener.fetch_and_screen_twse')
def test_automation_flow_success(mock_fetch_twse, mock_fetch_us, mock_supabase):
    """
    Test that the automation flow successfully calls fetch functions
    and writes the results and status to Supabase.
    """
    # Setup mock returns
    mock_fetch_twse.return_value = [{"symbol": "2330.TW", "name": "台積電", "market": "TWSE"}]
    mock_fetch_us.return_value = [{"symbol": "NVDA", "name": "NVIDIA", "market": "NASDAQ"}]
    
    # Run the flow
    run_automation_flow()
    
    # Check that both fetch functions were called
    mock_fetch_twse.assert_called_once()
    mock_fetch_us.assert_called_once()
    
    # Should interact with Supabase to insert results
    assert mock_supabase.table.called

@patch('automation.screener.supabase')
@patch('automation.screener.is_market_open', return_value=True)
@patch('automation.screener.yf.download')
def test_automation_flow_retry_on_failure(mock_download, mock_is_open, mock_supabase):
    """
    Test that the automation flow retries up to 3 times on failure.
    fetch_single_twse 使用 yfinance，tenacity 會在失敗時重試。
    """
    import pandas as pd

    # yf.download 前兩次失敗，第三次回傳空 DataFrame（模擬無資料）
    mock_download.side_effect = [
        Exception("Network error"),
        Exception("Network error"),
        pd.DataFrame()  # 空 DataFrame，不會觸發篩選邏輯
    ]

    with patch('automation.screener.fetch_and_screen_us', return_value=[]):
        with patch('automation.screener.get_twse_symbols', return_value=(['2330'], {'2330': '台積電'})):
            run_automation_flow()

    # fetch_single_twse 內部 tenacity 會重試，yf.download 應被呼叫 3 次
    assert mock_download.call_count == 3
