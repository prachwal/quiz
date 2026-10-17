import { describe, it, expect } from 'vitest'
import { selectedNavKey, navItems } from './navItems'

describe('navItems', () => {
  it('maps paths to nav keys', () => {
    expect(selectedNavKey('/')).toBe('/')
    expect(selectedNavKey('/learn/courses')).toBe('/learn')
    expect(selectedNavKey('/quizzes/123/play')).toBe('/')
    expect(selectedNavKey('/settings')).toBe('/settings')
  })

  it('has tab items', () => {
    expect(navItems.some((i) => i.tab)).toBe(true)
  })
})
