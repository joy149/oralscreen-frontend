import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientProvider, usePatient } from './PatientContext';

const firebaseSignOut = vi.fn();
vi.mock('../config/firebase', () => ({
  firebaseSignOut: () => firebaseSignOut(),
}));

const STORAGE_KEY = 'oralscreen_patient';
const wrapper = ({ children }) => <PatientProvider>{children}</PatientProvider>;

beforeEach(() => {
  firebaseSignOut.mockResolvedValue(undefined);
});

describe('usePatient outside a provider', () => {
  it('throws a named error rather than yielding undefined context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => usePatient())).toThrow(
      'usePatient must be used within a PatientProvider'
    );
  });
});

describe('hydration from localStorage', () => {
  it('starts with no patient when storage is empty', () => {
    const { result } = renderHook(() => usePatient(), { wrapper });
    expect(result.current.patient).toBeNull();
  });

  it('restores a stored patient on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'p1', name: 'Asha' }));

    const { result } = renderHook(() => usePatient(), { wrapper });

    expect(result.current.patient).toEqual({ id: 'p1', name: 'Asha' });
  });

  it('ignores corrupt JSON rather than crashing the app on boot', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const { result } = renderHook(() => usePatient(), { wrapper });

    expect(result.current.patient).toBeNull();
  });
});

describe('setPatient', () => {
  it('persists the patient to localStorage', () => {
    const { result } = renderHook(() => usePatient(), { wrapper });

    act(() => result.current.setPatient({ id: 'p2', name: 'Ravi' }));

    expect(result.current.patient).toEqual({ id: 'p2', name: 'Ravi' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual({ id: 'p2', name: 'Ravi' });
  });

  it('overwrites a previously stored patient', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'p1' }));
    const { result } = renderHook(() => usePatient(), { wrapper });

    act(() => result.current.setPatient({ id: 'p9' }));

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual({ id: 'p9' });
  });
});

describe('clearPatient', () => {
  it('drops the stored patient and signs out of Firebase', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'p1' }));
    const { result } = renderHook(() => usePatient(), { wrapper });

    act(() => result.current.clearPatient());

    expect(result.current.patient).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps a stable identity across renders so effects do not re-fire', () => {
    const { result, rerender } = renderHook(() => usePatient(), { wrapper });
    const first = result.current.clearPatient;

    act(() => result.current.setPatient({ id: 'p1' }));
    rerender();

    expect(result.current.clearPatient).toBe(first);
  });
});

describe('consumer components', () => {
  it('re-renders every consumer when the patient changes', async () => {
    const user = userEvent.setup();

    function Consumer() {
      const { patient, setPatient, clearPatient } = usePatient();
      return (
        <div>
          <span data-testid="name">{patient?.name ?? 'signed out'}</span>
          <button onClick={() => setPatient({ id: 'p1', name: 'Asha' })}>sign in</button>
          <button onClick={clearPatient}>sign out</button>
        </div>
      );
    }

    render(
      <PatientProvider>
        <Consumer />
      </PatientProvider>
    );

    expect(screen.getByTestId('name')).toHaveTextContent('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));
    expect(screen.getByTestId('name')).toHaveTextContent('Asha');

    await user.click(screen.getByRole('button', { name: 'sign out' }));
    expect(screen.getByTestId('name')).toHaveTextContent('signed out');
  });
});
