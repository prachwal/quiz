import { sweepE2eData } from './support/cleanup'
import { E2E_TITLE_PREFIX } from './support/guard'
import { uploadImageViaApi } from './support/api'
import { withDb } from './support/db'
import { expect, imageStates, test, waitForImages } from './support/fixtures'
import { makeTestPng } from './support/png'

// both projects (playwright.config.ts): the lesson intro and the verb illustrations on desktop and on a phone
interface LessonFixture {
  courseId: string
  lessonId: string
  verbs: { id: number; base: string; previousImage: string | null }[]
}

let fixture: LessonFixture

/**
 * A course with one lesson: an intro with an image and three B2 verbs. The first verb gets an illustration (its alt is
 * the verb's base form). Rows are inserted with SQL the way the app writes them, media through the real upload flow.
 */
async function createLessonFixture(): Promise<LessonFixture> {
  const introImage = await uploadImageViaApi(makeTestPng(7 + Math.floor(Math.random() * 200)), 'Pejzaż testowy do wstępu')
  const illustration = await uploadImageViaApi(makeTestPng(7 + Math.floor(Math.random() * 200)), 'Ilustracja czasownika')
  return withDb(async (db) => {
    const course = await db.query<{ id: string }>(
      'INSERT INTO courses (slug, title, description) VALUES ($1, $2, $3) RETURNING id',
      [`e2e-kurs-${Date.now()}`, `${E2E_TITLE_PREFIX} kurs`, 'Kurs testowy Playwright (obrazy we wstępie i ilustracje czasowników)'],
    )
    const courseId = course.rows[0].id
    const intro = `Ta lekcja ma wstęp z obrazem, który sprawdza ładowanie zdjęć w przeglądarce.\n![Pejzaż testowy do wstępu](media:${introImage.mediaId})`
    const lesson = await db.query<{ id: string }>(
      'INSERT INTO lessons (course_id, position, title, intro) VALUES ($1, 1, $2, $3) RETURNING id',
      [courseId, `${E2E_TITLE_PREFIX} lekcja`, intro],
    )
    const lessonId = lesson.rows[0].id
    await db.query(
      `INSERT INTO media_refs (media_id, owner_kind, owner_id) VALUES ($1, 'lesson', $2) ON CONFLICT DO NOTHING`,
      [introImage.mediaId, lessonId],
    )
    const verbs = (await db.query<{ id: number; base: string; image_media_id: string | null }>(
      "SELECT id, base, image_media_id FROM irregular_verbs WHERE cefr_level = 'B2' ORDER BY base LIMIT 3",
    )).rows
    let position = 1
    for (const verb of verbs) {
      await db.query('INSERT INTO lesson_verbs (lesson_id, verb_id, position) VALUES ($1, $2, $3)', [lessonId, verb.id, position])
      position += 1
    }
    const [first] = verbs
    await db.query('UPDATE irregular_verbs SET image_media_id = $2 WHERE id = $1', [first.id, illustration.mediaId])
    await db.query(
      `INSERT INTO media_refs (media_id, owner_kind, owner_id) VALUES ($1, 'verb', $2) ON CONFLICT DO NOTHING`,
      [illustration.mediaId, String(first.id)],
    )
    return {
      courseId,
      lessonId,
      verbs: verbs.map((verb) => ({ id: verb.id, base: verb.base, previousImage: verb.image_media_id })),
    }
  })
}

test.beforeAll(async () => {
  fixture = await createLessonFixture()
})

test.afterAll(async () => {
  try {
    // the first verb gets back the illustration it had before the test (the sweep only clears the test media)
    if (fixture) {
      const [first] = fixture.verbs
      await withDb((db) => db.query('UPDATE irregular_verbs SET image_media_id = $2 WHERE id = $1', [first.id, first.previousImage]))
    }
  } finally {
    await sweepE2eData()
  }
})

test('the lesson intro shows its image, the verb slide shows its illustration, the verbs list shows the thumbnail', async ({ page }) => {
  const [first, second] = fixture.verbs
  await page.goto(`/learn/${fixture.courseId}/lessons/${fixture.lessonId}`)

  // slide 1: the intro with its image; the counter counts the intro and the three verbs
  await expect(page.getByText('Wstęp', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('1 / 4', { exact: true })).toBeVisible()
  await waitForImages(page)
  expect((await imageStates(page)).find((state) => state.alt === 'Pejzaż testowy do wstępu')?.loaded).toBe(true)

  // slide 2: the first verb with its illustration (alt = base form)
  await page.getByRole('button', { name: /Dalej/ }).click()
  await expect(page.getByText(first.base, { exact: true }).first()).toBeVisible()
  await waitForImages(page)
  expect((await imageStates(page)).find((state) => state.alt === first.base)?.loaded).toBe(true)

  // slide 3: the second verb has no illustration
  await page.getByRole('button', { name: /Dalej/ }).click()
  await expect(page.getByText(second.base, { exact: true }).first()).toBeVisible()
  await expect(page.locator(`img[alt="${second.base}"]`)).toHaveCount(0)

  // the verbs list: the illustrated verb has a 56 px thumbnail
  await page.goto('/verbs')
  await page.getByPlaceholder('Szukaj po angielsku lub po polsku').fill(first.base)
  const thumbnail = page.locator(`img[alt="${first.base}"]`).first()
  await expect(thumbnail).toBeVisible()
  await expect.poll(async () => (await thumbnail.boundingBox())?.width).toBe(56)
  await waitForImages(page)
})
