import pandas as pd
import pytest
from automation.logic import evaluate_trend_reversal_criteria

def create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6):
    """建立模擬週線資料"""
    data = []
    for i in range(199):
        data.append({'Open': 100, 'High': 105, 'Low': 95, 'Close': 100})
        
    # B 點 (Swing Low)
    data[-15] = {'Open': b_price+2, 'High': b_price+5, 'Low': b_price, 'Close': b_price+3}
    data[-16]['Low'] = b_price + 10
    data[-14]['Low'] = b_price + 10
    
    # A 點 (Swing Low)
    data[-7] = {'Open': a_price+2, 'High': a_price+5, 'Low': a_price, 'Close': a_price+3}
    data[-8]['Low'] = a_price + 10
    data[-6]['Low'] = a_price + 10

    body_bottom = last_close
    open_p = last_close + 2
    
    if shadow_ratio > 0 and body_bottom > last_low:
        high = last_low + (body_bottom - last_low) / shadow_ratio
    else:
        high = open_p + 5
        
    data.append({'Open': open_p, 'High': high, 'Low': last_low, 'Close': last_close})
    return pd.DataFrame(data)

def create_mock_daily_data_pattern(p1, p2, p3, p4, p5, missing_p4=False):
    """建立模擬日線資料包含特定的 P1-P5 轉折"""
    data = []
    for i in range(60):
        data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    
    # P1 (Low)
    data.append({'Open': p1+2, 'High': p1+5, 'Low': p1, 'Close': p1+3})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P2 (High)
    data.append({'Open': p2-2, 'High': p2, 'Low': p2-5, 'Close': p2-1})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P3 (Low)
    data.append({'Open': p3+2, 'High': p3+5, 'Low': p3, 'Close': p3+3})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    
    if not missing_p4:
        # P4 (High)
        data.append({'Open': p4-2, 'High': p4, 'Low': p4-5, 'Close': p4-1})
        for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
        
    # P5 (Low - 最新)
    data.append({'Open': p5+2, 'High': p5+5, 'Low': p5, 'Close': p5+3})
    return pd.DataFrame(data)

def test_evaluate_trend_reversal_criteria_pass():
    # A=50, B=51. Max=51. (51-50)/51 = 0.019 < 0.05. Key Boundary Min = 50.
    # Last Low = 48 < 50. Last Close = 52 >= 50. Shadow > 0.5.
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    
    # 圖：P1=100, P2=120, P3=80, P4=110, P5=100
    # P2-P3 = 40. P4-P5 = 10. 40*0.25=10 <= 10 <= 30. (Pass)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'strict'

def test_evaluate_trend_reversal_criteria_fail_position_boundary_gap():
    # A=50, B=55. Max=55. (55-50)/55 = 0.09 > 0.05. (Fail)
    weekly_data = create_mock_weekly_data(a_price=50, b_price=55, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'

def test_evaluate_trend_reversal_criteria_fail_momentum_not_break_down():
    # Last Low = 51 (>= Boundary Min 50). 沒有跌破關鍵邊界 (Fail)
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=51, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'

def test_evaluate_trend_reversal_criteria_fail_momentum_close_too_low():
    # Last Close = 49 (< Boundary Min 50). 實體收在邊界下方 (Fail)
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=49, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'

def test_evaluate_trend_reversal_criteria_fail_pattern_missing_p4():
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100, missing_p4=True)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_fail_pattern_p4_p5_out_of_range():
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    # P4-P5 = 110 - 105 = 5. P2-P3 = 40. 40 * 0.25 = 10. 5 < 10. (Fail)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=105)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'
