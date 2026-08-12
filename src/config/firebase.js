import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoPlaceholderKey',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'oralscreen-demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'oralscreen-demo',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef123456',
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Enable language matching browser / locale
auth.useDeviceLanguage();

/**
 * Retrieves the Firebase ID token for the currently authenticated user.
 * Returns null if no user is signed in or if retrieving token fails.
 */
export async function getFirebaseToken(forceRefresh = false) {
  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken(forceRefresh);
    }

    const user = await new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (currentUser) => {
          unsubscribe();
          resolve(currentUser);
        },
        (error) => {
          unsubscribe();
          reject(error);
        }
      );
    });

    if (!user) return null;
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.error('Failed to retrieve Firebase ID token:', err);
    return null;
  }
}

/**
 * Signs out the current Firebase user, clearing auth.currentUser.
 * Safe to call even if no user is signed in.
 */
export async function firebaseSignOut() {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Firebase signOut error (non-fatal):', err);
  }
}

export const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

/**
 * The container is created by `setupRecaptcha` and parented to <body> rather than rendered
 * by whichever screen needs it. A verifier is bound to its container element for life, and
 * we want one verifier to outlive the component that first asked for it (see
 * `getRecaptchaVerifier`), so the element cannot be React-owned — React would unmount it
 * out from under the widget.
 */

/** The one live verifier, plus the container it is bound to. */
let activeVerifier = null;
let activeContainerId = null;

/**
 * Builds a *fresh* verifier, destroying any existing one. This is the recovery path — for
 * normal use call `getRecaptchaVerifier`, which reuses.
 */
export function setupRecaptcha(containerId = RECAPTCHA_CONTAINER_ID) {
  const existing = document.getElementById(containerId);
  if (existing) {
    try {
      existing.remove();
    } catch (_) {
      // ignore
    }
  }

  const container = document.createElement('div');
  container.id = containerId;
  document.body.appendChild(container);

  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (_) {
      // ignore clear errors if widget was already unmounted
    }
    window.recaptchaVerifier = null;
  }

  // Remove any stale Google reCAPTCHA badge elements left in document body
  try {
    const badges = document.querySelectorAll('.grecaptcha-badge');
    badges.forEach((b) => b.remove());
  } catch (_) {
    // ignore
  }

  try {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {},
    });
  } catch (err) {
    console.warn('Error creating RecaptchaVerifier, recreating container:', err);
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {},
    });
  }

  activeVerifier = window.recaptchaVerifier;
  activeContainerId = containerId;
  return activeVerifier;
}

/**
 * The verifier for `containerId`, built once and then reused for every send.
 *
 * Reuse is safe — and is what the SDK expects: `_verifyPhoneNumber` calls `verifier._reset()`
 * in a `finally`, which resets the reCAPTCHA widget's single-use token while leaving the
 * rendered widget in place. Rebuilding per send (what this used to do) threw away a warmed
 * widget and paid to render a new one on every attempt.
 */
export function getRecaptchaVerifier(containerId = RECAPTCHA_CONTAINER_ID) {
  // The container has to still be in the document: the widget lives inside that element, so
  // if it has gone the verifier is dead and reuse would only fail later, on verify().
  const reusable =
    activeVerifier && activeContainerId === containerId && document.getElementById(containerId);
  return reusable ? activeVerifier : setupRecaptcha(containerId);
}

/**
 * Pre-loads reCAPTCHA so the first send does not pay for it.
 *
 * `new RecaptchaVerifier(...)` fetches nothing — the constructor only assigns fields. The
 * script download, widget render and iframe setup all happen inside `render()`, so calling
 * it here is what actually moves that ~1-3s off the critical path. Resolves either way;
 * a failed warm-up just means the send pays the cost as it used to.
 */
export function warmRecaptcha(containerId = RECAPTCHA_CONTAINER_ID) {
  try {
    const verifier = getRecaptchaVerifier(containerId);
    if (typeof verifier?.render !== 'function') return Promise.resolve(null);
    return Promise.resolve(verifier.render()).then(
      () => verifier,
      (err) => {
        console.warn('reCAPTCHA warm-up failed; the first send will load it instead:', err);
        return null;
      }
    );
  } catch (err) {
    console.warn('reCAPTCHA warm-up failed; the first send will load it instead:', err);
    return Promise.resolve(null);
  }
}

/**
 * Firebase's own messages are shaped for developers — "Firebase: Error (auth/too-many-
 * requests)." tells a patient nothing and looks broken. Anything not listed here falls back
 * to the caller's copy.
 */
const PHONE_AUTH_MESSAGES = {
  'auth/invalid-phone-number': 'That mobile number does not look right. Please check it and try again.',
  'auth/missing-phone-number': 'Please enter your mobile number.',
  'auth/too-many-requests': 'Too many attempts from this device. Please wait a few minutes and try again.',
  'auth/quota-exceeded': 'We could not send a code just now. Please try again in a moment.',
  'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
  'auth/captcha-check-failed': 'Verification failed. Please try again.',
  'auth/invalid-verification-code': 'That code is not correct. Please check it and try again.',
  'auth/code-expired': 'That code has expired. Request a new one.',
  'auth/session-expired': 'That code has expired. Request a new one.',
};

export function describePhoneAuthError(err, fallback) {
  return PHONE_AUTH_MESSAGES[err?.code] || fallback;
}

/**
 * Formats a 10-digit phone number into E.164 format (+91 for India default).
 */
export function formatE164Phone(phoneNumber, countryCode = '+91') {
  const digits = String(phoneNumber).replace(/\D/g, '');
  if (digits.length === 10) {
    return `${countryCode}${digits}`;
  }
  if (digits.length > 10 && String(phoneNumber).startsWith('+')) {
    return phoneNumber;
  }
  return `${countryCode}${digits.slice(-10)}`;
}

/**
 * Sends a 6-digit OTP SMS to the specified phone number via Firebase Auth.
 */
export async function sendFirebasePhoneOtp(phoneNumber, appVerifier) {
  const formattedPhone = formatE164Phone(phoneNumber);
  let verifier = appVerifier || window.recaptchaVerifier || getRecaptchaVerifier();

  try {
    const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
    window.confirmationResult = confirmationResult;
    return confirmationResult;
  } catch (err) {
    // If grecaptcha throws element removed error or verifier is invalid, reset and retry once
    const errorMsg = String(err?.message || err);
    if (errorMsg.includes('reCAPTCHA') || errorMsg.includes('client element has been removed')) {
      console.warn('reCAPTCHA element error caught. Resetting verifier and retrying OTP send...');
      verifier = setupRecaptcha();
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      window.confirmationResult = confirmationResult;
      return confirmationResult;
    }
    throw err;
  }
}
