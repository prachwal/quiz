import { test as base, expect, type Page } from '@playwright/test'
import { assertRemoteDbAllowed } from './guard'

// every spec imports this module: refuse before any test touches the shared database or the bucket
assertRemoteDbAllowed()

export { expect }

/**
 * Fails the test when the page logged an error, threw, or a request failed. A request aborted by the page itself
 * (net::ERR_ABORTED, e.g. an image that is re-rendered while loading) is not a failure.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console error: ${message.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
      page.on('requestfailed', (request) => {
        const reason = request.failure()?.errorText ?? 'unknown'
        if (reason !== 'net::ERR_ABORTED') problems.push(`request failed: ${request.url()} (${reason})`)
      })
      await use()
      expect(problems, 'browser errors during the test').toEqual([])
    },
    { auto: true },
  ],
})

export interface ImageState {
  alt: string
  loaded: boolean
  width: number
  height: number
}

/** Every <img> of the page with its load state (complete and with a natural size). */
export async function imageStates(page: Page): Promise<ImageState[]> {
  return page.locator('img').evaluateAll((images: HTMLImageElement[]) =>
    images.map((image) => ({
      alt: image.alt,
      loaded: image.complete && image.naturalWidth > 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  )
}

/** Waits until at least one image is on the page and all of them have loaded (or the wait times out). */
export async function waitForImages(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.images.length > 0 && [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    null,
    { timeout: 15_000 },
  )
}
