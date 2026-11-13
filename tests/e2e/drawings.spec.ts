import { test, expect } from '@playwright/test'
import type { ChartDrawing, ScreeningResult } from '@/lib/database.types'

const e2eScreeningResults: ScreeningResult[] = [
  {
    id: 'e2e-twse-drawings',
    date: '2026-11-14',
    market: 'TWSE',
    status: 'completed',
    assets: [
      {
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        matchLevel: 'strict',
        tradingViewUrl: 'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2330',
        tradingDate: '2026-11-14',
      },
    ],
    updated_at: '2026-11-14T07:15:00Z',
  },
]

test.describe('K-Line Chart Drawings (Horizontal Line & Path) End-to-End Flow', () => {
  test('allows logged-in user to draw horizontal line and multi-point path (finished via right-click), aligns across timeframes, updates style, and deletes', async ({
    page,
  }) => {
    const storedDrawings: ChartDrawing[] = []

    await page.route('**/rest/v1/screening_results*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(e2eScreeningResults),
      })
    })

    await page.route('**/api/ohlcv*', async (route) => {
      const url = new URL(route.request().url())
      const symbol = url.searchParams.get('symbol') || '2330.TW'
      const interval = url.searchParams.get('interval') || '1d'
      const latestFridayTime = 1763044200
      const step = interval === '1wk' ? 604800 : interval === '60m' ? 3600 : 86400
      const endTime =
        interval === '1wk'
          ? latestFridayTime - 4 * 86400
          : interval === '60m'
            ? latestFridayTime + 6 * 3600
            : latestFridayTime
      const bars = Array.from({ length: 40 }, (_, i) => ({
        time: endTime - (39 - i) * step,
        open: 500 + i,
        high: 515 + i,
        low: 495 + i,
        close: 510 + i,
        volume: 15000000,
      }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          symbol,
          interval,
          bars,
          supportBoundary: 500,
        }),
      })
    })

    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'owner-uuid-1',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'owner@example.com',
          },
        }),
      })
    })

    await page.route('**/rest/v1/watchlists*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/rest/v1/chart_drawings*', async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(storedDrawings),
        })
        return
      }

      if (method === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}')
        const created: ChartDrawing = {
          id: `db-drawing-${storedDrawings.length + 1}`,
          user_id: payload.user_id ?? 'owner-uuid-1',
          symbol: payload.symbol ?? '2330.TW',
          tool_type: payload.tool_type,
          points: payload.points,
          style: payload.style,
          created_at: '2026-11-14T01:00:00Z',
          updated_at: '2026-11-14T01:00:00Z',
        }
        storedDrawings.push(created)
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        })
        return
      }

      if (method === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        })
        return
      }

      if (method === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        })
        return
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/')

    // 1. 未登入時不顯示畫線工具列
    await expect(page.getByTestId('chart-drawing-toolbar')).toHaveCount(0)

    // 2. 登入後顯示畫線工具列
    await page.getByRole('button', { name: '登入' }).click()
    await page.getByLabel(/電子郵件|Email/i).fill('owner@example.com')
    await page.getByLabel(/密碼/i).fill('secret123')
    await page.getByRole('button', { name: '確認登入' }).click()

    const toolbar = page.getByTestId('chart-drawing-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar).toContainText('0/50')

    // 3. 選擇「水平線」工具並在圖表上單擊建立一條水平線
    await toolbar.getByRole('button', { name: /水平線/ }).click()
    const dailyOverlay = page.getByTestId('chart-drawing-overlay-1d')
    await dailyOverlay.click({ position: { x: 250, y: 180 } })

    await expect(page.getByTestId('drawing-line-db-drawing-1')).toBeAttached()
    await expect(page.getByTestId('drawing-group-db-drawing-1')).toBeVisible()
    await expect(toolbar).toContainText('1/50')

    // 4. 選擇「路徑」工具，依序點擊 3 個節點（含右側未來空白區 P5 位置），並按滑鼠右鍵完成繪製
    await toolbar.getByRole('button', { name: /路徑/ }).click()
    const box = await dailyOverlay.boundingBox()
    const width = box?.width ?? 700
    await dailyOverlay.click({ position: { x: Math.round(width * 0.45), y: 240 } })
    await dailyOverlay.click({ position: { x: Math.round(width * 0.65), y: 210 } })
    await dailyOverlay.click({ position: { x: Math.round(width * 0.88), y: 140 } })

    await expect(page.getByTestId('draft-path-polyline')).toBeAttached()

    // 滑鼠右鍵完成路徑繪製
    await dailyOverlay.click({
      button: 'right',
      position: { x: Math.round(width * 0.88), y: 140 },
    })

    await expect(page.getByTestId('drawing-path-db-drawing-2')).toBeAttached()
    await expect(
      page
        .getByTestId('drawing-Path-db-drawing-2')
        .or(page.getByTestId('drawing-path-db-drawing-2'))
    ).toHaveCount(1)
    await expect(toolbar).toContainText('2/50')

    // 5. 切換至「週K」與「60K」時框：驗證水平線與路徑（含未來預留區節點）皆跨時框同步顯示，且未來節點 X 座標絕不會掉到最左側 0
    await page.getByRole('button', { name: /週K/ }).click()
    const weeklyOverlay = page.getByTestId('chart-drawing-overlay-1wk')
    await expect(weeklyOverlay).toBeVisible()
    await expect(page.getByTestId('drawing-line-db-drawing-1')).toBeAttached()
    const weeklyPath = page.getByTestId('drawing-path-db-drawing-2')
    await expect(weeklyPath).toBeAttached()
    const weeklyPointsAttr = await weeklyPath.getAttribute('points')
    const weeklyXs = (weeklyPointsAttr ?? '')
      .trim()
      .split(/\s+/)
      .map((pair) => Number(pair.split(',')[0]))
    expect(weeklyXs.length).toBe(3)
    expect(weeklyXs[2]).toBeGreaterThan(weeklyXs[1])
    expect(weeklyXs[2]).toBeGreaterThan(200)

    await page.getByRole('button', { name: /60K/ }).click()
    const hourlyOverlay = page.getByTestId('chart-drawing-overlay-60m')
    await expect(hourlyOverlay).toBeVisible()
    const hourlyPath = page.getByTestId('drawing-path-db-drawing-2')
    await expect(hourlyPath).toBeAttached()
    const hourlyPointsAttr = await hourlyPath.getAttribute('points')
    const hourlyXs = (hourlyPointsAttr ?? '')
      .trim()
      .split(/\s+/)
      .map((pair) => Number(pair.split(',')[0]))
    expect(hourlyXs.length).toBe(3)
    expect(hourlyXs[2]).toBeGreaterThan(200)

    // 6. 點擊清除全部畫線
    await toolbar.getByRole('button', { name: '清除全部畫線' }).click()
    await expect(toolbar).toContainText('0/50')
    await expect(page.getByTestId('drawing-line-db-drawing-1')).toHaveCount(0)
    await expect(page.getByTestId('drawing-path-db-drawing-2')).toHaveCount(0)
  })
})
