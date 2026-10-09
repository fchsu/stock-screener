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

def evaluate_trend_reversal_criteria(daily_data: pd.DataFrame, weekly_data: pd.DataFrame) -> str:
    """
    實作老余三問篩選邏輯：
    1. 位置：判斷週線處於下邊界（當前價格落在過去 200 週價格區間的底部 10% 以內）。
    2. 慣性：判斷週線 K 棒出現長下影線（下影線長度大於實體與上影線總和）。
    3. 圖（破底翻）：定義為呈現 P0 - P5 波動，且 P5 與 P1 的價格落差需在 3% 以內，
       且 P5 距離 P3 的價格空間需落在前波跌幅的 25% 到 75% 之間。
    """
    if daily_data is None or len(daily_data) < 60:
        return 'none'
    if weekly_data is None or len(weekly_data) < 2:
        return 'none'
        
    # --- 1. 位置 (Position) ---
    w_lows = weekly_data['Low'].values
    w_highs = weekly_data['High'].values
    w_swing_highs, w_swing_lows = get_swing_points(w_highs, w_lows, window=2)

    if len(w_swing_lows) < 2:
        return 'none'

    sorted_sl = sorted(w_swing_lows, key=lambda x: x[0])

    # 候選測試週：當週 (iloc[-1]) 與 上週 (iloc[-2])，涵蓋剛收線與週中觀察
    candidate_weeks = [weekly_data.iloc[-1]]
    if len(weekly_data) >= 3:
        candidate_weeks.append(weekly_data.iloc[-2])

    current_week = weekly_data.iloc[-1]
    current_body_bottom = min(current_week['Open'], current_week['Close'])

    # 尋找歷史形成的關鍵邊界 (任意兩點低點差距在 5% 以內，形成有效水平支撐帶)
    valid_boundaries = []
    n_sl = len(sorted_sl)
    total_weeks = len(weekly_data)
    for i in range(n_sl - 1, -1, -1):
        idx_a, price_a = sorted_sl[i]
        # A 點必須具備近時性：在過去 52 週內（近 1 年）或屬於最近 5 個 Swing Lows 之一
        if (total_weeks - idx_a > 52) and (n_sl - 1 - i >= 5):
            continue
        for j in range(i - 1, -1, -1):
            idx_b, price_b = sorted_sl[j]
            max_ab = max(price_a, price_b)
            if max_ab > 0 and abs(price_a - price_b) / max_ab <= 0.05:
                valid_boundaries.append(min(price_a, price_b))

    if not valid_boundaries:
        return 'none'

    valid_boundaries = sorted(list(set(valid_boundaries)), reverse=True)

    # --- 2. 慣性 (Momentum) ---
    matched_boundary = None
    for b_level in valid_boundaries:
        # 當前週實體不可跌破該邊界 (防真破位)
        if current_body_bottom < b_level:
            continue

        for w in candidate_weeks:
            w_open, w_close, w_high, w_low = w['Open'], w['Close'], w['High'], w['Low']
            if w_high == w_low:
                continue

            body_bottom = min(w_open, w_close)
            lower_shadow = body_bottom - w_low
            total_range = w_high - w_low

            # 條件 2-1: 長下影線 (下影線長度大於總振幅的一半)
            if (lower_shadow / total_range) <= 0.5:
                continue

            # 條件 2-2: 週線最低點跌破關鍵邊界，且實體底部站穩在關鍵邊界之上
            if w_low < b_level and body_bottom >= b_level:
                matched_boundary = b_level
                break

        if matched_boundary is not None:
            break

    if matched_boundary is None:
        return 'none'
        
    # --- 3. 圖 (Pattern - 破底翻) ---
    recent = daily_data.tail(60)
    lows = recent['Low'].values
    highs = recent['High'].values
    
    # 使用 window=3 尋找短期的轉折點，代表前後各看 3 根，加上自己共 7 根 K 棒
    swing_highs, swing_lows = get_swing_points(highs, lows, window=3)
    
    if len(swing_lows) < 2 or len(swing_highs) < 1:
        return 'momentum'
        
    # P5 是最後一個轉折低點 (或最新的 K 棒若是破底翻回測)
    # 實際上 P5 可能還沒完全成為 Swing Low (右邊可能還沒有 K 棒)，
    # 但為求嚴謹，我們假設 P5 是最新的 Swing Low 或者最後一根 K 棒
    p5_idx = len(lows) - 1
    p5 = lows[p5_idx]
    
    # P4 必須是 P5 之前「最近的一個」Swing High (反彈小頸線)
    valid_p4_candidates = [sh for sh in swing_highs if sh[0] < p5_idx]
    if not valid_p4_candidates:
        return 'momentum'
    p4_idx, p4 = valid_p4_candidates[-1]
    
    # 防護 1: P4 與 P5 之間不可夾帶其他 Swing Low (P5 必須是緊接在 P4 之後的回踩腳)
    if any(p4_idx < sl[0] < p5_idx for sl in swing_lows):
        return 'momentum'

    # 防護 2: P5 與 P4 間隔不可過長 (回踩確認需在 12 根日 K 以內完成)
    if (p5_idx - p4_idx) > 12:
        return 'momentum'

    # P3 是在 P4 之前最低的 Swing Low (破底點)
    valid_p3_candidates = [sl for sl in swing_lows if sl[0] < p4_idx]
    if not valid_p3_candidates:
        return 'momentum'
    p3_idx, p3 = min(valid_p3_candidates, key=lambda x: x[1])

    # 防護 3: P3 到 P4 之間不可夾帶其他 Swing High (P3 破底後直接反彈至 P4)
    if any(p3_idx < sh[0] < p4_idx for sh in swing_highs):
        return 'momentum'

    # P1 是在 P3 之前的 Swing Low (取最靠近 P3 的那個)
    valid_p1_candidates = [sl for sl in swing_lows if sl[0] < p3_idx]
    if not valid_p1_candidates:
        return 'momentum'
    p1_idx, p1 = valid_p1_candidates[-1]

    # P2 是在 P1 到 P3 之間的 Swing High
    valid_p2_candidates = [sh for sh in swing_highs if p1_idx < sh[0] < p3_idx]
    if not valid_p2_candidates:
        return 'momentum'
    p2_idx, p2 = max(valid_p2_candidates, key=lambda x: x[1])

    # 防護 4: 整體 P1 到 P5 跨度不可超過 35 根 K 棒 (約 7 週以內，保持型態緊湊)
    if (p5_idx - p1_idx) > 35:
        return 'momentum'

    # 條件 3-0: 右腳 P5 必須高於或等於破底點 P3 (破底翻右腳不可再創新低破底)
    if p5 < p3:
        return 'momentum'

    # 條件 3-1: P5 與 P1 的價格落差需在 3% 以內
    p1_p5_diff_ratio = abs(p5 - p1) / p1
    if p1_p5_diff_ratio > 0.03:
        return 'momentum'
        
    # 條件 3-2: (P2 - P3) * 0.25 <= (P4 - P5) <= (P2 - P3) * 0.75
    p2_p3_drop = p2 - p3
    if p2_p3_drop <= 0:
        return 'momentum'
        
    p4_p5_space = p4 - p5
    if (p4 - p5) < p2_p3_drop * 0.25 or (p4 - p5) > p2_p3_drop * 0.75:
        return 'momentum'
        
    # 條件 3-3: 止跌確認 (若 P5 為最新一根日 K，不可為實體大黑棒收在當日最低點)
    last_bar = recent.iloc[-1]
    bar_range = last_bar['High'] - last_bar['Low']
    if bar_range > 0 and last_bar['Close'] < last_bar['Open']:
        if (last_bar['Close'] - last_bar['Low']) / bar_range < 0.10:
            return 'momentum'

    return 'strict'
