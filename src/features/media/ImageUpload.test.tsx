import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import ImageUpload from './ImageUpload'

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(),
  completeUpload: vi.fn(),
  putMediaBytes: vi.fn(),
}))

// the RTK hooks are replaced: the dialog only asks for the start, the bytes and the completion
vi.mock('./api', () => ({
  useCreateMediaUploadMutation: () => [(input: unknown) => ({ unwrap: () => mocks.createUpload(input) })],
  useCompleteMediaUploadMutation: () => [(id: string) => ({ unwrap: () => mocks.completeUpload(id) })],
  putMediaBytes: (...args: unknown[]) => mocks.putMediaBytes(...args),
}))

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'kwadrat.png', { type: 'image/png' })

function renderButton(onInsert = vi.fn()) {
  render(
    <ConfigProvider>
      <AntdApp>
        <ImageUpload onInsert={onInsert} />
      </AntdApp>
    </ConfigProvider>,
  )
  // the icon adds "picture" to the accessible name, so only the end of the label is matched
  fireEvent.click(screen.getByRole('button', { name: /Wstaw obrazek$/ }))
  return onInsert
}

const pickFile = (file: File) => fireEvent.change(screen.getByLabelText('Plik obrazka (PNG, JPEG albo WebP)'), { target: { files: [file] } })
const typeAlt = (alt: string) => fireEvent.change(screen.getByLabelText('Opis obrazka (alt, wymagany)'), { target: { value: alt } })
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Wyślij i wstaw' }))

describe('ImageUpload', () => {
  beforeEach(() => {
    mocks.createUpload.mockReset()
    mocks.completeUpload.mockReset()
    mocks.putMediaBytes.mockReset()
  })
  afterEach(() => cleanup())

  it('opens the dialog and keeps "Wyślij i wstaw" disabled until a file is chosen', () => {
    renderButton()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wyślij i wstaw' })).toBeDisabled()
    pickFile(png())
    expect(screen.getByRole('button', { name: 'Wyślij i wstaw' })).toBeEnabled()
  })

  it('uploads and inserts the markdown with the alt text', async () => {
    mocks.createUpload.mockResolvedValue({
      mediaId: 'm-1',
      reused: false,
      status: 'pending',
      upload: { url: '/api/media/m-1/content', method: 'PUT', headers: { 'Content-Type': 'image/webp' } },
    })
    mocks.putMediaBytes.mockResolvedValue(undefined)
    mocks.completeUpload.mockResolvedValue({ mediaId: 'm-1', url: 'https://media.test/m-1.webp', width: 4, height: 3, size: 9 })
    const onInsert = renderButton()
    pickFile(png())
    typeAlt('Kwadrat')
    send()
    await waitFor(() => expect(onInsert).toHaveBeenCalledTimes(1))
    expect(onInsert).toHaveBeenCalledWith({
      markdown: '![Kwadrat](media:m-1)',
      mediaId: 'm-1',
      info: { url: 'https://media.test/m-1.webp', width: 4, height: 3 },
    })
    expect(mocks.putMediaBytes).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/media/m-1/content' }), expect.any(Uint8Array))
    expect(mocks.completeUpload).toHaveBeenCalledWith('m-1')
  })

  it('does not send the bytes again when the author already has the picture', async () => {
    mocks.createUpload.mockResolvedValue({ mediaId: 'm-2', reused: true, status: 'ready', url: 'https://media.test/m-2.webp', width: 1, height: 1 })
    const onInsert = renderButton()
    pickFile(png())
    typeAlt('Stary')
    send()
    await waitFor(() => expect(onInsert).toHaveBeenCalledTimes(1))
    expect(mocks.putMediaBytes).not.toHaveBeenCalled()
    expect(mocks.completeUpload).not.toHaveBeenCalled()
    expect(onInsert.mock.calls[0][0].markdown).toBe('![Stary](media:m-2)')
  })

  it('requires the alt text and says so in the dialog', () => {
    renderButton()
    pickFile(png())
    send()
    expect(screen.getByText('Opis obrazka (alt) jest wymagany - krótko opisz, co widać.')).toBeInTheDocument()
    expect(mocks.createUpload).not.toHaveBeenCalled()
  })

  it('shows the server message when the upload is refused', async () => {
    mocks.createUpload.mockRejectedValue({ status: 400, data: { error: 'Dzienny limit wysyłania obrazów został wykorzystany.' } })
    const onInsert = renderButton()
    pickFile(png())
    typeAlt('Kwadrat')
    send()
    expect(await screen.findByText('Dzienny limit wysyłania obrazów został wykorzystany.')).toBeInTheDocument()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('refuses a GIF when it is picked, before any request', () => {
    renderButton()
    pickFile(new File([new Uint8Array([71, 73, 70])], 'ruch.gif', { type: 'image/gif' }))
    expect(screen.getByText(/GIF i SVG nie są dozwolone/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wyślij i wstaw' })).toBeDisabled()
    expect(mocks.createUpload).not.toHaveBeenCalled()
  })
})
