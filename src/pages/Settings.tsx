import { Button, Card, Form, Radio, Switch } from 'antd'
import PageHeader from '../components/PageHeader'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import ApiTokens from '../features/auth/ApiTokens'
import {
  resetSettings,
  setCompact,
  setShowExplanations,
  setShuffleQuestions,
  setThemeMode,
} from '../features/settings/settingsSlice'
import type { ThemeMode } from '../features/settings/settingsSlice'

export default function Settings() {
  const settings = useAppSelector((state) => state.settings)
  const dispatch = useAppDispatch()

  return (
    <>
      <PageHeader title="Ustawienia" subtitle="Ustawienia zapisują się automatycznie w tej przeglądarce." />
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
    </>
  )
}
