import { CommentOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Form, Radio, Switch, Tabs, Typography } from 'antd'
import PageHeader from '../components/PageHeader'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import AppSettingsAdmin from '../features/admin/AppSettingsAdmin'
import AuditAdmin from '../features/admin/AuditAdmin'
import FeedbackAdmin from '../features/admin/FeedbackAdmin'
import UsersAdmin from '../features/admin/UsersAdmin'
import ApiTokens from '../features/auth/ApiTokens'
import { useAuth } from '../features/auth/useAuth'
import { openFeedback } from '../features/feedback/feedbackSlice'
import { useGetProgressQuery, useUpdateProfileMutation } from '../app/api'
import {
  resetSettings,
  setCompact,
  setShowExplanations,
  setAutoSpeak,
  setShuffleQuestions,
  setSpeechAccent,
  setSpeechRate,
  setThemeMode,
} from '../features/settings/settingsSlice'
import type { SpeechAccent, SpeechRate, ThemeMode } from '../features/settings/settingsSlice'
import { useSpeech } from '../features/audio/useSpeech'
import SpeakButton from '../features/audio/SpeakButton'

function DailyGoal() {
  const { data } = useGetProgressQuery()
  const [update, { isLoading }] = useUpdateProfileMutation()
  return (
    <Card title="Cel dzienny" style={{ marginTop: 16 }}>
      <Typography.Paragraph type="secondary">
        Liczba odpowiedzi dziennie, którą chcesz osiągać. Dzień liczy się do serii po pierwszej odpowiedzi lub
        ukończonej lekcji.
      </Typography.Paragraph>
      <Radio.Group
        optionType="button"
        buttonStyle="solid"
        disabled={!data || isLoading}
        value={data?.dailyGoal}
        onChange={(e) => void update({ dailyGoal: e.target.value as number })}
        options={[5, 10, 20, 30].map((value) => ({ label: `${value} odpowiedzi`, value }))}
      />
    </Card>
  )
}

function Pronunciation() {
  const settings = useAppSelector((state) => state.settings)
  const dispatch = useAppDispatch()
  const { available } = useSpeech()

  return (
    <Card title="Wymowa" style={{ marginTop: 16 }}>
      {!available && (
        <Typography.Paragraph type="secondary">
          Na tym urządzeniu nie ma angielskiego głosu, więc przyciski odsłuchu są ukryte. Zainstaluj głos
          angielski w ustawieniach systemu.
        </Typography.Paragraph>
      )}
      <Form layout="vertical">
        <Form.Item label="Akcent">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            value={settings.speechAccent}
            onChange={(e) => dispatch(setSpeechAccent(e.target.value as SpeechAccent))}
            options={[
              { label: 'Amerykański', value: 'en-US' },
              { label: 'Brytyjski', value: 'en-GB' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Tempo">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            value={settings.speechRate}
            onChange={(e) => dispatch(setSpeechRate(e.target.value as SpeechRate))}
            options={[
              { label: 'Wolne', value: 0.8 },
              { label: 'Normalne', value: 1 },
              { label: 'Szybkie', value: 1.2 },
            ]}
          />
        </Form.Item>
        <Form.Item label="Czytaj automatycznie po zmianie slajdu w lekcji">
          <Switch checked={settings.autoSpeak} onChange={(v) => dispatch(setAutoSpeak(v))} />
        </Form.Item>
        <Flex align="center" gap={12}>
          <SpeakButton speakKey="settings-test" parts={['went', 'gone']} label="Przetestuj głos" />
          <Typography.Text type="secondary">Przetestuj głos (went, gone)</Typography.Text>
        </Flex>
      </Form>
    </Card>
  )
}

function GeneralSettings() {
  const settings = useAppSelector((state) => state.settings)
  const dispatch = useAppDispatch()

  return (
    <>
      <Card title="Wygląd i quizy">
        <Form layout="vertical">
          <Form.Item label="Motyw">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              value={settings.themeMode}
              onChange={(e) => dispatch(setThemeMode(e.target.value as ThemeMode))}
              options={[
                { label: 'Jasny', value: 'light' },
                { label: 'Ciemny', value: 'dark' },
                { label: 'System', value: 'system' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Kompaktowy układ">
            <Switch checked={settings.compact} onChange={(v) => dispatch(setCompact(v))} />
          </Form.Item>
          <Form.Item label="Pokazuj wyjaśnienia po zakończeniu quizu">
            <Switch
              checked={settings.showExplanations}
              onChange={(v) => dispatch(setShowExplanations(v))}
            />
          </Form.Item>
          <Form.Item label="Losowa kolejność pytań w quizie">
            <Switch
              checked={settings.shuffleQuestions}
              onChange={(v) => dispatch(setShuffleQuestions(v))}
            />
          </Form.Item>
          <Button danger onClick={() => dispatch(resetSettings())}>
            Przywróć domyślne
          </Button>
        </Form>
      </Card>
      <DailyGoal />
      <Pronunciation />
      <ApiTokens />
      <Card title="Uwagi" style={{ marginTop: 16 }}>
        <Flex justify="space-between" align="center" wrap gap="middle">
          <Typography.Text type="secondary">Coś nie działa albo masz pomysł? Daj nam znać.</Typography.Text>
          <Button icon={<CommentOutlined />} onClick={() => dispatch(openFeedback())}>
            Zgłoś uwagę
          </Button>
        </Flex>
      </Card>
    </>
  )
}

/** Admin tabs are shown only to admins; the API enforces the permission regardless. */
export default function Settings() {
  const { isAdmin } = useAuth()

  const items = [
    { key: 'general', label: 'Ustawienia', children: <GeneralSettings /> },
    ...(isAdmin
      ? [
          { key: 'users', label: 'Użytkownicy', children: <UsersAdmin /> },
          { key: 'feedback', label: 'Uwagi', children: <FeedbackAdmin /> },
          { key: 'audit', label: 'Audyt', children: <AuditAdmin /> },
          { key: 'app', label: 'Aplikacja', children: <AppSettingsAdmin /> },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader title="Ustawienia" subtitle="Ustawienia zapisują się automatycznie w tej przeglądarce." />
      {items.length > 1 ? <Tabs items={items} destroyOnHidden /> : <GeneralSettings />}
    </>
  )
}
