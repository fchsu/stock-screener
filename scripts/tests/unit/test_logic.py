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

@pytest.mark.parametrize('p4', [106, 135])
def test_evaluate_trend_reversal_criteria_pass_regardless_of_p4_p5_ratio(p4):
    # 已拿掉 (P4-P5)/(P2-P3) 介於 0.25~0.75 的限制：
    # 106 -> 比例 0.15（反彈很小）；135 -> 比例 0.875（P4 突破 P2，型態更強）
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=p4, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'strict'

def test_evaluate_trend_reversal_criteria_fail_if_p3_barely_breaks_p1():
    # BFAM 09/30 的情境：P3 只比 P1 低一點點，比較像雙底，不算破底翻
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=99.5, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_fail_if_p3_barely_breaks_p5():
    # P3 明顯低於 P1，但右腳 P5 回落到幾乎貼著 P3，破底後沒有真正翻上來
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=99, p2=120, p3=97, p4=108, p5=97.5)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_fail_if_p5_clearly_below_p1():
    # FOX 10/14 的情境：P5 比 P1 低 2.9%（在 3% 內），但高低點一路往下是下降階梯
    # mock 的 ATR 約 6.6，P1-P5=2.9 > 0.25 ATR
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=97.1)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_pass_if_p5_slightly_below_p1():
    # P5 只比 P1 低 1（< 0.25 ATR），算右腳站回左腳附近
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=99)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'strict'

def test_evaluate_trend_reversal_criteria_pass_on_previous_week_completed_bar():
    # 週一或週二當週 K 棒未成形時，允許回看上週 (iloc[-2]) 符合條件，且當週 (iloc[-1]) 未跌破
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    incomplete_week = pd.DataFrame([{'Open': 55, 'High': 56, 'Low': 55, 'Close': 55}])
    weekly_data_extended = pd.concat([weekly_data, incomplete_week], ignore_index=True)

    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    # 2026-11-03 為週二 (weekday=1)，應回看上週 iloc[-2] 並通過
    daily_data.index = pd.date_range(end="2026-11-03", periods=len(daily_data), freq="B")
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data_extended) == 'strict'

def test_evaluate_trend_reversal_criteria_fail_on_previous_week_when_late_week():
    # 週三至週五（如 11/06 週五，00753L / 00752 案例）當週 K 棒已成形但無長下影線，不可再回看上週 iloc[-2]
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    completed_current_week = pd.DataFrame([{'Open': 55, 'High': 56, 'Low': 55, 'Close': 55}])
    weekly_data_extended = pd.concat([weekly_data, completed_current_week], ignore_index=True)

    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    # 2026-11-06 為週五 (weekday=4)，不回看 iloc[-2]，應回傳 none
    daily_data.index = pd.date_range(end="2026-11-06", periods=len(daily_data), freq="B")
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data_extended) == 'none'

def test_evaluate_trend_reversal_criteria_fail_if_current_week_body_broken():
    # 上週 (iloc[-2]) 假跌破，但當週 (iloc[-1]) 實體收在 48，已真正跌破關鍵邊界 50
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    broken_week = pd.DataFrame([{'Open': 49, 'High': 49.5, 'Low': 47, 'Close': 48}])
    weekly_data_broken = pd.concat([weekly_data, broken_week], ignore_index=True)

    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data_broken) == 'none'

def test_evaluate_trend_reversal_criteria_fail_if_p5_lower_than_p3():
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    # P3=80, P5=78 (右腳跌破 P3，不可判定為 strict 破底翻)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=78)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_pass_non_adjacent_swing_lows():
    # 測試非相鄰 Swing Lows 配對：中間夾了一個次級低點 (B=65)，但歷史大底 (C=50) 與近期回測 (A=51) 差距 < 5%
    data = []
    for _ in range(199):
        data.append({'Open': 100, 'High': 105, 'Low': 95, 'Close': 100})

    # C 點 (歷史大底: price 50)
    data[-25] = {'Open': 52, 'High': 55, 'Low': 50, 'Close': 53}
    data[-26]['Low'] = 65
    data[-24]['Low'] = 65

    # B 點 (次級低點: price 65，與 50 落差達 23%)
    data[-15] = {'Open': 67, 'High': 70, 'Low': 65, 'Close': 68}
    data[-16]['Low'] = 75
    data[-14]['Low'] = 75

    # A 點 (近期回測低點: price 51)
    data[-7] = {'Open': 53, 'High': 56, 'Low': 51, 'Close': 54}
    data[-8]['Low'] = 65
    data[-6]['Low'] = 65

    # 當週 K 棒 (假跌破 50，收長下影線)
    # Low=48, Body bottom=52, High=55 -> Shadow=4, Range=7 (4/7 > 0.5)
    data.append({'Open': 54, 'High': 55, 'Low': 48, 'Close': 52})
    weekly_data = pd.DataFrame(data)

    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'strict'

def test_evaluate_trend_reversal_criteria_fail_if_intermediate_swing_low_between_p4_and_p5():
    # 測試 P4 與 P5 之間夾帶其他波段低點 (結構破裂，如 1307 案例)
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    
    # 建立標準 P1~P4，但在 P4 與 P5 之間插入一個 Swing Low
    data = []
    for _ in range(60):
        data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P1
    data.append({'Open': 102, 'High': 105, 'Low': 100, 'Close': 103})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P2
    data.append({'Open': 118, 'High': 120, 'Low': 115, 'Close': 119})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P3
    data.append({'Open': 82, 'High': 85, 'Low': 80, 'Close': 83})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P4
    data.append({'Open': 108, 'High': 110, 'Low': 105, 'Close': 109})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # 中間干擾波段 (產生多餘的 Swing Low)
    data.append({'Open': 88, 'High': 92, 'Low': 85, 'Close': 89})
    data.append({'Open': 105, 'High': 105, 'Low': 95, 'Close': 105})
    data.append({'Open': 105, 'High': 105, 'Low': 95, 'Close': 105})
    data.append({'Open': 105, 'High': 105, 'Low': 95, 'Close': 105})
    # P5
    data.append({'Open': 102, 'High': 105, 'Low': 100, 'Close': 103})
    daily_data = pd.DataFrame(data)

    # 應降級為 momentum
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_fail_if_p1_p5_span_exceeds_35_bars():
    # 測試 P1 ~ P5 總天數跨度過長 (> 35 根 K 棒)
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    data = []
    for _ in range(30):
        data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P1
    data.append({'Open': 102, 'High': 105, 'Low': 100, 'Close': 103})
    # 中間拉長 40 根 K 棒
    for _ in range(40):
        data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P2
    data.append({'Open': 118, 'High': 120, 'Low': 115, 'Close': 119})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P3
    data.append({'Open': 82, 'High': 85, 'Low': 80, 'Close': 83})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P4
    data.append({'Open': 108, 'High': 110, 'Low': 105, 'Close': 109})
    for _ in range(3): data.append({'Open': 105, 'High': 105, 'Low': 105, 'Close': 105})
    # P5 (距 P1 已達 > 50 根)
    data.append({'Open': 102, 'High': 105, 'Low': 100, 'Close': 103})
    daily_data = pd.DataFrame(data)

    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'momentum'

def test_evaluate_trend_reversal_criteria_fail_if_boundaries_are_purely_ancient():
    # 測試週線雙點都在 60 週以前 (缺乏近時性，不構成當前有效邊界)
    data = []
    for _ in range(200):
        data.append({'Open': 100, 'High': 105, 'Low': 95, 'Close': 100})
    # 兩個低點都放在 70 週以前
    data[-80] = {'Open': 52, 'High': 55, 'Low': 50, 'Close': 53}
    data[-81]['Low'] = 65
    data[-79]['Low'] = 65
    data[-70] = {'Open': 53, 'High': 56, 'Low': 51, 'Close': 54}
    data[-71]['Low'] = 65
    data[-69]['Low'] = 65
    
    # 之後放入更多非邊界的 swing lows 使得這兩點不再屬於最近 5 個 swing lows
    for offset in [-50, -40, -30, -20, -10]:
        data[offset]['Low'] = 80
        data[offset-1]['Low'] = 90
        data[offset+1]['Low'] = 90

    # 當前週
    data.append({'Open': 54, 'High': 55, 'Low': 48, 'Close': 52})
    weekly_data = pd.DataFrame(data)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)

    # 由於遠古低點被過濾，無有效邊界，應回傳 none
    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'

def test_evaluate_trend_reversal_criteria_fail_if_above_52w_bottom_30_percent():
    # 測試 52 週高低區間位階超過底部 30%（如 6112 / 4967 / 00752 案例）
    data = []
    for _ in range(199):
        data.append({'Open': 95, 'High': 100, 'Low': 90, 'Close': 95})
    # 在 25 週前曾跌至 40（使 52 週區間為 40 ~ 100，底部 30% 上限為 58）
    data[-25] = {'Open': 45, 'High': 48, 'Low': 40, 'Close': 44}
    # 但在 80 附近形成兩個相距 >= 5 週的 Swing Low（位處 52 週區間約 67% 高檔位置）
    data[-15] = {'Open': 82, 'High': 85, 'Low': 80, 'Close': 83}
    data[-7] = {'Open': 83, 'High': 86, 'Low': 81, 'Close': 84}
    # 當週在 80 出現假跌破長下影線，但因位階高於 52 週底部 30%，應回傳 none
    data.append({'Open': 83, 'High': 85, 'Low': 78, 'Close': 82})
    weekly_data = pd.DataFrame(data)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)

    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'

def test_evaluate_trend_reversal_criteria_fail_if_swing_lows_too_close():
    # 測試構成邊界的兩個 Swing Lows 間隔 < 5 週（如 4967 僅間隔 3 週）
    data = []
    for _ in range(199):
        data.append({'Open': 100, 'High': 105, 'Low': 95, 'Close': 100})
    # B 點與 A 點僅間隔 4 週 (-11 與 -7，差 4 < 5)
    data[-11] = {'Open': 53, 'High': 56, 'Low': 51, 'Close': 54}
    data[-7] = {'Open': 52, 'High': 55, 'Low': 50, 'Close': 53}
    data.append({'Open': 54, 'High': 55, 'Low': 48, 'Close': 52})
    weekly_data = pd.DataFrame(data)
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)

    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'

def test_evaluate_trend_reversal_criteria_fail_if_approaching_in_uptrend_like_acn():
    # 測試 ACN 11/07 案例：前幾週是一路往上的多頭趨勢（並非由上往下回踩關鍵邊界）
    weekly_data = create_mock_weekly_data(a_price=50, b_price=51, last_low=48, last_close=52, shadow_ratio=0.6)
    # 將測試週之前的 3 根週 K 改為由下往上連續墊高的趨勢
    weekly_data.iloc[-4] = {'Open': 44, 'High': 47, 'Low': 43, 'Close': 46}
    weekly_data.iloc[-3] = {'Open': 46, 'High': 49, 'Low': 45, 'Close': 48}
    weekly_data.iloc[-2] = {'Open': 48, 'High': 53, 'Low': 47, 'Close': 51}
    daily_data = create_mock_daily_data_pattern(p1=100, p2=120, p3=80, p4=110, p5=100)

    assert evaluate_trend_reversal_criteria(daily_data, weekly_data) == 'none'


