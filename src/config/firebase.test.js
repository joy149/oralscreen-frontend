import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = { useDeviceLanguage: vi.fn(), currentUser: null };

const initializeApp = vi.fn(() => ({ name: 'new-app' }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: 'existing-app' }));
const getAuth = vi.fn(() => mockAuth);
const onAuthStateChanged = vi.fn();
const signInWithPhoneNumber = vi.fn();
const signOut = vi.fn();
const RecaptchaVerifier = vi.fn();

vi.mock('firebase/app', () => ({
  initializeApp: (...a) => initializeApp(...a),
  getApps: (...a) => getApps(...a),
  getApp: (...a) => getApp(...a),
}));

vi.mock('firebase/auth', () => ({
  getAuth: (...a) => getAuth(...a),
  onAuthStateChanged: (...a) => onAuthStateChanged(...a),
  signInWithPhoneNumber: (...a) => signInWithPhoneNumber(...a),
  signOut: (...a) => signOut(...a),
  RecaptchaVerifier: class {
    constructor(...args) {
      return RecaptchaVerifier(...args) ?? this;
    }
  },
}));

async function loadModule() {
  vi.resetModules();
  return import('./firebase');
}

beforeEach(() => {
  mockAuth.currentUser = null;
  delete window.recaptchaVerifier;
  delete window.confirmationResult;
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('app initialisation', () => {
  it('initialises the Firebase app when none exists yet', async () => {
    getApps.mockReturnValue([]);
    await loadModule();

    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: expect.any(String),
        authDomain: expect.any(String),
        projectId: expect.any(String),
        appId: expect.any(String),
      })
    );
    expect(mockAuth.useDeviceLanguage).toHaveBeenCalled();
  });

  it('reuses the existing app instead of initialising twice', async () => {
    getApps.mockReturnValue([{ name: 'existing-app' }]);
    initializeApp.mockClear();
    await loadModule();

    expect(initializeApp).not.toHaveBeenCalled();
    expect(getApp).toHaveBeenCalled();
  });
});

describe('formatE164Phone', () => {
  it('prefixes +91 onto a bare 10-digit Indian number', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone('9876543210')).toBe('+919876543210');
  });

  it('strips separators before formatting', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone('98765 43210')).toBe('+919876543210');
    expect(formatE164Phone('987-654-3210')).toBe('+919876543210');
  });

  it('leaves an already-E.164 number alone', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone('+919876543210')).toBe('+919876543210');
  });

  it('honours a non-default country code', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone('2025550143', '+1')).toBe('+12025550143');
  });

  it('keeps the last 10 digits when given a longer number without a plus', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone('00919876543210')).toBe('+919876543210');
  });

  it('accepts a numeric argument', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone(9876543210)).toBe('+919876543210');
  });

  it('still prefixes a too-short number rather than throwing', async () => {
    const { formatE164Phone } = await loadModule();
    expect(formatE164Phone('12345')).toBe('+9112345');
  });
});

describe('getFirebaseToken', () => {
  it('returns the token from the already-signed-in user', async () => {
    const getIdToken = vi.fn().mockResolvedValue('tok');
    mockAuth.currentUser = { getIdToken };
    const { getFirebaseToken } = await loadModule();

    await expect(getFirebaseToken()).resolves.toBe('tok');
    expect(getIdToken).toHaveBeenCalledWith(false);
  });

  it('passes forceRefresh through', async () => {
    const getIdToken = vi.fn().mockResolvedValue('tok');
    mockAuth.currentUser = { getIdToken };
    const { getFirebaseToken } = await loadModule();

    await getFirebaseToken(true);
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('waits for the auth state to resolve when currentUser is not populated yet', async () => {
    const getIdToken = vi.fn().mockResolvedValue('late-tok');
    const unsubscribe = vi.fn();
    onAuthStateChanged.mockImplementation((_auth, next) => {
      queueMicrotask(() => next({ getIdToken }));
      return unsubscribe;
    });
    const { getFirebaseToken } = await loadModule();

    await expect(getFirebaseToken()).resolves.toBe('late-tok');
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('returns null when the auth state resolves to no user', async () => {
    onAuthStateChanged.mockImplementation((_auth, next) => {
      queueMicrotask(() => next(null));
      return vi.fn();
    });
    const { getFirebaseToken } = await loadModule();

    await expect(getFirebaseToken()).resolves.toBeNull();
  });

  it('returns null (never throws) when the auth listener errors', async () => {
    onAuthStateChanged.mockImplementation((_auth, _next, onError) => {
      queueMicrotask(() => onError(new Error('auth blew up')));
      return vi.fn();
    });
    const { getFirebaseToken } = await loadModule();

    await expect(getFirebaseToken()).resolves.toBeNull();
  });

  it('returns null when reading the token itself fails', async () => {
    mockAuth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error('revoked')) };
    const { getFirebaseToken } = await loadModule();

    await expect(getFirebaseToken()).resolves.toBeNull();
  });
});

describe('firebaseSignOut', () => {
  it('signs out through the SDK', async () => {
    signOut.mockResolvedValue(undefined);
    const { firebaseSignOut } = await loadModule();

    await firebaseSignOut();
    expect(signOut).toHaveBeenCalledWith(mockAuth);
  });

  it('treats a sign-out failure as non-fatal', async () => {
    signOut.mockRejectedValue(new Error('offline'));
    const { firebaseSignOut } = await loadModule();

    await expect(firebaseSignOut()).resolves.toBeUndefined();
  });
});

describe('setupRecaptcha', () => {
  it('creates the container element and stores the verifier on window', async () => {
    RecaptchaVerifier.mockReturnValue(undefined);
    const { setupRecaptcha } = await loadModule();

    const verifier = setupRecaptcha();

    expect(document.getElementById('recaptcha-container')).toBeTruthy();
    expect(window.recaptchaVerifier).toBe(verifier);
    expect(RecaptchaVerifier).toHaveBeenCalledWith(
      mockAuth,
      'recaptcha-container',
      expect.objectContaining({ size: 'invisible' })
    );
  });

  it('replaces a stale container rather than stacking a second one', async () => {
    const stale = document.createElement('div');
    stale.id = 'recaptcha-container';
    stale.dataset.stale = 'yes';
    document.body.appendChild(stale);
    const { setupRecaptcha } = await loadModule();

    setupRecaptcha();

    const containers = document.querySelectorAll('#recaptcha-container');
    expect(containers).toHaveLength(1);
    expect(containers[0].dataset.stale).toBeUndefined();
  });

  it('clears a previous verifier before creating a new one', async () => {
    const clear = vi.fn();
    window.recaptchaVerifier = { clear };
    const { setupRecaptcha } = await loadModule();

    setupRecaptcha();

    expect(clear).toHaveBeenCalled();
  });

  it('survives a previous verifier whose clear() throws', async () => {
    window.recaptchaVerifier = {
      clear: () => {
        throw new Error('already unmounted');
      },
    };
    const { setupRecaptcha } = await loadModule();

    expect(() => setupRecaptcha()).not.toThrow();
  });

  it('removes stale grecaptcha badges left in the body', async () => {
    const badge = document.createElement('div');
    badge.className = 'grecaptcha-badge';
    document.body.appendChild(badge);
    const { setupRecaptcha } = await loadModule();

    setupRecaptcha();

    expect(document.querySelectorAll('.grecaptcha-badge')).toHaveLength(0);
  });

  it('retries construction once when the verifier throws', async () => {
    RecaptchaVerifier.mockImplementationOnce(() => {
      throw new Error('element removed');
    }).mockImplementation(() => undefined);
    const { setupRecaptcha } = await loadModule();

    expect(() => setupRecaptcha()).not.toThrow();
    expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
  });

  it('honours a custom container id', async () => {
    RecaptchaVerifier.mockReturnValue(undefined);
    const { setupRecaptcha } = await loadModule();

    setupRecaptcha('my-captcha');

    expect(document.getElementById('my-captcha')).toBeTruthy();
  });
});

describe('sendFirebasePhoneOtp', () => {
  it('sends to the E.164 form of the number and caches the confirmation result', async () => {
    const confirmation = { confirm: vi.fn() };
    signInWithPhoneNumber.mockResolvedValue(confirmation);
    const verifier = { id: 'v' };
    const { sendFirebasePhoneOtp } = await loadModule();

    const result = await sendFirebasePhoneOtp('9876543210', verifier);

    expect(signInWithPhoneNumber).toHaveBeenCalledWith(mockAuth, '+919876543210', verifier);
    expect(result).toBe(confirmation);
    expect(window.confirmationResult).toBe(confirmation);
  });

  it('reuses the verifier already on window when none is passed', async () => {
    signInWithPhoneNumber.mockResolvedValue({});
    window.recaptchaVerifier = { id: 'window-verifier' };
    const { sendFirebasePhoneOtp } = await loadModule();

    await sendFirebasePhoneOtp('9876543210');

    expect(signInWithPhoneNumber).toHaveBeenCalledWith(
      mockAuth,
      '+919876543210',
      window.recaptchaVerifier
    );
  });

  it('sets up a verifier when there is none at all', async () => {
    signInWithPhoneNumber.mockResolvedValue({});
    RecaptchaVerifier.mockReturnValue(undefined);
    const { sendFirebasePhoneOtp } = await loadModule();

    await sendFirebasePhoneOtp('9876543210');

    expect(RecaptchaVerifier).toHaveBeenCalled();
    expect(document.getElementById('recaptcha-container')).toBeTruthy();
  });

  it('rebuilds the verifier and retries once on a reCAPTCHA error', async () => {
    RecaptchaVerifier.mockReturnValue(undefined);
    const confirmation = { confirm: vi.fn() };
    signInWithPhoneNumber
      .mockRejectedValueOnce(new Error('reCAPTCHA client element has been removed'))
      .mockResolvedValueOnce(confirmation);
    const { sendFirebasePhoneOtp } = await loadModule();

    await expect(sendFirebasePhoneOtp('9876543210', { id: 'stale' })).resolves.toBe(confirmation);
    expect(signInWithPhoneNumber).toHaveBeenCalledTimes(2);
  });

  it('rethrows errors that are not reCAPTCHA related — e.g. quota exceeded', async () => {
    signInWithPhoneNumber.mockRejectedValue(new Error('auth/too-many-requests'));
    const { sendFirebasePhoneOtp } = await loadModule();

    await expect(sendFirebasePhoneOtp('9876543210', { id: 'v' })).rejects.toThrow(
      'auth/too-many-requests'
    );
    expect(signInWithPhoneNumber).toHaveBeenCalledTimes(1);
  });
});
