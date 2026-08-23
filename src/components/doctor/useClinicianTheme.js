import { useCallback, useEffect, useState } from 'react';
import '../../styles/clinician-theme.css';

const STORAGE_KEY = 'oralscreen.clinicianTheme';
const THEMES = ['dark', 'light'];

/**
 * Light/dark for the clinician screens only.
 *
 * <p>Dark is the default because the deep band is where the clinician identity was
 * established — `/doctor/login` and the landing page's staff-facing sections both use it,
 * so a reviewer signing in meets the surface they already associate with the clinical
 * side. Light exists because a reviewer sits with these screens for a whole shift, in
 * whatever the room's lighting happens to be, and that is their call rather than ours.
 *
 * <p>The choice is stored per browser rather than on the doctor's profile: it is a
 * property of the screen they are sitting at, not of who they are, and a reviewer moving
 * between a bright clinic terminal and a dim office wants each to keep its own setting.
 *
 * <p>`localStorage`, not the `sessionStorage` the doctor session uses — the session is
 * deliberately cleared when the tab closes, and a display preference outliving a sign-out
 * is the point.
 *
 * <p>The attribute goes on <html> so it can be set from anywhere, but the token overrides
 * it triggers are scoped to `.doctor-shell` / `.doctor-login` in clinician-theme.css, so
 * they cannot reach a patient screen. It is removed on unmount regardless.
 */
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'dark';
  } catch (_) {
    // Private browsing can throw on access alone.
    return 'dark';
  }
}

export default function useClinicianTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-clinician-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      // A preference that cannot be persisted still applies for this visit.
    }
  }, [theme]);

  useEffect(
    () => () => document.documentElement.removeAttribute('data-clinician-theme'),
    []
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
