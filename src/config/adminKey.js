/**
 * Runtime storage for the admin API key.
 *
 * The key used to live in `VITE_ADMIN_KEY`. Vite inlines every `VITE_*` variable into the
 * bundle at build time, so it was being served to every visitor — `.env` being gitignored made
 * no difference. Anyone could read it out of the JS and approve doctors.
 *
 * It is now typed by the admin at runtime and held only for the life of the browser tab.
 * `sessionStorage` (not `localStorage`) so it dies when the tab closes.
 *
 * This is a mitigation, not a fix: a shared password in a browser is still a shared password,
 * and it is readable by any XSS on the page. The real fix is to drop `X-Admin-Key` entirely
 * and gate the admin API on a Firebase custom claim (`role: "admin"`), so the console
 * authenticates with the same ID token as the rest of the app. That needs a backend change —
 * see `docs/09_FRONTEND_AUTH_CHANGES.md` §F1.
 */

const STORAGE_KEY = 'oralscreen.adminKey';

export function readAdminKey() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function saveAdminKey(key) {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch (_) {
    // Private browsing with storage disabled — the in-memory React state still works
    // for this page view.
  }
}

export function clearAdminKey() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
}
