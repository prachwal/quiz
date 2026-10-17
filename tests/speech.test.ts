import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickVoice, verbSpeechParts, speechSupported, getVoices, getActiveKey, stopSpeaking, speakParts } from '../src/features/audio/speech.ts'

const voices = [{ lang: 'pl-PL' }, { lang: 'en_GB' }, { lang: 'en-US' }, { lang: 'de-DE' }]

test('pickVoice prefers the exact accent, tolerating underscores', () => {
  assert.equal(pickVoice(voices, 'en-US')?.lang, 'en-US')
  assert.equal(pickVoice(voices, 'en-GB')?.lang, 'en_GB')
})

test('pickVoice falls back to any English voice, else undefined', () => {
  assert.equal(pickVoice([{ lang: 'pl-PL' }, { lang: 'en-AU' }], 'en-US')?.lang, 'en-AU')
  assert.equal(pickVoice([{ lang: 'pl-PL' }], 'en-US'), undefined)
})

test('verbSpeechParts lists the base form and all accepted past forms in order', () => {
  assert.deepEqual(verbSpeechParts({ base: 'learn', pastSimple: ['learnt', 'learned'], pastParticiple: ['learnt', 'learned'] }), [
    'learn',
    'learnt',
    'learned',
    'learnt',
    'learned',
  ])
})

test('speechSupported is false in node', () => {
  assert.equal(speechSupported, false)
})

test('getVoices returns empty array in node', () => {
  assert.deepEqual(getVoices(), [])
})

test('getActiveKey is null initially', () => {
  assert.equal(getActiveKey(), null)
})

test('stopSpeaking does not throw in node', () => {
  assert.doesNotThrow(() => stopSpeaking())
})

test('speakParts does nothing in node', () => {
  assert.doesNotThrow(() => speakParts('k', ['a'], { accent: 'en-US', rate: 1 }))
})

test('verbSpeechParts includes base and all forms', () => {
  assert.deepEqual(verbSpeechParts({ base: 'go', pastSimple: ['went'], pastParticiple: ['gone'] }), ['go', 'went', 'gone'])
})
