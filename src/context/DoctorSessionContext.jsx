import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { firebaseSignOut } from '../config/firebase';

const STORAGE_KEY = 'oralscreen.doctorSession';
const DoctorSessionContext = createContext(null);

/**
 * The doctor session holds **profile data only** — no token.
 *
 * It used to store the Firebase ID token captured once at login, and every doctor API call
 * sent that stored copy. Firebase tokens expire in about an hour, so a doctor would be thrown
 * back to the login screen mid-review. Tokens are now read fresh from the Firebase SDK on each
 * request (see `api/client.js`), and the real proof of identity is the Firebase auth state,
 * which `DoctorRoute` checks.
 */
function readStoredSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return value?.doctorId ? value : null;
  } catch (_) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function createDoctorSession({ doctorId, name, phoneNumber } = {}) {
  return {
    doctorId: doctorId || '',
    name: name || 'Doctor',
    phoneNumber: phoneNumber || '',
  };
}

export function DoctorSessionProvider({ children }) {
  const [session, setSessionState] = useState(readStoredSession);

  const setSession = useCallback((nextSession) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setSessionState(nextSession);
  }, []);

  const endSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionState(null);
    firebaseSignOut();
  }, []);

  const value = useMemo(
    () => ({ session, setSession, endSession }),
    [endSession, session, setSession]
  );

  return (
    <DoctorSessionContext.Provider value={value}>
      {children}
    </DoctorSessionContext.Provider>
  );
}

export function useDoctorSession() {
  const value = useContext(DoctorSessionContext);
  if (!value) throw new Error('useDoctorSession must be used inside DoctorSessionProvider');
  return value;
}
