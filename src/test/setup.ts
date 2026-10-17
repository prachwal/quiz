import '@testing-library/jest-dom/vitest'
import { vi, beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './msw'

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

if (!Element.prototype.animate) {
  // @ts-ignore
  Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel: () => {}, finish: () => {} })
}

if (!window.scrollTo) {
  // @ts-ignore
  window.scrollTo = () => {}
}

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// default fetch not needed; MSW intercepts relative URLs via jsdom origin

// jsdom's Request does not resolve relative URLs; patch it so RTK Query fetchBaseQuery works
const OriginalRequest = globalThis.Request
// @ts-ignore
globalThis.Request = class extends OriginalRequest {
  constructor(input: any, init?: any) {
    if (typeof input === 'string' && input.startsWith('/')) {
      super(`${window.location.origin}${input}`, init)
    } else {
      super(input, init)
    }
  }
}
