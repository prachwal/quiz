import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickVoice, verbSpeechParts } from '../src/features/audio/speech.ts'

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
