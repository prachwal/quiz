import type { IrregularVerb } from '../../shared/quiz/types'

export type Accent = 'en-US' | 'en-GB'

export const speechSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/** Voice for the accent: exact language match first, then any English voice. */
export function pickVoice<T extends { lang: string }>(voices: T[], accent: Accent): T | undefined {
  const normalize = (lang: string) => lang.replace('_', '-').toLowerCase()
  return (
    voices.find((voice) => normalize(voice.lang) === accent.toLowerCase()) ??
    voices.find((voice) => normalize(voice.lang).startsWith('en'))
  )
}

/** Texts to read for a verb: base form followed by all accepted past forms. */
export const verbSpeechParts = (verb: Pick<IrregularVerb, 'base' | 'pastSimple' | 'pastParticiple'>) => [
  verb.base,
  ...verb.pastSimple,
  ...verb.pastParticiple,
]

// ---- tiny external store shared by all speak buttons (only one thing is read at a time) ----

let voices: SpeechSynthesisVoice[] = []
let activeKey: string | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (speechSupported) {
  const refresh = () => {
    voices = window.speechSynthesis.getVoices()
    notify()
  }
  refresh()
  // voices load asynchronously in most browsers
  window.speechSynthesis.addEventListener('voiceschanged', refresh)
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getVoices = () => voices
export const getActiveKey = () => activeKey

export function stopSpeaking() {
  if (!speechSupported) return
  activeKey = null
  window.speechSynthesis.cancel()
  notify()
}

export function speakParts(key: string, parts: string[], options: { accent: Accent; rate: number }) {
  if (!speechSupported || parts.length === 0) return
  window.speechSynthesis.cancel()
  activeKey = key
  notify()
  const voice = pickVoice(voices, options.accent)
  parts.forEach((text, i) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.accent
    utterance.rate = options.rate
    if (voice) utterance.voice = voice
    if (i === parts.length - 1) {
      const done = () => {
        // a newer read may already be active (cancel() fires `error` on the old one)
        if (activeKey === key) {
          activeKey = null
          notify()
        }
      }
      utterance.onend = done
      utterance.onerror = done
    }
    window.speechSynthesis.speak(utterance)
  })
}
