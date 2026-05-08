import pandas as pd
import pytest
from automation.logic import evaluate_trend_reversal_criteria

def create_mock_weekly_data(current_price, min_price=50, max_price=150, shadow_ratio=0.6):
    """建立模擬週線資料"""
    # 建立 200 根 K 棒
    data = []
    for i in range(199):
        # 建立普通的 K 棒
        data.append({'Open': 100, 'High': 105, 'Low': 95, 'Close': 100})
    
    # 修改第一根與第二根以設定全局高低點
    data[0] = {'Open': max_price, 'High': max_price, 'Low': max_price-5, 'Close': max_price-2}
    data[1] = {'Open': min_price, 'High': min_price+5, 'Low': min_price, 'Close': min_price+2}
    
    # 建立最後一根包含特定下影線的 K 棒
    close_p = current_price
    open_p = current_price + 2  # 收黑
    body_bottom = close_p
    
    # 依據 shadow_ratio 推算 low：
    low = body_bottom - 20 * shadow_ratio
    high = low + 20
    
    data.append({'Open': open_p, 'High': high, 'Low': low, 'Close': close_p})
    
    return pd.DataFrame(data)

def create_mock_daily_data_pattern(p1, p2, p3, p4, p5):
    """建立模擬日線資料包含特定的 P1-P5 轉折"""
    data = []
    # 隨機塞入 60 根 K 棒，確保這些 K 棒不要干擾 P1~P5 (設一個較高的基期)
    for i in range(60):
        data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    
    # 依序塞入 P1, P2, P3, P4, P5，並在中間插入墊檔 K 棒確保它們是局部極值 (window=3 所以至少 3 根)
    # P1 (Low)
    data.append({'Open': p1+2, 'High': p1+5, 'Low': p1, 'Close': p1+3})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105}) # filler
    # P2 (High)
    data.append({'Open': p2-2, 'High': p2, 'Low': p2-5, 'Close': p2-1})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105}) # filler
    # P3 (Low)
    data.append({'Open': p3+2, 'High': p3+5, 'Low': p3, 'Close': p3+3})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105}) # filler
    # P4 (High)
    data.append({'Open': p4-2, 'High': p4, 'Low': p4-5, 'Close': p4-1})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105}) # filler
    # P5 (Low - 最新)
    data.append({'Open': p5+2, 'High': p5+5, 'Low': p5, 'Close': p5+3})
    
    return pd.DataFrame(data)

def test_evaluate_trend_reversal_criteria_pass():
    # 完美條件
    # 位置：Min=10, Max=500, Range=490. 10% bottom is 10~59. Current=55 (Pass)
    # 慣性：Shadow=0.6 (>0.5 Pass)
    weekly_data = create_mock_weekly_data(current_price=55, min_price=10, max_price=500, shadow_ratio=0.6)
    
    # 圖：P1=100, P2=120, P3=80. P2-P3 = 40.
    # P5-P3 應該在 40*0.25=10 到 40*0.75=30 之間。P5 應該在 90 到 110 之間。
    # 且 P5 與 P1 誤差要在 3% 內 (P1=100, P5 可為 97~103)
    # 取 P5=100 (Pass 兩者)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == True

def test_evaluate_trend_reversal_criteria_fail_position():
    # 位置失敗：Current=65 (Min=10, Max=500, Range=490. 10% is 59. 65 > 59)
    weekly_data = create_mock_weekly_data(current_price=65, min_price=10, max_price=500, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == False

def test_evaluate_trend_reversal_criteria_fail_momentum():
    # 慣性失敗：Shadow=0.3 (小於 0.5)
    weekly_data = create_mock_weekly_data(current_price=55, min_price=10, max_price=500, shadow_ratio=0.3)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == False

def test_evaluate_trend_reversal_criteria_fail_pattern_p5_diff():
    # P5 與 P1 誤差超過 3% (P1=100, P5=105 -> 5% 誤差)
    weekly_data = create_mock_weekly_data(current_price=55, min_price=10, max_price=500)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=105)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == False

def test_evaluate_trend_reversal_criteria_fail_pattern_p5_retrace_too_deep():
    # P5 跌太深 (P5-P3 < 25%)
    # P2-P3=40. 25% = 10. P5 必須 >= 90.
    # 若 P1=88, P5=88. P5-P3 = 8 < 10. 
    weekly_data = create_mock_weekly_data(current_price=55, min_price=10, max_price=500)
    daily_data = create_mock_daily_data_pattern(p1=88, p2=120, p3=80, p4=110, p5=88)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == False

def test_evaluate_trend_reversal_criteria_fail_pattern_p5_retrace_too_shallow():
    # P5 跌不夠 (P5-P3 > 75%)
    # P2-P3=40. 75% = 30. P5 必須 <= 110.
    # 若 P1=115, P5=115. P5-P3 = 35 > 30.
    weekly_data = create_mock_weekly_data(current_price=55, min_price=10, max_price=500)
    daily_data = create_mock_daily_data_pattern(p1=115, p2=120, p3=80, p4=125, p5=115)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == False
