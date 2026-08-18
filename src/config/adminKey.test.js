import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAdminKey, readAdminKey, saveAdminKey } from './adminKey';

const STORAGE_KEY = 'oralscreen.adminKey';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin key storage', () => {
  it('returns an empty string when nothing has been saved', () => {
    expect(readAdminKey()).toBe('');
  });

  it('round-trips a saved key', () => {
    saveAdminKey('s3cret');
    expect(readAdminKey()).toBe('s3cret');
  });

  it('holds the key in sessionStorage, not localStorage — it must die with the tab', () => {
    saveAdminKey('s3cret');

    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('s3cret');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears the key', () => {
    saveAdminKey('s3cret');
    clearAdminKey();

    expect(readAdminKey()).toBe('');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('when storage is unavailable (private browsing)', () => {
  it('reads as empty rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });

    expect(readAdminKey()).toBe('');
  });

  it('swallows a failed write so the in-memory React state still works', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied');
    });

    expect(() => saveAdminKey('s3cret')).not.toThrow();
  });

  it('swallows a failed clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied');
    });

    expect(() => clearAdminKey()).not.toThrow();
  });
});
