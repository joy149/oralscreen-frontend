import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Applied to every test file — see motionMock.jsx for why the real library can't be used.
vi.mock('motion/react', () => import('./motionMock.jsx'));

// jsdom implements neither of these, and several screens call them on mount
// (PhotoUpload's preview URLs, the doctor case image viewer).
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom has no layout engine, so anything measuring an element gets zeros.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom's HTMLMediaElement.play() throws "not implemented" and returns undefined, so
// `video.play().catch(...)` — which is correct against a real browser, where play()
// returns a Promise — blows up with a TypeError and takes the camera effect with it.
// Plain functions, not vi.fn(): `restoreMocks` clears a spy's implementation after every
// test, which would put play() back to returning undefined from the second test onwards.
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
