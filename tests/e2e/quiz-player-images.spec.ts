import type { Page } from '@playwright/test'
import { sweepE2eData } from './support/cleanup'
import { createQuizViaApi, deleteQuizViaApi, uploadImageViaApi, type UploadedImage } from './support/api'
import { expect, imageStates, test, waitForImages, type ImageState } from './support/fixtures'
import { makeTestPng } from './support/png'

// desktop-light and phone-dark (playwright.config.ts): the phone run also checks the fixed bottom bar
const created: string[] = []

test.afterAll(async () => {
  for (const id of created) await deleteQuizViaApi(id)
  await sweepE2eData()
})

const md = (image: UploadedImage, alt: string) => `![${alt}](media:${image.mediaId})`

/** Random seeds keep every run's bytes new (a byte-identical file of the owner would be answered as reused). */
const seed = () => 1 + Math.floor(Math.random() * 250)

test('a quiz with images in the prompt, in the options and in a cloze is answered and every image loads', async ({ page }, testInfo) => {
  const prompt = await uploadImageViaApi(makeTestPng(seed()), 'Prostokąt na jasnym tle')
  const greenOption = await uploadImageViaApi(makeTestPng(seed()), 'Zielone pole')
  const redOption = await uploadImageViaApi(makeTestPng(seed()), 'Czerwone pole')
  const clozeImage = await uploadImageViaApi(makeTestPng(seed()), 'Ptak nad jeziorem')

  const quiz = await createQuizViaApi({
    title: '[E2E] gracz',
    description: 'Quiz testowy Playwright z obrazami',
    difficulty: 'easy',
    questions: [
      {
        type: 'single',
        prompt: `Co widzisz na obrazku?\n${md(prompt, 'Prostokąt na jasnym tle')}`,
        explanation: '',
        points: 1,
        options: [
          { text: 'Prostokąt', isCorrect: true },
          { text: 'Koło', isCorrect: false },
        ],
      },
      {
        type: 'single',
        prompt: 'Które pole jest zielone?',
        explanation: '',
        points: 1,
        options: [
          { text: md(redOption, 'Czerwone pole'), isCorrect: false },
          { text: md(greenOption, 'Zielone pole'), isCorrect: true },
        ],
      },
      {
        type: 'cloze',
        prompt: `Uzupełnij zdanie.\n${md(clozeImage, 'Ptak nad jeziorem')}\nYesterday the bird {{1}} over the lake.`,
        explanation: '',
        points: 1,
        options: [],
        config: { gaps: [{ answers: ['flew'] }] },
      },
    ],
  })
  created.push(quiz.id)

  await page.goto(`/quizzes/${quiz.id}/play`)
  // the order of the questions is shuffled by the player: each question is found by its text
  const steps: { needle: string; answer: () => Promise<void>; tiles: boolean }[] = [
    { needle: 'Co widzisz na obrazku?', tiles: true, answer: () => page.getByText('Prostokąt', { exact: true }).click() },
    { needle: 'Które pole jest zielone?', tiles: true, answer: () => page.locator('img[alt="Zielone pole"]').click() },
    { needle: 'Uzupełnij zdanie.', tiles: false, answer: () => page.getByRole('textbox').first().fill('flew') },
  ]
  const done: string[] = []
  for (let position = 1; position <= steps.length; position += 1) {
    await expect(page.getByText(`Pytanie ${position} z ${steps.length}`)).toBeVisible()
    const bodyText = await page.locator('body').innerText()
    const step = steps.find((candidate) => bodyText.includes(candidate.needle) && !done.includes(candidate.needle))
    if (!step) throw new Error(`no step for question ${position}: ${bodyText.replace(/\n+/g, ' | ').slice(0, 200)}`)
    done.push(step.needle)

    await waitForImages(page)
    const states = await imageStates(page)
    expect(states.filter((state) => state.alt !== '' && !state.loaded), `images that did not load on "${step.needle}"`).toEqual([])
    if (testInfo.project.name === 'phone-dark' && step.tiles) await expectLastOptionAboveActionBar(page)

    await step.answer()
    if (position < steps.length) await page.getByRole('button', { name: /Dalej|Pomiń/ }).click()
  }

  await page.getByRole('button', { name: /Zakończ i sprawdź/ }).click()
  await expect(page.locator('h2').first()).toBeVisible()
  await waitForImages(page)
  const result: ImageState[] = await imageStates(page)
  expect(result.length).toBeGreaterThan(0)
  expect(result.filter((state) => !state.loaded)).toEqual([])
})

/** Scrolls to the bottom and checks that the last option sits above the fixed thumb-zone bar (`.action-bar`). */
async function expectLastOptionAboveActionBar(page: Page) {
  const measured = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const bar = document.querySelector('.action-bar')?.getBoundingClientRect()
    const tiles = [...document.querySelectorAll<HTMLElement>('[class*="choice-tile"]')]
    const last = tiles.at(-1)?.getBoundingClientRect()
    return { barTop: bar ? Math.round(bar.top) : null, lastBottom: last ? Math.round(last.bottom) : null }
  })
  expect(measured.barTop, 'the fixed action bar').not.toBeNull()
  expect(measured.lastBottom, 'the last option').not.toBeNull()
  expect(measured.lastBottom).toBeLessThanOrEqual(measured.barTop as number)
}
