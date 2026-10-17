import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeStreaks, isActiveDay, isValidTimeZone, lastSevenDays, localDay, shiftDay } from '../src/shared/quiz/streaks.ts'

test('localDay depends on the time zone (23:50 and 00:10 are different days in Warsaw)', () => {
  // 2026-06-10 21:50 UTC = 23:50 in Warsaw (UTC+2); 22:10 UTC = 00:10 next day
  assert.equal(localDay(new Date('2026-06-10T21:50:00Z'), 'Europe/Warsaw'), '2026-06-10')
  assert.equal(localDay(new Date('2026-06-10T22:10:00Z'), 'Europe/Warsaw'), '2026-06-11')
  assert.equal(localDay(new Date('2026-06-10T22:10:00Z'), 'UTC'), '2026-06-10')
  assert.equal(localDay(new Date('2026-06-10T22:10:00Z'), 'America/Los_Angeles'), '2026-06-10')
})

test('shiftDay is calendar arithmetic across month, year and DST boundaries', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30') // DST change in Europe
  assert.equal(shiftDay('2026-10-25', 1), '2026-10-26')
})

test('computeStreaks: empty history', () => {
  assert.deepEqual(computeStreaks([], '2026-06-10'), { current: 0, longest: 0, activeToday: false })
})

test('computeStreaks: a single active day is a streak of 1 (today)', () => {
  assert.deepEqual(computeStreaks(['2026-06-10'], '2026-06-10'), { current: 1, longest: 1, activeToday: true })
})

test('computeStreaks: the run ending yesterday is still alive today', () => {
  const r = computeStreaks(['2026-06-08', '2026-06-09'], '2026-06-10')
  assert.deepEqual(r, { current: 2, longest: 2, activeToday: false })
})

test('computeStreaks: a gap of a full day breaks the current streak but keeps the longest', () => {
  const r = computeStreaks(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-08'], '2026-06-10')
  assert.deepEqual(r, { current: 0, longest: 4, activeToday: false })
})

test('computeStreaks: spans DST change and ignores duplicates / unsorted input', () => {
  const r = computeStreaks(['2026-03-30', '2026-03-28', '2026-03-29', '2026-03-29'], '2026-03-30')
  assert.deepEqual(r, { current: 3, longest: 3, activeToday: true })
})

test('isActiveDay needs an answer or a lesson', () => {
  assert.equal(isActiveDay({ answered: 0, lessons: 0 }), false)
  assert.equal(isActiveDay({ answered: 1, lessons: 0 }), true)
  assert.equal(isActiveDay({ answered: 0, lessons: 1 }), true)
})

test('lastSevenDays fills gaps and ends today', () => {
  const week = lastSevenDays(new Map([['2026-06-09', { day: '2026-06-09', answered: 12, correct: 9, lessons: 1 }]]), '2026-06-10')
  assert.equal(week.length, 7)
  assert.equal(week[0].day, '2026-06-04')
  assert.equal(week[6].day, '2026-06-10')
  assert.equal(week[5].answered, 12)
  assert.equal(week[6].answered, 0)
})

test('isValidTimeZone', () => {
  assert.equal(isValidTimeZone('Europe/Warsaw'), true)
  assert.equal(isValidTimeZone('Mars/Olympus'), false)
})

test('isValidTimeZone validates zones', () => {
  assert.equal(isValidTimeZone('Europe/Warsaw'), true)
  assert.equal(isValidTimeZone('Not/AZone'), false)
})

test('isActiveDay counts answered or lessons', () => {
  assert.equal(isActiveDay({ answered: 0, lessons: 0 }), false)
  assert.equal(isActiveDay({ answered: 1, lessons: 0 }), true)
  assert.equal(isActiveDay({ answered: 0, lessons: 1 }), true)
})

test('lastSevenDays fills zeros for missing days', () => {
  const today = '2026-06-10'
  const byDay = new Map([['2026-06-10', { day: '2026-06-10', answered: 2, correct: 1, lessons: 0 }]])
  const res = lastSevenDays(byDay, today)
  assert.equal(res.length, 7)
  assert.equal(res[6].answered, 2)
  assert.equal(res[0].answered, 0)
})
