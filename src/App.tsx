import { App as AntdApp, ConfigProvider, theme } from 'antd'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAppSelector } from './app/hooks'
import AuthProvider from './features/auth/AuthProvider'
import RequireAuth from './features/auth/RequireAuth'
import { useResolvedTheme } from './app/useResolvedTheme'
import AppLayout from './components/AppLayout'
import About from './pages/About'
import CourseView from './pages/CourseView'
import Home from './pages/Home'
import Learn from './pages/Learn'
import LessonView from './pages/LessonView'
import NotFound from './pages/NotFound'
import QuizEdit from './pages/QuizEdit'
import QuizNew from './pages/QuizNew'
import QuizPlay from './pages/QuizPlay'
import Results from './pages/Results'
import Verbs from './pages/Verbs'
import Settings from './pages/Settings'

export default function App() {
  const resolved = useResolvedTheme()
  const compact = useAppSelector((state) => state.settings.compact)

  const algorithm = [resolved === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm]
  if (compact) algorithm.push(theme.compactAlgorithm)

  return (
    <ConfigProvider theme={{ algorithm, token: { borderRadius: 10 } }}>
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="quizzes/new" element={<RequireAuth role="admin"><QuizNew /></RequireAuth>} />
              <Route path="quizzes/:id/edit" element={<RequireAuth role="admin"><QuizEdit /></RequireAuth>} />
              <Route path="quizzes/:id/play" element={<QuizPlay />} />
              <Route path="learn" element={<Learn />} />
              <Route path="learn/:courseId" element={<CourseView />} />
              <Route path="learn/:courseId/lessons/:lessonId" element={<LessonView />} />
              <Route path="verbs" element={<Verbs />} />
              <Route path="results" element={<RequireAuth><Results /></RequireAuth>} />
              <Route path="about" element={<About />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
