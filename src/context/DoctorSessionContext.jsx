import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'oralscreen.doctorSession';
const DoctorSessionContext = createContext(null);

function readStoredSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return value?.token ? value : null;
  } catch (_) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch (_) {
    return {};
  }
}

export function createDoctorSession(loginResponse) {
  const token = loginResponse?.token;
  const claims = decodeToken(token || '');
  return {
    doctorId: loginResponse?.doctorId || loginResponse?.doctor?.id || claims.doctorId || claims.sub || '',
    name: loginResponse?.name || loginResponse?.doctor?.name || claims.name || 'Doctor',
    token,
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
