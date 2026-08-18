import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import useSessionRecovery from './useSessionRecovery';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const clearPatient = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ clearPatient }),
}));

vi.mock('../config/firebase', () => ({ getFirebaseToken: vi.fn() }));

const wrapper = ({ children }) => <MemoryRouter future={routerFuture}>{children}</MemoryRouter>;

function handler() {
  return renderHook(() => useSessionRecovery(), { wrapper }).result.current;
}

beforeEach(() => {
  navigate.mockReset();
  clearPatient.mockReset();
});

describe('on a 401', () => {
  it('takes ownership of the error', () => {
    expect(handler()(new ApiError('Unauthorized', 401, null))).toBe(true);
  });

  it('clears the stored patient so no screen keeps rendering as if signed in', () => {
    handler()(new ApiError('Unauthorized', 401, null));

    expect(clearPatient).toHaveBeenCalledTimes(1);
  });

  it('replaces the history entry with sign-in and flags the expiry', () => {
    handler()(new ApiError('Unauthorized', 401, null));

    expect(navigate).toHaveBeenCalledWith('/', {
      replace: true,
      state: { sessionExpired: true },
    });
  });
});

describe('errors it deliberately leaves to the caller', () => {
  it('ignores a 403 — signed in but not permitted; signing in again will not help', () => {
    const handle = handler();

    expect(handle(new ApiError('Forbidden', 403, null))).toBe(false);
    expect(clearPatient).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores a 404 — that is someone else's record, not an expired session", () => {
    expect(handler()(new ApiError('Not found', 404, null))).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a 500', () => {
    expect(handler()(new ApiError('Server error', 500, null))).toBe(false);
  });

  it('ignores a plain Error, even one that looks like a 401', () => {
    const notApiError = Object.assign(new Error('Unauthorized'), { status: 401 });

    expect(handler()(notApiError)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a network failure with no status', () => {
    expect(handler()(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('handler identity', () => {
  it('is stable across re-renders so callers can use it in a dependency array', () => {
    const { result, rerender } = renderHook(() => useSessionRecovery(), { wrapper });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
