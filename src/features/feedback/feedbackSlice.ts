import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { FeedbackKind } from '../../shared/quiz/types'

interface FeedbackUiState {
  open: boolean
  /** Pre-selected type, e.g. "bug" when opened from the error screen. */
  kind: FeedbackKind
  /** Sentry event id of the error that led here. */
  sentryEventId?: string
}

const slice = createSlice({
  name: 'feedbackUi',
  initialState: { open: false, kind: 'idea' } as FeedbackUiState,
  reducers: {
    openFeedback(_state, action: PayloadAction<{ kind?: FeedbackKind; sentryEventId?: string } | undefined>) {
      return { open: true, kind: action.payload?.kind ?? 'idea', sentryEventId: action.payload?.sentryEventId }
    },
    closeFeedback(state) {
      state.open = false
    },
  },
})

export const { openFeedback, closeFeedback } = slice.actions
export default slice.reducer
