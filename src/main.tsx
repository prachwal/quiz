import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App.tsx'
import { Sentry, initSentry } from './app/sentry'
import { store } from './app/store'
import ErrorFallback from './features/feedback/ErrorFallback'
import './index.css'

initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <Sentry.ErrorBoundary fallback={({ eventId }) => <ErrorFallback eventId={eventId} />}>
        <App />
      </Sentry.ErrorBoundary>
    </Provider>
  </StrictMode>,
)
