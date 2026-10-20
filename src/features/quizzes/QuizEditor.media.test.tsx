import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import type { MediaMap } from '../../shared/media/types'
import type { QuizInput } from '../../shared/quiz/schema'
import QuizEditor from './QuizEditor'
import { emptyQuestion, emptyQuiz } from './quizDefaults'

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(),
  completeUpload: vi.fn(),
  putMediaBytes: vi.fn(),
}))

vi.mock('../media/api', () => ({
  useCreateMediaUploadMutation: () => [(input: unknown) => ({ unwrap: () => mocks.createUpload(input) })],
  useCompleteMediaUploadMutation: () => [(id: string) => ({ unwrap: () => mocks.completeUpload(id) })],
  putMediaBytes: (...args: unknown[]) => mocks.putMediaBytes(...args),
}))

// the markup parser only accepts uuids, so the fake upload uses one
const ID = '5f0c8a1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
const SRC = 'https://media.test/kwadrat.webp'

function renderEditor(initialValues: QuizInput, media?: MediaMap) {
  return render(
    <ConfigProvider>
      <AntdApp>
        <QuizEditor initialValues={initialValues} media={media} submitting={false} submitLabel="Zapisz" onSubmit={vi.fn()} />
      </AntdApp>
    </ConfigProvider>,
  )
}

/** Opens the dialog of an "Wstaw obrazek" button, picks a file, types the alt text and sends it. */
function uploadThrough(button: HTMLElement, alt: string) {
  fireEvent.click(button)
  fireEvent.change(screen.getByLabelText('Plik obrazka (PNG, JPEG albo WebP)'), {
    target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'kwadrat.png', { type: 'image/png' })] },
  })
  fireEvent.change(screen.getByLabelText('Opis obrazka (alt, wymagany)'), { target: { value: alt } })
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij i wstaw' }))
}

/** The rendered image of the preview (selector, not a role query: the antd DOM is large and role queries are slow). */
const previewImage = (alt: string) => document.querySelector<HTMLImageElement>(`img.media-image[alt="${alt}"]`)

const withQuestion = (question: QuizInput['questions'][number]): QuizInput => ({ ...emptyQuiz(), questions: [question] })

describe('QuizEditor with images', () => {
  beforeEach(() => {
    mocks.createUpload.mockReset().mockResolvedValue({
      mediaId: ID,
      reused: false,
      status: 'pending',
      upload: { url: `/api/media/${ID}/content`, method: 'PUT', headers: { 'Content-Type': 'image/webp' } },
    })
    mocks.putMediaBytes.mockReset().mockResolvedValue(undefined)
    mocks.completeUpload.mockReset().mockResolvedValue({ mediaId: ID, url: SRC, width: 800, height: 450, size: 4 })
  })
  afterEach(() => cleanup())

  it('inserts the markup into the prompt and shows the image under it', async () => {
    renderEditor(withQuestion({ ...emptyQuestion(), prompt: 'Co to jest?' }))
    uploadThrough(screen.getAllByRole('button', { name: /Wstaw obrazek$/ })[0], 'Kwadrat')

    // inserted at the caret, which jsdom places on its own for a field that was never focused: only presence is checked
    await waitFor(() => expect((screen.getByLabelText('Treść pytania') as HTMLTextAreaElement).value).toContain(`![Kwadrat](media:${ID})`))
    await waitFor(() => expect(previewImage('Kwadrat')).not.toBeNull())
    expect(previewImage('Kwadrat')).toHaveAttribute('src', SRC)
    // the first test of the file pays for the first mount of antd (transforms, styles): a longer budget
  }, 15000)

  it('inserts the markup into an option of a single-choice question', async () => {
    renderEditor(withQuestion(emptyQuestion('single')))
    uploadThrough(screen.getByRole('button', { name: 'Wstaw obrazek do opcji 1' }), 'Kwadrat')

    await waitFor(() => expect(screen.getByDisplayValue(`![Kwadrat](media:${ID})`)).toBeInTheDocument())
    await waitFor(() => expect(previewImage('Kwadrat')).not.toBeNull())
    expect(previewImage('Kwadrat')).toHaveAttribute('src', SRC)
  })

  it('has no option image button for a text answer (the engine refuses images there)', () => {
    renderEditor(withQuestion(emptyQuestion('text')))
    expect(screen.queryByRole('button', { name: /do opcji/ })).toBeNull()
    // the prompt and the explanation still take images
    expect(screen.getAllByRole('button', { name: /Wstaw obrazek$/ })).toHaveLength(2)
  })

  it('previews the images of the loaded quiz from its media map', () => {
    renderEditor(withQuestion({ ...emptyQuestion(), prompt: `Co to? ![Kwadrat](media:${ID})` }), {
      [ID]: { url: SRC, width: 800, height: 450 },
    })
    expect(previewImage('Kwadrat')).toHaveAttribute('src', SRC)
  })

  it('shows no preview and no image for a quiz without images', () => {
    renderEditor(withQuestion({ ...emptyQuestion(), prompt: 'Bez obrazków' }))
    expect(document.querySelector('img.media-image')).toBeNull()
    expect(document.querySelector('.media-field-preview')).toBeNull()
  })
})
