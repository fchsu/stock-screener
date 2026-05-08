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
@patch('automation.screener.requests.get')
def test_automation_flow_retry_on_failure(mock_get, mock_supabase):
    """
    Test that the automation flow retries up to 3 times on failure.
    """
    # Setup requests.get to fail twice then succeed
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"msg": "success", "data": []}
    mock_get.side_effect = [Exception("Network error"), Exception("Network error"), mock_response]
    
    # We patch fetch_and_screen_us to just return empty so it doesn't fail
    with patch('automation.screener.fetch_and_screen_us', return_value=[]):
        # We also need to mock get_twse_symbols to return just 1 symbol so it retries on that 1 symbol
        with patch('automation.screener.get_twse_symbols', return_value=['2330']):
            run_automation_flow()
    
    # It should have been called 3 times (2 failures + 1 success) for the single symbol
    assert mock_get.call_count == 3
