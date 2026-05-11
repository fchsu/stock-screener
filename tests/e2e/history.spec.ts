import { test, expect } from '@playwright/test'

test.describe('US2: View Historical Screening Results', () => {
  test('should navigate through historical dates using DateNav', async ({ page }) => {
    // 導覽至首頁
    await page.goto('/')

    // 驗證按鈕群的存在，應該要有當天到前4天的按鈕
    await expect(page.getByRole('link', { name: '當天' })).toBeVisible()
    await expect(page.getByRole('link', { name: '前1天' })).toBeVisible()
    await expect(page.getByRole('link', { name: '前4天' })).toBeVisible()

    // 點擊「前1天」
    await page.getByRole('link', { name: '前1天' }).click()

    // 驗證網址是否包含 offset=1
    await expect(page).toHaveURL(/\/\?offset=1/)

    // 點擊「前4天」
    await page.getByRole('link', { name: '前4天' }).click()

    // 驗證網址是否包含 offset=4
    await expect(page).toHaveURL(/\/\?offset=4/)

    // 點回「當天」
    await page.getByRole('link', { name: '當天' }).click()

    // 驗證網址是否沒有 offset 或是 offset=0
    // 預期為移除了 offset 參數，或為 /?offset=0，這裡假設當天會導向 /
    // 需要使用 toHaveURL 讓 Playwright 自動等待跳轉完成
    await expect(page).not.toHaveURL(/offset=/)
  })
})
