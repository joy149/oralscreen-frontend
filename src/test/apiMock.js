import { vi } from 'vitest';

/**
 * Replaces every method on the real `api` object with a spy that rejects by default.
 *
 * Used from a `vi.mock` factory, which is hoisted above every `const` in the test file —
 * so the factory cannot close over a locally built mock without hitting a TDZ error.
 * Pulling this in with a dynamic `import()` inside the factory sidesteps that entirely:
 *
 *   vi.mock('../api/client', async (importOriginal) => {
 *     const { mockApiModule } = await import('../test/apiMock.js');
 *     return mockApiModule(await importOriginal());
 *   });
 *   import { api } from '../api/client';   // now the mock
 *
 * Rejecting by default matters: a screen that calls an endpoint the test forgot to stub
 * fails naming that endpoint, rather than receiving `undefined` and quietly rendering an
 * empty state the test then asserts against.
 *
 * `ApiError` and the other real exports are preserved, so `instanceof` checks in
 * `useSessionRecovery` still behave.
 */
export function mockApiModule(actual) {
  const api = {};
  for (const [key, value] of Object.entries(actual.api)) {
    api[key] =
      typeof value === 'function'
        ? vi.fn(() => Promise.reject(new Error(`api.${key} was not stubbed in this test`)))
        : value;
  }
  return { ...actual, api };
}
