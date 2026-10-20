import { deleteQuizViaApi } from './support/api'
import { insertImage } from './support/editor'
import { expect, imageStates, test, waitForImages } from './support/fixtures'
import { makeTestPng } from './support/png'
import { sweepE2eData } from './support/cleanup'

// desktop only (playwright.config.ts): the editor is a desktop task
const ALT = 'Prostokąt na gradiencie'
const created: string[] = []

test.afterAll(async () => {
  for (const id of created) await deleteQuizViaApi(id)
  await sweepE2eData()
})

test('the editor uploads an image into the prompt, reuses it for the explanation, saves, and the player shows it', async ({ page }) => {
  const png = makeTestPng(41)

  await page.goto('/quizzes/new')
  await page.getByLabel('Tytuł').fill('[E2E] edytor')
  const prompt = page.getByLabel('Treść pytania').first()
  await prompt.fill('Co przedstawia obraz?')
  await prompt.focus()
  await page.keyboard.press('Control+End')

  const image = await insertImage(page, page.getByRole('button', { name: 'Wstaw obrazek' }).first(), png, ALT)
  expect(image.reused).toBe(false)

  // the newline before the image is added by the editor (a prompt without a trailing line break)
  await expect(prompt).toHaveValue(`Co przedstawia obraz?\n![${ALT}](media:${image.mediaId})`)
  await expect
    .poll(() => page.locator(`img[alt="${ALT}"]`).first().evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
    .toBeGreaterThan(0)

  // the same file again, in the explanation, in the same page: the server answers `reused`
  await page.getByLabel(/Wyjaśnienie/).fill('Prostokąt to obraz z gradientem.')
  const again = await insertImage(page, page.getByRole('button', { name: 'Wstaw obrazek' }).last(), png, ALT)
  expect(again.reused).toBe(true)
  expect(again.mediaId).toBe(image.mediaId)

  await page.getByPlaceholder('Opcja 1').fill('Prostokąt')
  await page.getByPlaceholder('Opcja 2').fill('Koło')
  await page.getByLabel('Poprawna').first().check()

  const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/quizzes')
  await page.getByRole('button', { name: 'Utwórz quiz' }).click()
  const quiz = (await (await saved).json()) as { id: string }
  created.push(quiz.id)
  await expect(page.getByText('Quiz zapisany')).toBeVisible()

  // play it: the question image loads, the right answer scores 100 %
  await page.goto(`/quizzes/${quiz.id}/play`)
  await expect(page.getByText('Pytanie 1 z 1')).toBeVisible()
  await waitForImages(page)
  expect((await imageStates(page)).filter((state) => state.alt === ALT && state.loaded)).toHaveLength(1)
  await page.getByText('Prostokąt', { exact: true }).click()
  await page.getByRole('button', { name: /Zakończ i sprawdź/ }).click()
  await expect(page.locator('h2').first()).toBeVisible()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await waitForImages(page)
})
