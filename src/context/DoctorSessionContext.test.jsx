import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DoctorSessionProvider,
  createDoctorSession,
  useDoctorSession,
} from './DoctorSessionContext';

const firebaseSignOut = vi.fn();
vi.mock('../config/firebase', () => ({
  firebaseSignOut: () => firebaseSignOut(),
}));

const STORAGE_KEY = 'oralscreen.doctorSession';
const wrapper = ({ children }) => <DoctorSessionProvider>{children}</DoctorSessionProvider>;

beforeEach(() => {
  firebaseSignOut.mockResolvedValue(undefined);
});

describe('createDoctorSession', () => {
  it('keeps the fields it is given', () => {
    expect(createDoctorSession({ doctorId: 'd1', name: 'Dr Rao', phoneNumber: '+919876543210' }))
      .toEqual({ doctorId: 'd1', name: 'Dr Rao', phoneNumber: '+919876543210' });
  });

  it('defaults a missing name to "Doctor" and the rest to empty strings', () => {
    expect(createDoctorSession({ doctorId: 'd1' })).toEqual({
      doctorId: 'd1',
      name: 'Doctor',
      phoneNumber: '',
    });
  });

  it('tolerates being called with no argument', () => {
    expect(createDoctorSession()).toEqual({ doctorId: '', name: 'Doctor', phoneNumber: '' });
  });

  it('holds no token — the session is profile data only', () => {
    const session = createDoctorSession({ doctorId: 'd1', token: 'should-not-persist' });
    expect(session).not.toHaveProperty('token');
  });
});

describe('useDoctorSession outside a provider', () => {
  it('throws rather than yielding null context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useDoctorSession())).toThrow(
      'useDoctorSession must be used inside DoctorSessionProvider'
    );
  });
});

describe('hydration from sessionStorage', () => {
  it('starts with no session when storage is empty', () => {
    const { result } = renderHook(() => useDoctorSession(), { wrapper });
    expect(result.current.session).toBeNull();
  });

  it('restores a stored session that has a doctorId', () => {
    const stored = createDoctorSession({ doctorId: 'd1', name: 'Dr Rao' });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useDoctorSession(), { wrapper });

    expect(result.current.session).toEqual(stored);
  });

  it('rejects a stored object with no doctorId — it cannot identify anyone', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Dr Rao' }));

    const { result } = renderHook(() => useDoctorSession(), { wrapper });

    expect(result.current.session).toBeNull();
  });

  it('discards corrupt JSON and wipes the bad entry', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-json');

    const { result } = renderHook(() => useDoctorSession(), { wrapper });

    expect(result.current.session).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('uses sessionStorage, not localStorage, so the session dies with the tab', () => {
    const { result } = renderHook(() => useDoctorSession(), { wrapper });

    act(() => result.current.setSession(createDoctorSession({ doctorId: 'd1' })));

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('setSession', () => {
  it('stores and exposes the new session', () => {
    const { result } = renderHook(() => useDoctorSession(), { wrapper });
    const session = createDoctorSession({ doctorId: 'd2', name: 'Dr Iyer' });

    act(() => result.current.setSession(session));

    expect(result.current.session).toEqual(session);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY))).toEqual(session);
  });
});

describe('endSession', () => {
  it('clears storage, state, and the Firebase user', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(createDoctorSession({ doctorId: 'd1' }))
    );
    const { result } = renderHook(() => useDoctorSession(), { wrapper });

    act(() => result.current.endSession());

    expect(result.current.session).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('context value identity', () => {
  it('is memoised — it changes only when the session does', () => {
    const { result, rerender } = renderHook(() => useDoctorSession(), { wrapper });
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);

    act(() => result.current.setSession(createDoctorSession({ doctorId: 'd1' })));
    expect(result.current).not.toBe(first);
  });
});
