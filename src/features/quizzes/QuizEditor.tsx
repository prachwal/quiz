import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Segmented, Select, Space, Switch, App as AntdApp } from 'antd'
import type { FormInstance } from 'antd'
import { useMemo, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import { QUESTION_TYPES, typeDef, questionTypes } from '../../shared/quiz/engine'
import type { QuestionType } from '../../shared/quiz/engine'
import { quizInput } from '../../shared/quiz/schema'
import type { QuizInput } from '../../shared/quiz/schema'
import type { MediaMap } from '../../shared/media/types'
import { difficultyOptions, subjectOptions } from '../../components/groupOptions'
import FieldPreview from '../media/FieldPreview'
import ImageUpload from '../media/ImageUpload'
import type { InsertedImage } from '../media/uploadImage'
import { MediaProvider } from '../media/MediaProvider'
import { insertIntoFormField } from '../media/markdownInsert'
import { emptyQuestion } from './quizDefaults'
import ConfigEditor from './ConfigEditor'
import OptionsEditor from './OptionsEditor'

interface Props {
  initialValues: QuizInput
  /** Images of the loaded quiz (`media` of the API answer); fresh uploads are added to them while editing. */
  media?: MediaMap
  submitting: boolean
  submitLabel: string
  onSubmit: (values: QuizInput) => void | Promise<void>
}

const typeOptions = QUESTION_TYPES.map((type) => ({ value: type, label: questionTypes[type].label }))

function QuestionCard({
  form,
  name,
  index,
  onRemove,
  canRemove,
  onImage,
}: {
  form: FormInstance<QuizInput>
  name: number
  index: number
  onRemove: () => void
  canRemove: boolean
  onImage: (image: InsertedImage) => void
}) {
  const type = (Form.useWatch(['questions', name, 'type'], form) ?? 'single') as QuestionType
  const def = typeDef(type)
  const config = Form.useWatch(['questions', name, 'config'], form) as unknown
  const prompt = (Form.useWatch(['questions', name, 'prompt'], form) ?? '') as string
  const explanation = (Form.useWatch(['questions', name, 'explanation'], form) ?? '') as string
  const promptRef = useRef<ComponentRef<typeof Input.TextArea>>(null)
  const explanationRef = useRef<ComponentRef<typeof Input.TextArea>>(null)
  // images can be inserted into the prompt and the explanation of every type; option images are in OptionsEditor
  const insertImage = (path: 'prompt' | 'explanation', ref: typeof promptRef, image: InsertedImage) => {
    onImage(image)
    insertIntoFormField(form, ['questions', name, path], ref.current?.resizableTextArea?.textArea ?? null, image.markdown, true)
  }

  return (
    <Card
      size="small"
      title={`Pytanie ${index + 1}`}
      extra={
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={!canRemove}
          onClick={onRemove}
          aria-label="Usuń pytanie"
        />
      }
    >
      <Space align="start" wrap>
        <Form.Item label="Typ" name={[name, 'type']} style={{ minWidth: 220 }}>
          <Select
            options={typeOptions}
            onChange={(next: QuestionType) => {
              const nextDef = typeDef(next)
              // switching types replaces both payloads so no stale options/config is saved
              form.setFieldValue(['questions', name, 'options'], nextDef.defaultOptions())
              form.setFieldValue(['questions', name, 'config'], nextDef.defaultConfig?.())
            }}
          />
        </Form.Item>
        <Form.Item label="Punkty" name={[name, 'points']}>
          <InputNumber min={1} max={100} />
        </Form.Item>
      </Space>
      <Form.Item
        label="Treść pytania"
        name={[name, 'prompt']}
        rules={[{ required: true, whitespace: true, message: 'Treść pytania jest wymagana' }]}
      >
        <Input.TextArea ref={promptRef} autoSize={{ minRows: 2 }} maxLength={2000} />
      </Form.Item>
      <Space wrap style={{ marginTop: -8, marginBottom: 8 }}>
        <ImageUpload onInsert={(image) => insertImage('prompt', promptRef, image)} />
      </Space>
      <FieldPreview text={prompt} />
      {def.usesOptions ? (
        <Form.Item
          label={type === 'text' ? 'Akceptowane odpowiedzi (wielkość liter bez znaczenia)' : 'Odpowiedzi'}
          name={[name, 'options']}
          validateTrigger={['onChange']}
          rules={[
            {
              validator: (_rule, options) => {
                const error = questionTypes[type].validate({ type, prompt, options: options ?? [] })
                if (error) return Promise.reject(new Error(error))
                return options?.some((o: { text: string }) => !o.text.trim())
                  ? Promise.reject(new Error('Uzupełnij treść wszystkich opcji'))
                  : Promise.resolve()
              },
            },
          ]}
        >
          <OptionsEditor type={type} onMediaUploaded={onImage} />
        </Form.Item>
      ) : (
        <Form.Item
          label="Odpowiedź"
          name={[name, 'config']}
          validateTrigger={['onChange']}
          rules={[
            {
              validator: (_rule, value) => {
                const error = def.validate({ type, prompt, options: [], config: value })
                return error ? Promise.reject(new Error(error)) : Promise.resolve()
              },
            },
          ]}
        >
          <ConfigEditor
            type={type}
            value={config}
            prompt={prompt}
            onPromptChange={(next) => form.setFieldValue(['questions', name, 'prompt'], next)}
          />
        </Form.Item>
      )}
      <Form.Item label="Wyjaśnienie (opcjonalne)" name={[name, 'explanation']} style={{ marginBottom: 0 }}>
        <Input.TextArea ref={explanationRef} autoSize={{ minRows: 1 }} maxLength={2000} />
      </Form.Item>
      <Space wrap style={{ marginTop: 8 }}>
        <ImageUpload onInsert={(image) => insertImage('explanation', explanationRef, image)} />
      </Space>
      <FieldPreview text={explanation} />
    </Card>
  )
}

export default function QuizEditor({ initialValues, media: loadedMedia, submitting, submitLabel, onSubmit }: Props) {
  const [form] = Form.useForm<QuizInput>()
  const { message } = AntdApp.useApp()
  // images uploaded in this session; they are not in the loaded quiz's map until the quiz is saved and read again
  const [uploaded, setUploaded] = useState<MediaMap>({})
  const media = useMemo(() => ({ ...loadedMedia, ...uploaded }), [loadedMedia, uploaded])
  const addUploaded = (image: InsertedImage) => setUploaded((previous) => ({ ...previous, [image.mediaId]: image.info }))

  const handleFinish = (values: QuizInput) => {
    const parsed = quizInput.safeParse(values)
    if (!parsed.success) {
      void message.error(parsed.error.issues[0]?.message ?? 'Niepoprawne dane')
      return
    }
    return onSubmit(values)
  }

  return (
    <MediaProvider media={media}>
      <Form form={form} layout="vertical" initialValues={initialValues} onFinish={handleFinish}>
        <Card>
          <Form.Item
            label="Tytuł"
            name="title"
            rules={[{ required: true, whitespace: true, message: 'Tytuł jest wymagany' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="Opis" name="description">
            <Input.TextArea autoSize={{ minRows: 2 }} maxLength={2000} />
          </Form.Item>
          <Space align="start" wrap>
            <Form.Item label="Przedmiot" name="subject" style={{ marginBottom: 0 }}>
              <Select allowClear placeholder="Bez przedmiotu" options={subjectOptions} style={{ width: 220, maxWidth: '100%' }} />
            </Form.Item>
            <Form.Item label="Poziom trudności" name="difficulty" style={{ marginBottom: 0 }}>
              <Select allowClear placeholder="Nie określono" options={difficultyOptions} style={{ width: 220, maxWidth: '100%' }} />
            </Form.Item>
          </Space>
        </Card>

        <Card title="Ustawienia quizu" size="small" style={{ marginTop: 16 }}>
          <Form.Item
            label="Losowa kolejność pytań"
            name="shuffleQuestions"
            extra="„Ustawienie gracza” zostawia decyzję graczowi (Ustawienia → Losowa kolejność pytań). Pozostałe opcje nadpisują je dla tego quizu."
            getValueProps={(v: boolean | null | undefined) => ({ value: v == null ? 'user' : v ? 'on' : 'off' })}
            normalize={(v: 'user' | 'on' | 'off') => (v === 'user' ? null : v === 'on')}
          >
            <Segmented
              options={[
                { value: 'user', label: 'Ustawienie gracza' },
                { value: 'on', label: 'Zawsze losowo' },
                { value: 'off', label: 'Zawsze po kolei' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="Pytania losowane z całej puli"
            name="sampleSize"
            extra="Przy każdym podejściu gracz dostaje tyle pytań, wylosowanych z wszystkich pytań quizu. Jeśli pula jest mniejsza, gra się wszystkie."
            getValueProps={(v: number | null | undefined) => ({ value: v == null ? 'all' : String(v) })}
            normalize={(v: string) => (v === 'all' ? null : Number(v))}
          >
            <Segmented
              options={[
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '30', label: '30' },
                { value: 'all', label: 'Wszystkie' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Losowa kolejność odpowiedzi (pytania z wyborem)" name="shuffleOptions" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </Card>

        <Form.List name="questions">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
              {fields.map((field, index) => (
                <QuestionCard
                  key={field.key}
                  form={form}
                  name={field.name}
                  index={index}
                  canRemove={fields.length > 1}
                  onRemove={() => remove(field.name)}
                  onImage={addUploaded}
                />
              ))}
              <Button type="dashed" icon={<PlusOutlined />} block onClick={() => add(emptyQuestion())}>
                Dodaj pytanie
              </Button>
            </Space>
          )}
        </Form.List>

        <Button
          type="primary"
          htmlType="submit"
          loading={submitting}
          size="large"
          className="mobile-block"
          style={{ marginTop: 24 }}
        >
          {submitLabel}
        </Button>
      </Form>
    </MediaProvider>
  )
}
