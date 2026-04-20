import { test, expect } from '@playwright/test'

// E2E 環境確認：首頁能正常開啟
// 實際功能測試將在 Phase 3 (US1) 中撰寫
test('homepage loads without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page).not.toHaveURL(/error/)
  expect(errors).toHaveLength(0)
})
