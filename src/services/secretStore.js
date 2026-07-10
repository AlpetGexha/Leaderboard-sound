const STORAGE_KEY = 'arena-secret';
const DEFAULT_SECRET = 'arena-dev-secret';

export function createSecretStore(storage = window.localStorage) {
  return {
    get() {
      return storage.getItem(STORAGE_KEY) || DEFAULT_SECRET;
    },
    set(value) {
      storage.setItem(STORAGE_KEY, value);
    },
    // Clears the stored secret so the next read falls back to the dev default.
    reset() {
      storage.removeItem(STORAGE_KEY);
      return DEFAULT_SECRET;
    }
  };
}
