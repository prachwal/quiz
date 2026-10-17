import { App as AntdApp, ConfigProvider } from 'antd'
import { brandTheme } from './app/brandTheme'
import { useMemo } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAppSelector } from './app/hooks'
import AuthProvider from './features/auth/AuthProvider'
import RequireRole from './features/auth/RequireRole'
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

  const themeConfig = useMemo(() => brandTheme(resolved === 'dark', compact), [resolved, compact])

  return (
    <ConfigProvider theme={themeConfig}>
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="quizzes/new" element={<RequireRole role="admin"><QuizNew /></RequireRole>} />
              <Route path="quizzes/:id/edit" element={<RequireRole role="admin"><QuizEdit /></RequireRole>} />
              <Route path="quizzes/:id/play" element={<QuizPlay />} />
              <Route path="learn" element={<Learn />} />
              <Route path="learn/:courseId" element={<CourseView />} />
              <Route path="learn/:courseId/lessons/:lessonId" element={<LessonView />} />
              <Route path="verbs" element={<Verbs />} />
              <Route path="results" element={<Results />} />
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
