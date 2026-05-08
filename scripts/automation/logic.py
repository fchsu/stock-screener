import pandas as pd

def get_swing_points(highs, lows, window=2):
    """
    尋找波段高低點 (Swing Highs / Lows)
    - Swing High: 該根 K 棒的 High 大於前後各 window 根 K 棒的 High
    - Swing Low: 該根 K 棒的 Low 小於前後各 window 根 K 棒的 Low
    """
    n = len(highs)
    swing_highs = []
    swing_lows = []
    
    for i in range(window, n - window):
        is_swing_high = True
        is_swing_low = True
        
        for j in range(1, window + 1):
            if highs[i] <= highs[i - j] or highs[i] <= highs[i + j]:
                is_swing_high = False
            if lows[i] >= lows[i - j] or lows[i] >= lows[i + j]:
                is_swing_low = False
                
        if is_swing_high:
            swing_highs.append((i, highs[i]))
        if is_swing_low:
            swing_lows.append((i, lows[i]))
            
    return swing_highs, swing_lows

def evaluate_trend_reversal_criteria(daily_data: pd.DataFrame, weekly_data: pd.DataFrame) -> bool:
    """
    實作老余三問篩選邏輯：
    1. 位置：判斷週線處於下邊界（當前價格落在過去 200 週價格區間的底部 10% 以內）。
    2. 慣性：判斷週線 K 棒出現長下影線（下影線長度大於實體與上影線總和）。
    3. 圖（破底翻）：定義為呈現 P0 - P5 波動，且 P5 與 P1 的價格落差需在 3% 以內，
       且 P5 距離 P3 的價格空間需落在前波跌幅的 25% 到 75% 之間。
    """
    if daily_data is None or len(daily_data) < 60:
        return False
    if weekly_data is None or len(weekly_data) < 2:
        return False
        
    # --- 1. 位置 (Position) ---
    global_max = weekly_data['High'].max()
    global_min = weekly_data['Low'].min()
    price_range = global_max - global_min
    if price_range <= 0:
        return False
        
    current_close = weekly_data['Close'].iloc[-1]
    position_pct = (current_close - global_min) / price_range
    if position_pct > 0.10: 
        return False
        
    # --- 2. 慣性 (Momentum) ---
    last_week = weekly_data.iloc[-1]
    w_open = last_week['Open']
    w_close = last_week['Close']
    w_high = last_week['High']
    w_low = last_week['Low']
    
    if w_high == w_low:
        return False
        
    body_bottom = min(w_open, w_close)
    lower_shadow = body_bottom - w_low
    total_range = w_high - w_low
    
    if (lower_shadow / total_range) <= 0.5:
        return False
        
    # --- 3. 圖 (Pattern - 破底翻) ---
    recent = daily_data.tail(60)
    lows = recent['Low'].values
    highs = recent['High'].values
    
    # 使用 window=3 尋找短期的轉折點，代表前後各看 3 根，加上自己共 7 根 K 棒
    swing_highs, swing_lows = get_swing_points(highs, lows, window=3)
    
    if len(swing_lows) < 2 or len(swing_highs) < 1:
        return False
        
    # P5 是最後一個轉折低點 (或最新的 K 棒若是破底翻回測)
    # 實際上 P5 可能還沒完全成為 Swing Low (右邊可能還沒有 K 棒)，
    # 但為求嚴謹，我們假設 P5 是最新的 Swing Low 或者最後一根 K 棒
    p5_idx = len(lows) - 1
    p5 = lows[p5_idx]
    
    # P3 是在 P5 之前最低的 Swing Low
    valid_p3_candidates = [sl for sl in swing_lows if sl[0] < p5_idx]
    if not valid_p3_candidates:
        return False
        
    # P3 必須是全局（或者近期）最低點
    p3_idx, p3 = min(valid_p3_candidates, key=lambda x: x[1])
    
    # P1 是在 P3 之前的 Swing Low
    valid_p1_candidates = [sl for sl in swing_lows if sl[0] < p3_idx]
    if not valid_p1_candidates:
        return False
    # P1 取最靠近 P3 的那個
    p1_idx, p1 = valid_p1_candidates[-1]
    
    # P2 是在 P1 到 P3 之間的 Swing High
    valid_p2_candidates = [sh for sh in swing_highs if p1_idx < sh[0] < p3_idx]
    if not valid_p2_candidates:
        return False
    # P2 取最高點
    p2_idx, p2 = max(valid_p2_candidates, key=lambda x: x[1])
    
    # 條件 3-1: P5 與 P1 的價格落差需在 3% 以內
    if p1 == 0:
        return False
    p1_p5_diff_ratio = abs(p5 - p1) / p1
    if p1_p5_diff_ratio > 0.03:
        return False
        
    # 條件 3-2: P5 距離 P3 的價格空間需落在 (P2 - P3) * 0.25 <= (P5 - P3) <= (P2 - P3) * 0.75
    prev_drop = p2 - p3
    if prev_drop <= 0:
        return False
        
    p5_p3_space = p5 - p3
    if not (prev_drop * 0.25 <= p5_p3_space <= prev_drop * 0.75):
        return False
        
    return True
