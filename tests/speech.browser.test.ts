import assert from 'node:assert/strict'
import { test } from 'node:test'

test('speech module with window mock covers store and speakParts', async () => {
  const utterances: any[] = []
  const synth = {
    getVoices: () => [{ lang: 'en_US' }],
    cancel: () => {},
    speak: (u: any) => { utterances.push(u) },
    addEventListener: () => {},
  }
  // @ts-ignore
  globalThis.window = { speechSynthesis: synth }
  // @ts-ignore
  globalThis.SpeechSynthesisUtterance = function (text: string) { return { text, lang: '', rate: 1, voice: null, onend: null, onerror: null } }
  const speech = await import('../src/features/audio/speech.ts')
  assert.equal(speech.speechSupported, true)
  assert.equal(speech.getVoices().length, 1)
  assert.equal(speech.pickVoice(speech.getVoices(), 'en-US')?.lang, 'en_US')
  speech.stopSpeaking()
  speech.speakParts('key', ['hello', 'world'], { accent: 'en-US', rate: 1.2 })
  assert.equal(speech.getActiveKey(), 'key')
  // trigger done callback via onend of last utterance
  const last = utterances[utterances.length - 1]
  if (last && typeof last.onend === 'function') last.onend()
  assert.equal(speech.getActiveKey(), null)
  // subscribe/unsubscribe
  const unsub = speech.subscribe(() => {})
  unsub()
})
