import { useCallback, useSyncExternalStore } from 'react'
import { useAppSelector } from '../../app/hooks'
import { getActiveKey, getVoices, speakParts, speechSupported, stopSpeaking, subscribe } from './speech'

/** Text-to-speech with the accent and rate from the settings. */
export function useSpeech() {
  const accent = useAppSelector((state) => state.settings.speechAccent)
  const rate = useAppSelector((state) => state.settings.speechRate)
  const voices = useSyncExternalStore(subscribe, getVoices)
  const activeKey = useSyncExternalStore(subscribe, getActiveKey)

  // hide the feature when the device has no English voice
  const available = speechSupported && voices.some((voice) => voice.lang.toLowerCase().startsWith('en'))

  const speak = useCallback(
    (key: string, parts: string[]) => {
      if (getActiveKey() === key) stopSpeaking()
      else speakParts(key, parts, { accent, rate })
    },
    [accent, rate],
  )

  return { available, activeKey, speak, stop: stopSpeaking }
}
