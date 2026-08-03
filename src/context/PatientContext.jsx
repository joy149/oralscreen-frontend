import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { firebaseSignOut } from '../config/firebase';

const STORAGE_KEY = 'oralscreen_patient';

const PatientContext = createContext(null);

function readStoredPatient() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function PatientProvider({ children }) {
  const [patient, setPatientState] = useState(readStoredPatient);

  useEffect(() => {
    if (patient) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patient));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [patient]);

  const setPatient = (next) => setPatientState(next);

  const clearPatient = useCallback(() => {
    setPatientState(null);
    firebaseSignOut();
  }, []);

  return (
    <PatientContext.Provider value={{ patient, setPatient, clearPatient }}>
      {children}
    </PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatient must be used within a PatientProvider');
  return ctx;
}
