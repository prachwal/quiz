import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
globalThis.ResizeObserver = ResizeObserverMock

// Avoid real network in component tests; default to a 404 so RTK Query sets `error`/no data
// without throwing unhandled promise rejections.
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 404,
  json: async () => ({}),
  text: async () => '',
})

if (!Element.prototype.animate) {
  // @ts-ignore
  Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel: () => {}, finish: () => {} })
}

if (!window.scrollTo) {
  // @ts-ignore
  window.scrollTo = () => {}
}
