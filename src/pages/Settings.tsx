import { CommentOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Form, Radio, Switch, Tabs, Typography } from 'antd'
import PageHeader from '../components/PageHeader'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import AuditAdmin from '../features/admin/AuditAdmin'
import FeedbackAdmin from '../features/admin/FeedbackAdmin'
import UsersAdmin from '../features/admin/UsersAdmin'
import ApiTokens from '../features/auth/ApiTokens'
import { useAuth } from '../features/auth/useAuth'
import { openFeedback } from '../features/feedback/feedbackSlice'
import {
  resetSettings,
  setCompact,
  setShowExplanations,
  setShuffleQuestions,
  setThemeMode,
} from '../features/settings/settingsSlice'
import type { ThemeMode } from '../features/settings/settingsSlice'

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
