import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'

export interface InsertedImage {
  mediaId: string
  reused: boolean
}

/**
 * Inserts an image through an editor "Wstaw obrazek" button: the dialog takes the file, the alt text and sends it
 * (`Wyślij i wstaw`). Returns the media id and whether the server answered `reused` for the upload.
 */
export async function insertImage(page: Page, trigger: Locator, png: Buffer, alt: string): Promise<InsertedImage> {
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Wstaw obrazek' })
  await dialog.locator('input[type=file]').setInputFiles({ name: 'obraz-testowy.png', mimeType: 'image/png', buffer: png })
  await dialog.getByPlaceholder(/Trójkąt/).fill(alt)
  const upload = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/media/uploads')
  await dialog.getByRole('button', { name: 'Wyślij i wstaw' }).click()
  const body = (await (await upload).json()) as { mediaId: string; reused: boolean }
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  return { mediaId: body.mediaId, reused: body.reused }
}
