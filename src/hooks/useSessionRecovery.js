import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { usePatient } from '../context/PatientContext';

/**
 * Turns an expired patient session into a route back to sign-in.
 *
 * <p>The doctor screens have handled this since the token work; the patient screens never
 * did. A patient whose Firebase session had gone — cleared storage, a revoked token, a
 * sign-out on another tab — kept a `patient` object in localStorage, so every screen still
 * rendered and every API call 401'd. What they saw was "Assessments unavailable" above a
 * Retry button that could not possibly succeed, with nothing anywhere offering to sign in
 * again.
 *
 * <p>Returns a handler that reports whether it took ownership of the error, so callers read
 * as `if (!handleAuthError(err)) setError(err);` — mirroring `DoctorCase`.
 *
 * <p>Only 401. A 403 means signed in but not allowed, and a 404 from `AccessGuard` means
 * someone else's record; neither is fixed by signing in again, and treating them as expiry
 * would log people out for asking the wrong question.
 */
export default function useSessionRecovery() {
  const navigate = useNavigate();
  const { clearPatient } = usePatient();

  return useCallback((err) => {
    if (err instanceof ApiError && err.status === 401) {
      // Drop the stored patient too: leaving it behind is what let every screen keep
      // rendering as though someone were signed in.
      clearPatient();
      navigate('/', { replace: true, state: { sessionExpired: true } });
      return true;
    }
    return false;
  }, [clearPatient, navigate]);
}
