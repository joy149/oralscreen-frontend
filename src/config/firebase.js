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

/**
 * Initializes invisible reCAPTCHA on a given DOM container element ID.
 */
export function setupRecaptcha(containerId = 'recaptcha-container') {
  let container = document.getElementById(containerId);
  if (container) {
    try {
      container.remove();
    } catch (_) {
      // ignore
    }
  }

  container = document.createElement('div');
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

  return window.recaptchaVerifier;
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
  let verifier = appVerifier || window.recaptchaVerifier || setupRecaptcha();

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
