import { createContext, useContext, useEffect, useState } from 'react';

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
  const clearPatient = () => setPatientState(null);

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
