import { PictureOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Modal, Space, Tooltip } from 'antd'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { errorMessage } from '../../app/api'
import { useCompleteMediaUploadMutation, useCreateMediaUploadMutation, putMediaBytes } from './api'
import { browserImageDeps, prepareImage, sha256Hex, validateImageFile } from './prepareImage'
import { type InsertedImage, uploadImage, validateAltText } from './uploadImage'

interface Props {
  /** Called with the markdown and the preview data after a successful upload. */
  onInsert: (image: InsertedImage) => void
  label?: string
  /** Icon-only button (used inside option rows); the name stays the accessible name. */
  compact?: boolean
  ariaLabel?: string
  disabled?: boolean
}

/**
 * "Wstaw obrazek": a button that opens the upload dialog. The dialog (and with it the upload hooks, which need the
 * store) is mounted only while it is open, so a form without the dialog never touches the API.
 */
export default function ImageUpload({ onInsert, label = 'Wstaw obrazek', compact = false, ariaLabel, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {compact ? (
        <Tooltip title={label}>
          <Button icon={<PictureOutlined />} aria-label={ariaLabel ?? label} disabled={disabled} onClick={() => setOpen(true)} />
        </Tooltip>
      ) : (
        <Button icon={<PictureOutlined />} disabled={disabled} onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      {open && <ImageUploadDialog onInsert={onInsert} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Releases the object URL held in a ref (the preview of a picked file). */
function revokePreview(ref: RefObject<string | null>) {
  if (ref.current) URL.revokeObjectURL(ref.current)
  ref.current = null
}

function ImageUploadDialog({ onInsert, onClose }: { onInsert: (image: InsertedImage) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [createUpload] = useCreateMediaUploadMutation()
  const [completeUpload] = useCompleteMediaUploadMutation()
  const fileId = useId()
  const altId = useId()

  // a preview of the picked file only: the object URL is replaced on each pick and released when the dialog closes
  const previewRef = useRef<string | null>(null)
  useEffect(() => () => revokePreview(previewRef), [])

  const showPreview = (next: File | null) => {
    revokePreview(previewRef)
    const url = next && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(next) : null
    previewRef.current = url
    setPreviewUrl(url)
  }

  const pickFile = (next: File | undefined) => {
    setError(null)
    const problem = next ? validateImageFile(next) : null
    if (!next || problem) {
      setFile(null)
      showPreview(null)
      if (problem) setError(problem)
      return
    }
    setFile(next)
    showPreview(next)
  }

  const submit = async () => {
    if (!file) {
      setError('Wybierz plik obrazka.')
      return
    }
    const altCheck = validateAltText(alt)
    if (!altCheck.ok) {
      setError(altCheck.reason)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const inserted = await uploadImage(
        { file, alt },
        {
          prepare: (picked) => prepareImage(picked, browserImageDeps),
          sha256: sha256Hex,
          createUpload: (input) => createUpload(input).unwrap(),
          put: putMediaBytes,
          complete: (mediaId) => completeUpload(mediaId).unwrap(),
        },
      )
      onInsert(inserted)
      onClose()
    } catch (caught) {
      // our own refusals are Error instances with a Polish message; RTK errors carry the server's answer
      setError(caught instanceof Error ? caught.message : errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Wstaw obrazek"
      okText="Wyślij i wstaw"
      cancelText="Anuluj"
      onOk={() => void submit()}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: file === null }}
      destroyOnHidden
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        <div>
          <label htmlFor={fileId}>Plik obrazka (PNG, JPEG albo WebP)</label>
          <div>
            <input
              id={fileId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => pickFile(event.target.files?.[0])}
            />
          </div>
        </div>
        {previewUrl && <img src={previewUrl} alt="Podgląd wybranego obrazka" style={{ maxWidth: '100%', maxHeight: 240 }} />}
        <div>
          <label htmlFor={altId}>Opis obrazka (alt, wymagany)</label>
          <Input
            id={altId}
            value={alt}
            maxLength={200}
            showCount
            aria-required="true"
            placeholder="Np. Trójkąt równoboczny z zaznaczonym kątem"
            disabled={busy}
            onChange={(event) => setAlt(event.target.value)}
          />
        </div>
        {error && <Alert type="error" showIcon title={error} />}
      </Space>
    </Modal>
  )
}
