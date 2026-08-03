import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useDoctorSession } from '../../context/DoctorSessionContext';
import LoadingState from '../shared/LoadingState';

/**
 * Gates the doctor screens on the **Firebase auth state**, not just on what is in
 * sessionStorage.
 *
 * Checking storage alone let a reload straight to /doctor mount the screen while
 * `auth.currentUser` was null — the guard passed, then every API call 401'd. Firebase is the
 * source of truth for "is this person signed in"; the stored session is only the doctor's
 * profile for rendering.
 */
export default function DoctorRoute() {
  const { session, endSession } = useDoctorSession();
  const location = useLocation();
  const [signedIn, setSignedIn] = useState(null); // null = still resolving

  useEffect(() => onAuthStateChanged(auth, (user) => setSignedIn(!!user)), []);

  // A stored session with no live Firebase user is stale. Drop it rather than just
  // redirecting: the login screen treats a present session as "already signed in", so
  // leaving it in place makes the two screens bounce off each other indefinitely.
  useEffect(() => {
    if (signedIn === false && session) {
      endSession();
    }
  }, [signedIn, session, endSession]);

  if (signedIn === null) {
    return <LoadingState />;
  }

  if (!signedIn || !session) {
    return <Navigate to="/doctor/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
