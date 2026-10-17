import { ConfigProvider, theme } from 'antd'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAppSelector } from './app/hooks'
import { useResolvedTheme } from './app/useResolvedTheme'
import AppLayout from './components/AppLayout'
import About from './pages/About'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import Settings from './pages/Settings'

export default function App() {
  const resolved = useResolvedTheme()
  const compact = useAppSelector((state) => state.settings.compact)

  const algorithm = [resolved === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm]
  if (compact) algorithm.push(theme.compactAlgorithm)

  return (
    <ConfigProvider theme={{ algorithm, token: { borderRadius: 10 } }}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}
